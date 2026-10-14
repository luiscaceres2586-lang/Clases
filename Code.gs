/*****************************************************************************
 *  AULA GAMIFICADA · SERVIDOR (Google Apps Script + Google Sheets)
 *  Profe Luis · Colegio Integrado Simón Bolívar, Sede San Martín · Cúcuta
 *
 *  Qué hace:
 *   - Registro e inicio de sesión de estudiantes con apodo + PIN de 4 números
 *   - Guarda XP, monedas, racha y avances en esta hoja de cálculo (en línea)
 *   - Entrega el ranking por grado y por grupo, y quién está en línea
 *   - Guarda el progreso de cada clase para continuar desde cualquier equipo
 *
 *  Seguridad:
 *   - El navegador NUNCA toca la hoja: solo habla con este servidor.
 *   - El PIN se guarda cifrado (SHA-256 + sal + secreto que no está en la hoja).
 *   - 5 intentos fallidos bloquean el perfil 15 minutos.
 *   - La sesión es un token firmado (HMAC) que vence a los 60 días.
 *   - El XP lo calcula el servidor (el estudiante no puede inventarlo) y tiene topes.
 *   - Para registrarse hace falta el "código de registro" que da el Profe.
 *   - No se piden datos personales: solo apodo, grupo, avatar y PIN.
 *****************************************************************************/

var CFG = {
  HOJA_PERFILES: 'Perfiles',
  HOJA_RESUMEN:  'Resumen por grupo',
  HOJA_AVANCES:  'Avances',
  HOJA_SEG:      '_Seguridad',
  HOJA_ESTADOS:  '_Estados',
  ZONA: 'America/Bogota',
  GRUPOS: ['401', '402', '403', '501', '502'],   // <- cambia aquí tus grupos
  MUNDOS: ['a4', 'a5', 't4', 't5'],
  AVATARES: 8,
  MAX_INTENTOS: 5,
  BLOQUEO_MIN: 15,
  TOKEN_DIAS: 60,
  XP_VISITA: 10, MON_VISITA: 2,
  XP_BONO: 5,    MON_BONO: 1,
  XP_POR_NIVEL: 50,
  MAX_PUNTOS_ACCION: 50,
  MAX_XP_ACTIVIDAD_DIA: 200,
  MAX_CLAVES: 500,
  MAX_ESTADO_CHARS: 15000,
  MAX_ESTADOS: 60,
  EN_LINEA_SEG: 240,
  CACHE_RANKING_SEG: 20,
  MAX_REGISTROS_10MIN: 150,
  CODIGO_INICIAL: 'SIMON2026'
};

// Posiciones de columna (base 0)
var P = { ID: 0, APODO: 1, AVATAR: 2, GRADO: 3, GRUPO: 4, NIVEL: 5, XP: 6, MON: 7, RACHA: 8, ULT: 9, CREADO: 10, ESTADO: 11 };
var S = { ID: 0, HASH: 1, SAL: 2, VER: 3, INT: 4, BLOQ: 5, PROG: 6 };
var NC_P = 12, NC_S = 7;

/* ============================== UTILIDADES ============================== */
function ErrorApi(msg, codigo) { this.message = msg; this.codigo = codigo || 'error'; this.esApi = true; }

function ahora() { return Date.now(); }
function props() { return PropertiesService.getScriptProperties(); }
function cache() { return CacheService.getScriptCache(); }
var _ss = null;
function libro() {
  if (_ss) return _ss;
  var id = props().getProperty('SS_ID');
  if (!id) throw new ErrorApi('El servidor aún no está configurado.', 'config');
  _ss = SpreadsheetApp.openById(id);
  return _ss;
}
function hoja(nombre) {
  var h = libro().getSheetByName(nombre);
  if (!h) throw new ErrorApi('Falta la hoja "' + nombre + '". Ejecuta configurar().', 'config');
  return h;
}
function leerTabla(h, nCols) {
  var n = h.getLastRow();
  if (n < 2) return [];
  return h.getRange(2, 1, n - 1, nCols).getValues();
}
function hoyStr() { return Utilities.formatDate(new Date(ahora()), CFG.ZONA, 'yyyy-MM-dd'); }
function horaStr() { return Utilities.formatDate(new Date(ahora()), CFG.ZONA, 'yyyy-MM-dd HH:mm'); }
function diasEntre(a, b) { // b - a en días, con textos yyyy-MM-dd
  var da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  var db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86400000);
}
function diaSemana(a) { return new Date(Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))).getUTCDay(); } // 0=dom
function nivelDe(xp) { return Math.floor(xp / CFG.XP_POR_NIVEL) + 1; }
function hex(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) { s += ((bytes[i] & 255) + 256).toString(16).slice(1); }
  return s;
}
function aleatorio(n) {
  var s = '';
  while (s.length < n) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, n);
}
function sinTildes(t) {
  return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function igualSeguro(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function conLock(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { throw new ErrorApi('El servidor está ocupado. Intenta de nuevo en unos segundos.', 'ocupado'); }
  try { return fn(); } finally { try { lock.releaseLock(); } catch (e2) {} }
}

/* ============================ CIFRADO Y TOKEN ============================ */
function hashPin(pin, sal) {
  var pepper = props().getProperty('PEPPER') || '';
  return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pepper + ':' + sal + ':' + pin, Utilities.Charset.UTF_8));
}
function firmar(texto) {
  var secreto = props().getProperty('SECRETO');
  if (!secreto) throw new ErrorApi('El servidor aún no está configurado.', 'config');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(texto, secreto));
}
function crearToken(id, ver) {
  var exp = Math.floor(ahora() / 1000) + CFG.TOKEN_DIAS * 86400;
  var b = Utilities.base64EncodeWebSafe(id + '.' + exp + '.' + ver, Utilities.Charset.UTF_8);
  return b + '.' + firmar(b);
}
function leerToken(token) {
  var malo = new ErrorApi('Tu sesión venció. Entra de nuevo con tu PIN.', 'sesion');
  if (typeof token !== 'string' || token.length < 10 || token.length > 400) throw malo;
  var p = token.split('.');
  if (p.length !== 2) throw malo;
  if (!igualSeguro(firmar(p[0]), p[1])) throw malo;
  var carga;
  try { carga = Utilities.newBlob(Utilities.base64DecodeWebSafe(p[0])).getDataAsString().split('.'); } catch (e) { throw malo; }
  if (carga.length !== 3) throw malo;
  if (Number(carga[1]) < Math.floor(ahora() / 1000)) throw malo;
  return { id: carga[0], ver: carga[2] };
}

/* ============================== ACCESO A DATOS ============================ */
function buscarFila(h, col, valor, nCols) {
  var n = h.getLastRow();
  if (n < 2) return null;
  var datos = h.getRange(2, 1, n - 1, nCols).getValues();
  for (var i = 0; i < datos.length; i++) {
    if (String(datos[i][col]) === String(valor)) return { fila: i + 2, datos: datos[i] };
  }
  return null;
}
function cargarJugador(id) {
  var p = buscarFila(hoja(CFG.HOJA_PERFILES), P.ID, id, NC_P);
  var s = buscarFila(hoja(CFG.HOJA_SEG), S.ID, id, NC_S);
  if (!p || !s) return null;
  var prog;
  try { prog = JSON.parse(s.datos[S.PROG] || '{}'); } catch (e) { prog = {}; }
  prog.visitas = prog.visitas || {}; prog.claves = prog.claves || {};
  prog.xpDia = prog.xpDia || { f: '', n: 0 }; prog.ultimoBono = prog.ultimoBono || '';
  return { p: p.datos, filaP: p.fila, s: s.datos, filaS: s.fila, prog: prog };
}
function cargarPorApodo(apodo) {
  var clave = sinTildes(apodo);
  var filas = leerTabla(hoja(CFG.HOJA_PERFILES), NC_P);
  for (var i = 0; i < filas.length; i++) {
    if (sinTildes(filas[i][P.APODO]) === clave) return cargarJugador(String(filas[i][P.ID]));
  }
  return null;
}
function guardarJugador(j) {
  j.p[P.NIVEL] = nivelDe(Number(j.p[P.XP]));
  hoja(CFG.HOJA_PERFILES).getRange(j.filaP, 1, 1, NC_P).setValues([j.p]);
  j.s[S.PROG] = JSON.stringify(j.prog);
  hoja(CFG.HOJA_SEG).getRange(j.filaS, 1, 1, NC_S).setValues([j.s]);
  cache().remove('rk');
}
function registrarAvance(j, mundo, actividad, xp) {
  hoja(CFG.HOJA_AVANCES).appendRow([horaStr(), String(j.p[P.ID]), String(j.p[P.APODO]), mundo, actividad, xp]);
}
function perfilPropio(j) {
  var hoy = hoyStr(), vis = {};
  CFG.MUNDOS.forEach(function (m) { vis[m] = (j.prog.visitas[m] === hoy); });
  var xp = Number(j.p[P.XP]);
  return {
    id: String(j.p[P.ID]), apodo: String(j.p[P.APODO]), avatar: Number(j.p[P.AVATAR]),
    grado: Number(j.p[P.GRADO]), grupo: String(j.p[P.GRUPO]), nivel: nivelDe(xp), xp: xp,
    xpEnNivel: xp % CFG.XP_POR_NIVEL, xpPorNivel: CFG.XP_POR_NIVEL,
    monedas: Number(j.p[P.MON]), racha: Number(j.p[P.RACHA]), visitasHoy: vis, hoy: hoy
  };
}

/* ================================ RANKING ================================ */
function marcarEnLinea(id) { try { cache().put('on:' + id, '1', CFG.EN_LINEA_SEG); } catch (e) {} }
function construirRanking() {
  var c = cache(), lista = null, memo = c.get('rk');
  if (memo) { try { lista = JSON.parse(memo); } catch (e) { lista = null; } }
  if (!lista) {
    var filas = leerTabla(hoja(CFG.HOJA_PERFILES), NC_P);
    lista = [];
    filas.forEach(function (f) {
      if (!f[P.ID] || f[P.ESTADO] === 'Bloqueado') return;
      lista.push({ id: String(f[P.ID]), apodo: String(f[P.APODO]), avatar: Number(f[P.AVATAR]) || 1,
        grado: Number(f[P.GRADO]), grupo: String(f[P.GRUPO]), nivel: Number(f[P.NIVEL]) || 1,
        xp: Number(f[P.XP]) || 0, racha: Number(f[P.RACHA]) || 0 });
    });
    lista.sort(function (a, b) { return b.xp - a.xp || (a.apodo < b.apodo ? -1 : 1); });
    try { c.put('rk', JSON.stringify(lista), CFG.CACHE_RANKING_SEG); } catch (e) {}
  }
  var enLinea = {};
  for (var i = 0; i < lista.length; i += 50) {
    var claves = lista.slice(i, i + 50).map(function (x) { return 'on:' + x.id; });
    var got = c.getAll(claves);
    for (var k in got) { if (got[k]) enLinea[k.slice(3)] = true; }
  }
  var grupos = CFG.GRUPOS.map(function (g) {
    var n = 0, tot = 0, on = 0;
    lista.forEach(function (x) { if (x.grupo === g) { n++; tot += x.xp; if (enLinea[x.id]) on++; } });
    return { grupo: g, grado: Number(g.charAt(0)), estudiantes: n, xpTotal: tot, xpPromedio: n ? Math.round(tot / n * 10) / 10 : 0, enLinea: on };
  });
  return {
    perfiles: lista.map(function (x) { var o = {}; for (var k in x) o[k] = x[k]; o.enLinea = !!enLinea[x.id]; return o; }),
    grupos: grupos, generado: ahora(), enLineaTotal: Object.keys(enLinea).length
  };
}

/* ======================= SESIÓN, BONO DIARIO Y XP ======================= */
function sumar(j, xp, mon) {
  j.p[P.XP] = Number(j.p[P.XP]) + xp;
  j.p[P.MON] = Number(j.p[P.MON]) + (mon || 0);
  j.p[P.NIVEL] = nivelDe(Number(j.p[P.XP]));
}
function abrirSesion(j) {
  var hoy = hoyStr(), otorgado = 0;
  if (j.prog.ultimoBono !== hoy) {
    var racha = 1;
    if (j.prog.ultimoBono) {
      var d = diasEntre(j.prog.ultimoBono, hoy);
      var fin = diaSemana(j.prog.ultimoBono) >= 5 || diaSemana(j.prog.ultimoBono) === 0;   // viernes, sábado o domingo
      if (d === 1 || (d > 1 && d <= 3 && fin)) racha = Number(j.p[P.RACHA]) + 1;
    }
    j.p[P.RACHA] = racha;
    j.prog.ultimoBono = hoy;
    sumar(j, CFG.XP_BONO, CFG.MON_BONO);
    registrarAvance(j, '-', 'Bono diario', CFG.XP_BONO);
    otorgado = CFG.XP_BONO;
  }
  j.p[P.ULT] = horaStr();
  guardarJugador(j);
  marcarEnLinea(String(j.p[P.ID]));
  return otorgado;
}
function autenticar(token) {
  var t = leerToken(token);
  var j = cargarJugador(t.id);
  if (!j || j.p[P.ESTADO] === 'Bloqueado' || String(j.s[S.VER]) !== String(t.ver))
    throw new ErrorApi('Tu sesión venció. Entra de nuevo con tu PIN.', 'sesion');
  return j;
}

/* ============================ VALIDACIONES ============================== */
var PALABRAS_FEAS = ['puta', 'puto', 'mierda', 'verga', 'pene', 'vagina', 'culo', 'marica', 'maricon', 'gonorrea', 'hijueputa', 'hp', 'malparido', 'pirobo', 'sexo', 'porno', 'cagada', 'idiota', 'estupid', 'imbecil', 'nazi', 'zorra', 'perra'];
function validarApodo(a) {
  a = String(a || '').replace(/\s+/g, ' ').trim();
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 _.-]{2,13}$/.test(a))
    throw new ErrorApi('El apodo debe tener de 3 a 14 letras o números (sin símbolos raros).', 'apodo');
  if ((a.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length < 2) throw new ErrorApi('El apodo debe tener al menos 2 letras.', 'apodo');
  if ((a.match(/\d/g) || []).length > 4) throw new ErrorApi('Usa un apodo con más letras y menos números.', 'apodo');
  var n = sinTildes(a);
  for (var i = 0; i < PALABRAS_FEAS.length; i++) {
    if (n.replace(/[ _.-]/g, '').indexOf(PALABRAS_FEAS[i]) >= 0) throw new ErrorApi('Ese apodo no está permitido. Elige otro.', 'apodo');
  }
  return a;
}
function validarPin(pin) {
  pin = String(pin == null ? '' : pin);
  if (!/^\d{4}$/.test(pin)) throw new ErrorApi('El PIN debe tener exactamente 4 números.', 'pin');
  return pin;
}

/* =============================== ACCIONES ================================ */
function accionEstado() {
  return { ok: true, grupos: CFG.GRUPOS, avatares: CFG.AVATARES, mundos: CFG.MUNDOS, xpPorNivel: CFG.XP_POR_NIVEL };
}
function accionRanking() {
  var r = construirRanking();
  return { ok: true, ranking: r, config: { grupos: CFG.GRUPOS, avatares: CFG.AVATARES, xpPorNivel: CFG.XP_POR_NIVEL } };
}

function accionRegistrar(req) {
  var codigo = String(req.codigo || '').trim().toUpperCase();
  var esperado = String(props().getProperty('CODIGO_REGISTRO') || CFG.CODIGO_INICIAL).toUpperCase();
  if (!igualSeguro(codigo, esperado)) throw new ErrorApi('El código de registro no es correcto. Pídeselo al Profe Luis.', 'codigo');
  var apodo = validarApodo(req.apodo), pin = validarPin(req.pin);
  var grupo = String(req.grupo || '');
  if (CFG.GRUPOS.indexOf(grupo) < 0) throw new ErrorApi('Elige tu grupo.', 'grupo');
  var avatar = Math.floor(Number(req.avatar));
  if (!(avatar >= 1 && avatar <= CFG.AVATARES)) avatar = 1;

  var c = cache(), n = Number(c.get('regN') || 0);
  if (n >= CFG.MAX_REGISTROS_10MIN) throw new ErrorApi('Hay muchos registros seguidos. Espera unos minutos e intenta de nuevo.', 'limite');

  return conLock(function () {
    var filas = leerTabla(hoja(CFG.HOJA_PERFILES), NC_P), clave = sinTildes(apodo);
    for (var i = 0; i < filas.length; i++) {
      if (sinTildes(filas[i][P.APODO]) === clave) throw new ErrorApi('Ese apodo ya existe. Elige otro (o entra con tu PIN desde "Ya tengo perfil").', 'apodo_repetido');
    }
    var id;
    do { id = 'u' + aleatorio(8); } while (filas.some(function (f) { return String(f[P.ID]) === id; }));
    var sal = 's' + aleatorio(16);
    var fila = [id, apodo, avatar, Number(grupo.charAt(0)), grupo, 1, 0, 0, 0, '', horaStr(), 'Activo'];
    hoja(CFG.HOJA_PERFILES).appendRow(fila);
    hoja(CFG.HOJA_SEG).appendRow([id, hashPin(pin, sal), sal, 1, 0, 0, '{}']);
    c.put('regN', String(n + 1), 600);
    var j = cargarJugador(id);
    registrarAvance(j, '-', 'Registro', 0);
    var bono = abrirSesion(j);
    return { ok: true, token: crearToken(id, 1), perfil: perfilPropio(j), bono: bono, ranking: construirRanking() };
  });
}

function accionEntrar(req) {
  var pin = validarPin(req.pin);
  return conLock(function () {
    var j = req.id ? cargarJugador(String(req.id)) : cargarPorApodo(String(req.apodo || ''));
    if (!j || j.p[P.ESTADO] === 'Bloqueado') throw new ErrorApi('No encontré ese perfil. Revisa el apodo o la lista.', 'no_existe');
    if (Number(j.s[S.BLOQ]) > ahora()) {
      var min = Math.ceil((Number(j.s[S.BLOQ]) - ahora()) / 60000);
      throw new ErrorApi('Perfil bloqueado por seguridad. Intenta de nuevo en ' + min + ' minuto' + (min === 1 ? '' : 's') + ' o pide ayuda al Profe.', 'bloqueado');
    }
    if (!igualSeguro(hashPin(pin, String(j.s[S.SAL])), String(j.s[S.HASH]))) {
      var intentos = Number(j.s[S.INT]) + 1, restan = CFG.MAX_INTENTOS - intentos;
      if (intentos >= CFG.MAX_INTENTOS) { j.s[S.INT] = 0; j.s[S.BLOQ] = ahora() + CFG.BLOQUEO_MIN * 60000; }
      else { j.s[S.INT] = intentos; }
      hoja(CFG.HOJA_SEG).getRange(j.filaS, 1, 1, NC_S).setValues([j.s]);
      if (intentos >= CFG.MAX_INTENTOS) throw new ErrorApi('PIN incorrecto muchas veces. El perfil se bloqueó ' + CFG.BLOQUEO_MIN + ' minutos por seguridad.', 'bloqueado');
      throw new ErrorApi('PIN incorrecto. Te ' + (restan === 1 ? 'queda 1 intento' : 'quedan ' + restan + ' intentos') + '.', 'pin_incorrecto');
    }
    j.s[S.INT] = 0; j.s[S.BLOQ] = 0;
    var bono = abrirSesion(j);
    return { ok: true, token: crearToken(String(j.p[P.ID]), String(j.s[S.VER])), perfil: perfilPropio(j), bono: bono, ranking: construirRanking() };
  });
}

function accionSincronizar(req) {
  var j = autenticar(req.token);
  marcarEnLinea(String(j.p[P.ID]));
  return { ok: true, perfil: perfilPropio(j), ranking: construirRanking() };
}

function accionVisitar(req) {
  var mundo = String(req.mundo || '');
  if (CFG.MUNDOS.indexOf(mundo) < 0) throw new ErrorApi('Mundo desconocido.', 'mundo');
  return conLock(function () {
    var j = autenticar(req.token), hoy = hoyStr(), xp = 0;
    if (j.prog.visitas[mundo] !== hoy) {
      j.prog.visitas[mundo] = hoy; xp = CFG.XP_VISITA;
      sumar(j, xp, CFG.MON_VISITA);
      registrarAvance(j, mundo, 'Entró a su clase', xp);
    }
    guardarJugador(j); marcarEnLinea(String(j.p[P.ID]));
    return { ok: true, otorgado: xp, perfil: perfilPropio(j) };
  });
}

function accionActividad(req) {
  var mundo = String(req.mundo || '');
  if (CFG.MUNDOS.indexOf(mundo) < 0) throw new ErrorApi('Mundo desconocido.', 'mundo');
  var clave = String(req.clave || '');
  if (!/^[A-Za-z0-9_.:-]{3,60}$/.test(clave)) throw new ErrorApi('Clave de actividad inválida.', 'clave');
  var puntos = Math.floor(Number(req.puntos));
  if (!(puntos >= 1)) throw new ErrorApi('Puntos inválidos.', 'puntos');
  puntos = Math.min(puntos, CFG.MAX_PUNTOS_ACCION);
  return conLock(function () {
    var j = autenticar(req.token), hoy = hoyStr();
    if (j.prog.claves[clave] !== undefined) return { ok: true, otorgado: 0, repetido: true, perfil: perfilPropio(j) };
    if (Object.keys(j.prog.claves).length >= CFG.MAX_CLAVES) throw new ErrorApi('Límite de actividades alcanzado.', 'limite');
    if (j.prog.xpDia.f !== hoy) j.prog.xpDia = { f: hoy, n: 0 };
    var cupo = CFG.MAX_XP_ACTIVIDAD_DIA - j.prog.xpDia.n, dar = Math.max(0, Math.min(puntos, cupo));
    j.prog.claves[clave] = dar;
    if (dar > 0) {
      j.prog.xpDia.n += dar;
      sumar(j, dar, Math.floor(dar / 10));
      registrarAvance(j, mundo, clave, dar);
    }
    guardarJugador(j); marcarEnLinea(String(j.p[P.ID]));
    return { ok: true, otorgado: dar, tope: dar < puntos, perfil: perfilPropio(j) };
  });
}

function accionPerfilActualizar(req) {
  return conLock(function () {
    var j = autenticar(req.token);
    var av = Math.floor(Number(req.avatar));
    if (av >= 1 && av <= CFG.AVATARES) j.p[P.AVATAR] = av;
    guardarJugador(j);
    return { ok: true, perfil: perfilPropio(j), ranking: construirRanking() };
  });
}

function accionCambiarPin(req) {
  var actual = validarPin(req.pinActual), nuevo = validarPin(req.pinNuevo);
  return conLock(function () {
    var j = autenticar(req.token);
    if (!igualSeguro(hashPin(actual, String(j.s[S.SAL])), String(j.s[S.HASH]))) throw new ErrorApi('Tu PIN actual no es correcto.', 'pin_incorrecto');
    var sal = 's' + aleatorio(16);
    j.s[S.SAL] = sal; j.s[S.HASH] = hashPin(nuevo, sal); j.s[S.VER] = Number(j.s[S.VER]) + 1;
    guardarJugador(j);
    return { ok: true, token: crearToken(String(j.p[P.ID]), String(j.s[S.VER])) };
  });
}

function accionEstadoGuardar(req) {
  var clave = String(req.clave || '');
  if (!/^[A-Za-z0-9_.:-]{2,60}$/.test(clave)) throw new ErrorApi('Clave inválida.', 'clave');
  var datos = String(req.datos == null ? '' : req.datos);
  if (datos.length > CFG.MAX_ESTADO_CHARS) throw new ErrorApi('Los datos de progreso son demasiado grandes.', 'tamano');
  return conLock(function () {
    var j = autenticar(req.token), h = hoja(CFG.HOJA_ESTADOS), id = String(j.p[P.ID]);
    var n = h.getLastRow(), filas = n < 2 ? [] : h.getRange(2, 1, n - 1, 2).getValues(), propias = 0, fila = 0;
    for (var i = 0; i < filas.length; i++) {
      if (String(filas[i][0]) === id) { propias++; if (String(filas[i][1]) === clave) fila = i + 2; }
    }
    if (fila) { h.getRange(fila, 3, 1, 2).setValues([[datos, horaStr()]]); }
    else {
      if (propias >= CFG.MAX_ESTADOS) throw new ErrorApi('Límite de progresos guardados alcanzado.', 'limite');
      h.appendRow([id, clave, datos, horaStr()]);
    }
    marcarEnLinea(id);
    return { ok: true };
  });
}
function accionEstadoCargar(req) {
  var clave = String(req.clave || '');
  if (!/^[A-Za-z0-9_.:-]{2,60}$/.test(clave)) throw new ErrorApi('Clave inválida.', 'clave');
  var j = autenticar(req.token), h = hoja(CFG.HOJA_ESTADOS), id = String(j.p[P.ID]);
  var n = h.getLastRow(), filas = n < 2 ? [] : h.getRange(2, 1, n - 1, 4).getValues();
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][0]) === id && String(filas[i][1]) === clave) return { ok: true, datos: String(filas[i][2]), actualizado: String(filas[i][3]) };
  }
  return { ok: true, datos: null };
}

var RUTAS = {
  estado: accionEstado, ranking: accionRanking, registrar: accionRegistrar, entrar: accionEntrar,
  sincronizar: accionSincronizar, visitar: accionVisitar, actividad: accionActividad,
  perfilActualizar: accionPerfilActualizar, cambiarPin: accionCambiarPin,
  estadoGuardar: accionEstadoGuardar, estadoCargar: accionEstadoCargar
};

/* ============================ PUNTOS DE ENTRADA ========================== */
function doGet() { return salida({ ok: true, servicio: 'Aula Gamificada', mensaje: 'Servidor activo', hora: horaStr() }); }
function doPost(e) {
  var req;
  try {
    var txt = (e && e.postData && e.postData.contents) || '';
    if (txt.length > 40000) return salida({ ok: false, error: 'Solicitud demasiado grande.' });
    req = JSON.parse(txt);
  } catch (err) { return salida({ ok: false, error: 'Solicitud inválida.' }); }
  try {
    var fn = Object.prototype.hasOwnProperty.call(RUTAS, String(req.accion)) ? RUTAS[String(req.accion)] : null;
    if (!fn) return salida({ ok: false, error: 'Acción desconocida.' });
    return salida(fn(req));
  } catch (err) {
    if (err && err.esApi) return salida({ ok: false, error: err.message, codigo: err.codigo });
    try { console.error(err && err.stack ? err.stack : String(err)); } catch (x) {}
    return salida({ ok: false, error: 'Error del servidor. Intenta de nuevo.', codigo: 'servidor' });
  }
}

/* ======================= INSTALACIÓN Y MENÚ DEL PROFE ==================== */
function configurar() {
  var libroAct = SpreadsheetApp.getActiveSpreadsheet();
  props().setProperty('SS_ID', libroAct.getId());
  _ss = null;
  if (!props().getProperty('SECRETO')) props().setProperty('SECRETO', aleatorio(48));
  if (!props().getProperty('PEPPER')) props().setProperty('PEPPER', aleatorio(48));
  if (!props().getProperty('CODIGO_REGISTRO')) props().setProperty('CODIGO_REGISTRO', CFG.CODIGO_INICIAL);

  function asegurar(nombre, cabeceras) {
    var h = libroAct.getSheetByName(nombre);
    if (!h) h = libroAct.insertSheet(nombre);
    if (h.getLastRow() < 1) h.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras]);
    return h;
  }
  var hp = asegurar(CFG.HOJA_PERFILES, ['ID', 'Apodo', 'Avatar', 'Grado', 'Grupo', 'Nivel', 'XP', 'Monedas', 'Racha', 'Último ingreso', 'Creado', 'Estado']);
  var hr = asegurar(CFG.HOJA_RESUMEN, ['Grupo', 'Estudiantes', 'XP total', 'XP promedio']);
  var ha = asegurar(CFG.HOJA_AVANCES, ['Fecha', 'ID', 'Apodo', 'Mundo', 'Actividad', 'XP']);
  var hs = asegurar(CFG.HOJA_SEG, ['ID', 'Hash', 'Sal', 'VersiónPIN', 'Intentos', 'BloqueadoHasta', 'Progreso']);
  var he = asegurar(CFG.HOJA_ESTADOS, ['ID', 'Clave', 'Datos', 'Actualizado']);

  try {
    [hp, hr, ha, hs, he].forEach(function (h) {
      var cab = h.getRange(1, 1, 1, h.getLastColumn());
      cab.setFontWeight('bold'); cab.setBackground('#1d4fd8'); cab.setFontColor('#ffffff'); h.setFrozenRows(1);
      if (h.getMaxRows() < 3000) h.insertRowsAfter(h.getMaxRows(), 3000 - h.getMaxRows());
    });
    function texto(h, col, nCols) { h.getRange(2, col, h.getMaxRows() - 1, nCols).setNumberFormat('@'); }
    texto(hp, 1, 2);     // ID y apodo como texto
    texto(hp, 5, 1);     // grupo
    texto(hp, 10, 2);    // fechas
    texto(hs, 1, 3);     // ID, hash y sal
    texto(he, 1, 4);     // ID, clave, datos y fecha
    texto(ha, 1, 5);     // fecha, ID, apodo, mundo y actividad
    hp.setColumnWidth(2, 150); hp.setColumnWidth(10, 130); hp.setColumnWidth(11, 130);
    if (!hp.getFilter()) hp.getRange(1, 1, 2, 12).createFilter();
    var regla = SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpointWithValue('#ffffff', SpreadsheetApp.InterpolationType.NUMBER, '0')
      .setGradientMaxpointWithValue('#46d063', SpreadsheetApp.InterpolationType.PERCENTILE, '100')
      .setRanges([hp.getRange(2, 7, 2000, 1)]).build();
    hp.setConditionalFormatRules([regla]);
    // Resumen por grupo (fórmulas vivas)
    hr.getRange(2, 1, CFG.GRUPOS.length, 1).setNumberFormat('@').setValues(CFG.GRUPOS.map(function (g) { return [g]; }));
    var f = CFG.GRUPOS.map(function (g, i) {
      var r = i + 2;
      return ['=COUNTIF(Perfiles!E:E,A' + r + ')', '=SUMIF(Perfiles!E:E,A' + r + ',Perfiles!G:G)', '=IF(B' + r + '=0,0,ROUND(C' + r + '/B' + r + ',1))'];
    });
    hr.getRange(2, 2, CFG.GRUPOS.length, 3).setFormulas(f);
    hs.hideSheet(); he.hideSheet();
  } catch (e) { Logger.log('Formato opcional no aplicado: ' + e); }

  var msg = 'Listo ✅\n\nCódigo de registro actual: ' + props().getProperty('CODIGO_REGISTRO') +
    '\n\nSiguiente paso: Implementar → Nueva implementación → Aplicación web\n(Ejecutar como: Yo · Quién tiene acceso: Cualquier persona).';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('Aula Gamificada', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e2) {}
}

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('🎮 Aula Gamificada')
      .addItem('⚙️ Configurar (solo la primera vez)', 'configurar')
      .addSeparator()
      .addItem('🔑 Restablecer PIN de un estudiante', 'menuRestablecerPin')
      .addItem('⭐ Dar XP a un estudiante', 'menuDarXP')
      .addItem('🚫 Bloquear / desbloquear perfil', 'menuBloquear')
      .addItem('🗑️ Eliminar perfil', 'menuEliminar')
      .addSeparator()
      .addItem('📝 Cambiar código de registro', 'menuCambiarCodigo')
      .addItem('🔍 Ver código de registro', 'menuVerCodigo')
      .addToUi();
  } catch (e) {}
}

function adminRestablecerPin(apodo, pin) {
  pin = validarPin(pin);
  return conLock(function () {
    var j = cargarPorApodo(apodo);
    if (!j) throw new ErrorApi('No existe ese apodo.', 'no_existe');
    var sal = 's' + aleatorio(16);
    j.s[S.SAL] = sal; j.s[S.HASH] = hashPin(pin, sal); j.s[S.VER] = Number(j.s[S.VER]) + 1; j.s[S.INT] = 0; j.s[S.BLOQ] = 0;
    guardarJugador(j);
    return 'PIN restablecido para ' + j.p[P.APODO];
  });
}
function adminDarXP(apodo, xp, motivo) {
  xp = Math.floor(Number(xp));
  if (!xp) throw new ErrorApi('Cantidad inválida.', 'puntos');
  return conLock(function () {
    var j = cargarPorApodo(apodo);
    if (!j) throw new ErrorApi('No existe ese apodo.', 'no_existe');
    var nuevo = Math.max(0, Number(j.p[P.XP]) + xp);
    j.p[P.XP] = nuevo; j.p[P.NIVEL] = nivelDe(nuevo);
    registrarAvance(j, '-', 'Docente: ' + (motivo || 'bonificación'), xp);
    guardarJugador(j);
    return j.p[P.APODO] + ' ahora tiene ' + nuevo + ' XP';
  });
}
function adminEstado(apodo, estado) {
  return conLock(function () {
    var j = cargarPorApodo(apodo);
    if (!j) throw new ErrorApi('No existe ese apodo.', 'no_existe');
    j.p[P.ESTADO] = estado; guardarJugador(j);
    return j.p[P.APODO] + ': ' + estado;
  });
}
function adminEliminar(apodo) {
  return conLock(function () {
    var j = cargarPorApodo(apodo);
    if (!j) throw new ErrorApi('No existe ese apodo.', 'no_existe');
    var id = String(j.p[P.ID]);
    // Estados (de abajo hacia arriba)
    var he = hoja(CFG.HOJA_ESTADOS), n = he.getLastRow();
    if (n >= 2) {
      var ids = he.getRange(2, 1, n - 1, 1).getValues();
      for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === id) he.deleteRow(i + 2);
    }
    hoja(CFG.HOJA_SEG).deleteRow(j.filaS);
    hoja(CFG.HOJA_PERFILES).deleteRow(j.filaP);
    cache().remove('rk');
    return 'Perfil eliminado: ' + apodo;
  });
}
function _pedir(titulo, texto) {
  var ui = SpreadsheetApp.getUi(), r = ui.prompt(titulo, texto, ui.ButtonSet.OK_CANCEL);
  return r.getSelectedButton() === ui.Button.OK ? String(r.getResponseText()).trim() : null;
}
function _avisar(t) { SpreadsheetApp.getUi().alert(t); }
function _seguro(fn) { try { _avisar(fn()); } catch (e) { _avisar(e && e.esApi ? e.message : 'Error: ' + e); } }
function menuRestablecerPin() {
  var a = _pedir('Restablecer PIN', 'Apodo del estudiante:'); if (!a) return;
  var p = _pedir('Nuevo PIN', 'Escribe un PIN temporal de 4 números:'); if (!p) return;
  _seguro(function () { return adminRestablecerPin(a, p); });
}
function menuDarXP() {
  var a = _pedir('Dar XP', 'Apodo del estudiante:'); if (!a) return;
  var x = _pedir('Dar XP', 'Cantidad de XP (usa negativo para quitar):'); if (!x) return;
  var m = _pedir('Motivo', 'Motivo (opcional, queda en la hoja Avances):') || '';
  _seguro(function () { return adminDarXP(a, x, m); });
}
function menuBloquear() {
  var a = _pedir('Bloquear / desbloquear', 'Apodo del estudiante:'); if (!a) return;
  var e = _pedir('Estado', 'Escribe Bloqueado o Activo:'); if (!e) return;
  if (e !== 'Bloqueado' && e !== 'Activo') { _avisar('Escribe exactamente Bloqueado o Activo.'); return; }
  _seguro(function () { return adminEstado(a, e); });
}
function menuEliminar() {
  var a = _pedir('Eliminar perfil', 'Apodo del estudiante a ELIMINAR (no se puede deshacer):'); if (!a) return;
  _seguro(function () { return adminEliminar(a); });
}
function menuCambiarCodigo() {
  var c = _pedir('Código de registro', 'Escribe el nuevo código (4 a 20 letras o números):');
  if (!c) return;
  if (!/^[A-Za-z0-9]{4,20}$/.test(c)) { _avisar('Usa solo letras y números (4 a 20).'); return; }
  props().setProperty('CODIGO_REGISTRO', c.toUpperCase());
  _avisar('Código actualizado: ' + c.toUpperCase());
}
function menuVerCodigo() { _avisar('Código de registro actual: ' + (props().getProperty('CODIGO_REGISTRO') || CFG.CODIGO_INICIAL)); }
