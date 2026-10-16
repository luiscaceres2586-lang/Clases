/*****************************************************************************
 *  AULA GAMIFICADA · SERVIDOR (Google Apps Script + Google Sheets)
 *  Profe Luis · Colegio Integrado Simón Bolívar, Sede San Martín · Cúcuta
 *
 *  Qué hace (v2 · lista de estudiantes):
 *   - El Profe carga la lista del curso (grupo, n° de lista, nombre completo): todos
 *     arrancan con el PIN inicial; en su primer ingreso eligen apodo y cambian el PIN
 *   - Inicio de sesión de estudiantes con apodo + PIN de 4 números
 *   - Hoja "Notas y avance": avance y nota de cada clase por estudiante (editable)
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
  HOJA_NOTAS:    'Notas y avance',
  HOJA_LISTA:    'Cargar lista',
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
  MAX_PUNTOS_ACCION: 10,
  MAX_XP_ACTIVIDAD_DIA: 200,
  MAX_CLAVES: 500,
  MAX_ESTADO_CHARS: 40000,
  MAX_ESTADOS: 150,
  EN_LINEA_SEG: 240,
  CACHE_RANKING_SEG: 20,
  MAX_REGISTROS_10MIN: 150,
  PIN_INICIAL: '1111',
  REGISTRO_LIBRE: false,        // true = los estudiantes pueden crear perfil con el código (no recomendado)
  XP_CLASE_COMPLETA: 20
};

// Posiciones de columna (base 0)
var P = { ID: 0, NOMBRE: 1, LISTA: 2, APODO: 3, AVATAR: 4, GRADO: 5, GRUPO: 6, NIVEL: 7, XP: 8, MON: 9, RACHA: 10, ULT: 11, CREADO: 12, ESTADO: 13 };
var N = { GRUPO: 0, NOMBRE: 1, MATERIA: 2, SEMANA: 3, AVANCE: 4, ACIERTOS: 5, PREG: 6, NOTA: 7, DOCENTE: 8, FINAL: 9, ULT: 10, APODO: 11, ID: 12, CLAVE: 13 };
var S = { ID: 0, HASH: 1, SAL: 2, VER: 3, INT: 4, BLOQ: 5, PROG: 6 };
var NC_P = 14, NC_S = 7, NC_N = 14;

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
function cargarPorLista(grupo, lista) {
  var g = String(grupo || '').trim(), n = Math.floor(Number(lista));
  if (!g || !(n >= 1)) return null;
  var filas = leerTabla(hoja(CFG.HOJA_PERFILES), NC_P);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][P.GRUPO]) === g && Number(filas[i][P.LISTA]) === n) return cargarJugador(String(filas[i][P.ID]));
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
    id: String(j.p[P.ID]), apodo: String(j.p[P.APODO]), nombre: String(j.p[P.NOMBRE] || ''), lista: Number(j.p[P.LISTA]) || 0, avatar: Number(j.p[P.AVATAR]),
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
      if (!f[P.ID] || f[P.ESTADO] === 'Bloqueado' || !String(f[P.APODO]).trim()) return;
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
function autenticar(token, permitirPendiente) {
  var t = leerToken(token);
  var j = cargarJugador(t.id);
  if (!j || j.p[P.ESTADO] === 'Bloqueado' || String(j.s[S.VER]) !== String(t.ver))
    throw new ErrorApi('Tu sesión venció. Entra de nuevo con tu PIN.', 'sesion');
  if (!permitirPendiente && j.p[P.ESTADO] === 'Pendiente')
    throw new ErrorApi('Primero completa tu primer ingreso.', 'pendiente');
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
  return { ok: true, grupos: CFG.GRUPOS, avatares: CFG.AVATARES, mundos: CFG.MUNDOS, xpPorNivel: CFG.XP_POR_NIVEL, registroLibre: CFG.REGISTRO_LIBRE, primerIngresoAbierto: props().getProperty('PRIMER_INGRESO') !== 'cerrado' };
}
function accionRanking() {
  var r = construirRanking();
  return { ok: true, ranking: r, config: { grupos: CFG.GRUPOS, avatares: CFG.AVATARES, xpPorNivel: CFG.XP_POR_NIVEL } };
}

function accionRegistrar(req) {
  if (!CFG.REGISTRO_LIBRE) throw new ErrorApi('El registro libre está cerrado. Tu perfil lo crea el Profe con la lista del curso.', 'registro_cerrado');
  var codigo = String(req.codigo || '').trim().toUpperCase();
  var esperado = String(props().getProperty('CODIGO_REGISTRO') || '').toUpperCase();
  if (!esperado || !igualSeguro(codigo, esperado)) throw new ErrorApi('El código de registro no es correcto. Pídeselo al Profe Luis.', 'codigo');
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
    var fila = [id, '', '', apodo, avatar, Number(grupo.charAt(0)), grupo, 1, 0, 0, 0, '', horaStr(), 'Activo'];
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
    var j = req.id ? cargarJugador(String(req.id))
          : (req.grupo && req.lista) ? cargarPorLista(req.grupo, req.lista)
          : cargarPorApodo(String(req.apodo || ''));
    if (!j || j.p[P.ESTADO] === 'Bloqueado') throw new ErrorApi('No encontré ese perfil. Revisa tu grupo y tu número de lista.', 'no_existe');
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
    if (j.p[P.ESTADO] === 'Pendiente') {
      // Primer ingreso (o PIN restablecido por el Profe): todavía no tiene sesión completa
      if (props().getProperty('PRIMER_INGRESO') === 'cerrado') {
        hoja(CFG.HOJA_SEG).getRange(j.filaS, 1, 1, NC_S).setValues([j.s]);
        throw new ErrorApi('El primer ingreso está cerrado por ahora. Pídele al Profe que lo abra.', 'cerrado');
      }
      hoja(CFG.HOJA_SEG).getRange(j.filaS, 1, 1, NC_S).setValues([j.s]);
      return { ok: true, pendiente: true, token: crearToken(String(j.p[P.ID]), String(j.s[S.VER])),
        nombre: String(j.p[P.NOMBRE] || ''), apodo: String(j.p[P.APODO] || ''), avatar: Number(j.p[P.AVATAR]) || 1, grupo: String(j.p[P.GRUPO]) };
    }
    var bono = abrirSesion(j);
    return { ok: true, token: crearToken(String(j.p[P.ID]), String(j.s[S.VER])), perfil: perfilPropio(j), bono: bono, ranking: construirRanking() };
  });
}

// Primer ingreso: elige apodo (si aún no tiene) y cambia el PIN inicial por uno propio
function accionActivar(req) {
  var pin = validarPin(req.pinNuevo);
  if (pin === CFG.PIN_INICIAL) throw new ErrorApi('Elige un PIN diferente al inicial.', 'pin');
  return conLock(function () {
    var j = autenticar(req.token, true);
    if (j.p[P.ESTADO] !== 'Pendiente') throw new ErrorApi('Tu perfil ya está activado.', 'ya_activo');
    var apodo = String(j.p[P.APODO] || '').trim();
    if (!apodo || req.apodo) {
      if (!apodo || sinTildes(req.apodo) !== sinTildes(apodo)) {
        var nuevo = validarApodo(req.apodo), clave = sinTildes(nuevo), filas = leerTabla(hoja(CFG.HOJA_PERFILES), NC_P);
        for (var i = 0; i < filas.length; i++) {
          if (String(filas[i][P.ID]) !== String(j.p[P.ID]) && sinTildes(filas[i][P.APODO]) === clave)
            throw new ErrorApi('Ese apodo ya existe. Elige otro.', 'apodo_repetido');
        }
        apodo = nuevo;
      }
    }
    var avatar = Math.floor(Number(req.avatar));
    if (avatar >= 1 && avatar <= CFG.AVATARES) j.p[P.AVATAR] = avatar;
    j.p[P.APODO] = apodo; j.p[P.ESTADO] = 'Activo';
    var sal = 's' + aleatorio(16);
    j.s[S.SAL] = sal; j.s[S.HASH] = hashPin(pin, sal); j.s[S.VER] = Number(j.s[S.VER]) + 1;
    registrarAvance(j, '-', 'Primer ingreso', 0);
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

function _claveEstado(c) {
  c = String(c || '');
  if (!/^[A-Za-z0-9_.:-]{2,60}$/.test(c)) throw new ErrorApi('Clave inválida.', 'clave');
  return c;
}
function _num(v, min, max) { v = Number(v); if (!isFinite(v)) return 0; return Math.max(min, Math.min(max, v)); }
function _txt(v, max) { return String(v == null ? '' : v).replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 °._-]/g, '').slice(0, max); }

// Guarda el espejo del progreso de una clase: { t, k: { claveLocal: valor } }  (se mezcla con lo anterior)
function _guardarEstadoItem(j, it) {
  var clave = _claveEstado(it.clave), nuevo;
  try { nuevo = JSON.parse(String(it.datos == null ? '' : it.datos)); } catch (e) { nuevo = null; }
  if (!nuevo || typeof nuevo !== 'object' || Array.isArray(nuevo)) throw new ErrorApi('Los datos de progreso no son válidos.', 'datos');
  var h = hoja(CFG.HOJA_ESTADOS), id = String(j.p[P.ID]);
  var n = h.getLastRow(), filas = n < 2 ? [] : h.getRange(2, 1, n - 1, 3).getValues(), propias = 0, fila = 0, previo = null;
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][0]) === id) { propias++; if (String(filas[i][1]) === clave) { fila = i + 2; previo = String(filas[i][2]); } }
  }
  var k = {}, viejo = {};
  if (it.merge && previo) { try { viejo = (JSON.parse(previo) || {}).k || {}; } catch (e2) { viejo = {}; } }
  var b = nuevo.k || {}, x;
  for (x in viejo) if (typeof viejo[x] === 'string') k[x] = viejo[x];
  for (x in b) if (typeof b[x] === 'string' && x.length <= 200) k[x] = b[x];
  var nom = typeof nuevo.n === 'string' ? nuevo.n.slice(0, 120) : '';
  if (!nom && it.merge && previo) { try { nom = String((JSON.parse(previo) || {}).n || ''); } catch (e3) { nom = ''; } }
  var t = ahora(), txt = JSON.stringify({ t: t, n: nom, k: k });
  if (txt.length > CFG.MAX_ESTADO_CHARS) throw new ErrorApi('Los datos de progreso son demasiado grandes.', 'tamano');
  if (fila) { h.getRange(fila, 3, 1, 2).setValues([[txt, horaStr()]]); }
  else {
    if (propias >= CFG.MAX_ESTADOS) throw new ErrorApi('Límite de progresos guardados alcanzado.', 'limite');
    h.appendRow([id, clave, txt, horaStr()]);
  }
  return t;
}

// Hoja "Notas y avance": una fila por estudiante y clase. El Profe puede escribir en "Nota docente".
function _upsertNota(j, clave, r) {
  r = r || {};
  var h = hoja(CFG.HOJA_NOTAS), id = String(j.p[P.ID]), n = h.getLastRow(), fila = 0;
  if (n >= 2) {
    var kk = h.getRange(2, N.ID + 1, n - 1, 2).getValues();
    for (var i = 0; i < kk.length; i++) { if (String(kk[i][0]) === id && String(kk[i][1]) === clave) { fila = i + 2; break; } }
  }
  var avance = Math.round(_num(r.avance, 0, 100)), aciertos = Math.round(_num(r.aciertos, 0, 999)), preg = Math.round(_num(r.preguntas, 0, 999));
  var nota = Math.round(_num(r.nota, 0, 5) * 10) / 10, semana = Math.round(_num(r.semana, 0, 99)), materia = _txt(r.materia, 40);
  var nombre = String(j.p[P.NOMBRE] || ''), apodo = String(j.p[P.APODO] || ''), grupo = String(j.p[P.GRUPO]);
  var previoAvance = 0;
  if (fila) {
    previoAvance = Number(h.getRange(fila, N.AVANCE + 1).getValue()) || 0;
    h.getRange(fila, 1, 1, 8).setValues([[grupo, nombre, materia, semana, avance, aciertos, preg, nota]]);
    h.getRange(fila, N.ULT + 1, 1, 2).setValues([[horaStr(), apodo]]);
  } else {
    h.appendRow([grupo, nombre, materia, semana, avance, aciertos, preg, nota, '', '', horaStr(), apodo, id, clave]);
    var f = h.getLastRow();
    h.getRange(f, N.FINAL + 1).setFormula('=IF(I' + f + '<>"",I' + f + ',H' + f + ')');
  }
  // XP único por clase completada (lo decide el servidor)
  var xp = 0, marca = 'fin:' + clave;
  if (avance >= 100 && j.prog.claves[marca] === undefined) {
    xp = CFG.XP_CLASE_COMPLETA; j.prog.claves[marca] = xp;
    var m = /_(mat|tec)(\d)_/.exec(clave), mundo = m ? (m[1] === 'mat' ? 'a' : 't') + m[2] : '-';
    sumar(j, xp, Math.floor(xp / 10)); registrarAvance(j, mundo, clave + ' completada', xp);
  }
  return xp;
}

function accionEstadoGuardarLote(req) {
  var items = req.items;
  if (!Array.isArray(items) || !items.length || items.length > 4) throw new ErrorApi('Solicitud inválida.', 'lote');
  return conLock(function () {
    var j = autenticar(req.token), ts = [], xp = 0;
    items.forEach(function (it) {
      ts.push(_guardarEstadoItem(j, it));
      if (it.resumen) xp += _upsertNota(j, _claveEstado(it.clave), it.resumen);
    });
    if (xp > 0) guardarJugador(j);
    marcarEnLinea(String(j.p[P.ID]));
    return { ok: true, t: ts, xp: xp };
  });
}
function accionEstadoGuardar(req) {
  return accionEstadoGuardarLote({ token: req.token, items: [{ clave: req.clave, datos: req.datos, merge: req.merge, resumen: req.resumen }] });
}
function accionEstadoCargar(req) {
  var clave = _claveEstado(req.clave);
  var j = autenticar(req.token), h = hoja(CFG.HOJA_ESTADOS), id = String(j.p[P.ID]);
  var n = h.getLastRow(), filas = n < 2 ? [] : h.getRange(2, 1, n - 1, 4).getValues();
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][0]) === id && String(filas[i][1]) === clave) return { ok: true, datos: String(filas[i][2]), actualizado: String(filas[i][3]) };
  }
  return { ok: true, datos: null };
}
function accionEstadoCargarPrefijo(req) {
  var pre = String(req.prefijo || '');
  if (!/^[A-Za-z0-9_.:-]{1,10}$/.test(pre)) throw new ErrorApi('Prefijo inválido.', 'clave');
  var j = autenticar(req.token), h = hoja(CFG.HOJA_ESTADOS), id = String(j.p[P.ID]), out = {};
  var n = h.getLastRow(), filas = n < 2 ? [] : h.getRange(2, 1, n - 1, 3).getValues();
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][0]) === id && String(filas[i][1]).indexOf(pre) === 0) out[String(filas[i][1])] = String(filas[i][2]);
  }
  return { ok: true, estados: out };
}

// Etiqueta para reconocerse sin exponer el nombre completo: 2 primeras palabras + iniciales del resto
function _etiquetaNombre(nombre) {
  var p = String(nombre || '').trim().split(/\s+/).filter(function (x) { return x; });
  if (p.length <= 2) return p.join(' ');
  return p.slice(0, 2).join(' ') + ' ' + p.slice(2).map(function (x) { return x.charAt(0).toUpperCase() + '.'; }).join(' ');
}
// Primer ingreso: nombres (abreviados) de quienes aún no activan su perfil en un grupo. Solo con el primer ingreso ABIERTO.
function accionListaPrimerIngreso(req) {
  var g = String(req.grupo || '');
  if (CFG.GRUPOS.indexOf(g) < 0) throw new ErrorApi('Grupo no válido.', 'grupo');
  if (props().getProperty('PRIMER_INGRESO') === 'cerrado') throw new ErrorApi('El primer ingreso está cerrado por ahora. Pídele al Profe que lo abra.', 'cerrado');
  var filas = leerTabla(hoja(CFG.HOJA_PERFILES), NC_P), out = [], usados = {};
  filas.forEach(function (f) {
    if (!f[P.ID] || String(f[P.GRUPO]) !== g || f[P.ESTADO] !== 'Pendiente' || String(f[P.APODO]).trim()) return;
    var e = _etiquetaNombre(f[P.NOMBRE]); usados[e] = (usados[e] || 0) + 1;
    out.push({ id: String(f[P.ID]), n: e, lista: Number(f[P.LISTA]) || 0 });
  });
  out.forEach(function (o) { if (usados[o.n] > 1) o.n += ' · N° ' + o.lista; });
  out.sort(function (a, b) { return a.n.localeCompare(b.n, 'es'); });
  return { ok: true, estudiantes: out.map(function (o) { return { id: o.id, n: o.n }; }) };
}

var RUTAS = {
  estado: accionEstado, ranking: accionRanking, registrar: accionRegistrar, entrar: accionEntrar,
  sincronizar: accionSincronizar, visitar: accionVisitar, actividad: accionActividad,
  perfilActualizar: accionPerfilActualizar, cambiarPin: accionCambiarPin,
  estadoGuardar: accionEstadoGuardar, estadoCargar: accionEstadoCargar,
  estadoGuardarLote: accionEstadoGuardarLote, estadoCargarPrefijo: accionEstadoCargarPrefijo,
  activar: accionActivar, listaPrimerIngreso: accionListaPrimerIngreso
};

/* ============================ PUNTOS DE ENTRADA ========================== */
function doGet() { return salida({ ok: true, servicio: 'Aula Gamificada', version: 'v2', mensaje: 'Servidor activo', hora: horaStr() }); }
function doPost(e) {
  var req;
  try {
    var txt = (e && e.postData && e.postData.contents) || '';
    if (txt.length > 60000) return salida({ ok: false, error: 'Solicitud demasiado grande.', codigo: 'tamano' });
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
  if (!props().getProperty('CODIGO_REGISTRO')) props().setProperty('CODIGO_REGISTRO', aleatorio(10).toUpperCase());

  function asegurar(nombre, cabeceras) {
    var h = libroAct.getSheetByName(nombre);
    if (!h) h = libroAct.insertSheet(nombre);
    if (h.getLastRow() < 1) h.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras]);
    return h;
  }
  var CAB_PERFILES = ['ID', 'Nombre completo', 'N° lista', 'Apodo', 'Avatar', 'Grado', 'Grupo', 'Nivel', 'XP', 'Monedas', 'Racha', 'Último ingreso', 'Creado', 'Estado'];
  var hp = libroAct.getSheetByName(CFG.HOJA_PERFILES);
  // Migración v1 → v2: intercala "Nombre completo" y "N° lista" después del ID (conserva los datos)
  if (hp && hp.getLastRow() >= 1 && String(hp.getRange(1, 2).getValue()) === 'Apodo') {
    hp.insertColumnsAfter(1, 2);
    hp.getRange(1, 1, 1, CAB_PERFILES.length).setValues([CAB_PERFILES]);
  }
  hp = asegurar(CFG.HOJA_PERFILES, CAB_PERFILES);
  var hn = asegurar(CFG.HOJA_NOTAS, ['Grupo', 'Nombre completo', 'Materia', 'Semana', 'Avance %', 'Aciertos', 'Preguntas', 'Nota calculada', 'Nota docente (editable)', 'Nota final', 'Última actividad', 'Apodo', 'ID', 'Clave']);
  var hl = asegurar(CFG.HOJA_LISTA, ['Grupo', 'N° lista', 'Nombre completo']);
  var hr = asegurar(CFG.HOJA_RESUMEN, ['Grupo', 'Estudiantes', 'XP total', 'XP promedio']);
  var ha = asegurar(CFG.HOJA_AVANCES, ['Fecha', 'ID', 'Apodo', 'Mundo', 'Actividad', 'XP']);
  var hs = asegurar(CFG.HOJA_SEG, ['ID', 'Hash', 'Sal', 'VersiónPIN', 'Intentos', 'BloqueadoHasta', 'Progreso']);
  var he = asegurar(CFG.HOJA_ESTADOS, ['ID', 'Clave', 'Datos', 'Actualizado']);

  try {
    [hp, hn, hl, hr, ha, hs, he].forEach(function (h) {
      var cab = h.getRange(1, 1, 1, h.getLastColumn());
      cab.setFontWeight('bold'); cab.setBackground('#1d4fd8'); cab.setFontColor('#ffffff'); h.setFrozenRows(1);
      if (h.getMaxRows() < 3000) h.insertRowsAfter(h.getMaxRows(), 3000 - h.getMaxRows());
    });
    function texto(h, col, nCols) { h.getRange(2, col, h.getMaxRows() - 1, nCols).setNumberFormat('@'); }
    texto(hp, 1, 2);     // ID y nombre completo como texto
    texto(hp, 4, 1);     // apodo
    texto(hp, 7, 1);     // grupo
    texto(hp, 12, 2);    // fechas
    texto(hs, 1, 3);     // ID, hash y sal
    texto(he, 1, 4);     // ID, clave, datos y fecha
    texto(ha, 1, 5);     // fecha, ID, apodo, mundo y actividad
    texto(hl, 1, 1); texto(hl, 3, 1);
    hn.getRange(2, 1, hn.getMaxRows() - 1, 3).setNumberFormat('@');            // grupo, nombre, materia
    hn.getRange(2, 11, hn.getMaxRows() - 1, 4).setNumberFormat('@');           // última actividad, apodo, ID, clave
    hp.setColumnWidth(2, 260); hp.setColumnWidth(4, 150); hp.setColumnWidth(12, 130); hp.setColumnWidth(13, 130);
    hn.setColumnWidth(2, 260); hn.setColumnWidth(3, 150); hn.setColumnWidth(9, 170);
    hl.setColumnWidth(3, 300);
    // Notas: columna editable resaltada y semáforo de avance y nota
    hn.getRange(1, 9).setBackground('#f59e0b');
    hn.getRange(2, 9, 2999, 1).setBackground('#fff7e0');
    if (!hp.getFilter()) hp.getRange(1, 1, 2, NC_P).createFilter();
    if (!hn.getFilter()) hn.getRange(1, 1, 2, NC_N).createFilter();
    var reglaXP = SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpointWithValue('#ffffff', SpreadsheetApp.InterpolationType.NUMBER, '0')
      .setGradientMaxpointWithValue('#46d063', SpreadsheetApp.InterpolationType.PERCENTILE, '100')
      .setRanges([hp.getRange(2, 9, 2000, 1)]).build();
    hp.setConditionalFormatRules([reglaXP]);
    var rAv = SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpointWithValue('#ffffff', SpreadsheetApp.InterpolationType.NUMBER, '0')
      .setGradientMaxpointWithValue('#46d063', SpreadsheetApp.InterpolationType.NUMBER, '100')
      .setRanges([hn.getRange(2, 5, 2999, 1)]).build();
    var rBaja = SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(0.1, 2.9).setBackground('#f8d7da').setRanges([hn.getRange(2, 10, 2999, 1)]).build();
    var rAlta = SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(4).setBackground('#d4edda').setRanges([hn.getRange(2, 10, 2999, 1)]).build();
    hn.setConditionalFormatRules([rAv, rBaja, rAlta]);
    hp.getRange(2, 14, 2999, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Pendiente', 'Activo', 'Bloqueado'], true).build());
    // Instrucciones junto a la hoja de carga
    hl.getRange(1, 5).setValue('CÓMO CARGAR LA LISTA');
    hl.getRange(2, 5).setValue('1. Pega desde la fila 2: Grupo (ej. 501), N° de lista y Nombre completo.');
    hl.getRange(3, 5).setValue('2. Menú 🎮 Aula Gamificada → "Cargar lista de estudiantes".');
    hl.getRange(4, 5).setValue('3. Todos quedan con PIN ' + CFG.PIN_INICIAL + '. Al entrar por primera vez eligen apodo y cambian el PIN.');
    hl.getRange(5, 5).setValue('Los grupos válidos están en CFG.GRUPOS de Code.gs: ' + CFG.GRUPOS.join(', '));
    hl.setColumnWidth(5, 520);
    // Resumen por grupo: lo calcula el script (sin fórmulas, funciona en cualquier idioma de la hoja)
    hr.getRange(2, 1, 2999, 1).setNumberFormat('@');
    hr.getRange(2, 2, 2999, 2).setNumberFormat('0');
    hr.getRange(2, 4, 2999, 1).setNumberFormat('0.0');
    actualizarResumen(libroAct);
    hs.hideSheet(); he.hideSheet();
  } catch (e) { Logger.log('Formato opcional no aplicado: ' + e); }

  var msg = 'Listo ✅\n\nSiguiente paso: pega tu lista en la hoja "' + CFG.HOJA_LISTA + '" y usa el menú 🎮 Aula Gamificada → "Cargar lista de estudiantes".\n\n' +
    'Después: Implementar → Nueva implementación → Aplicación web\n(Ejecutar como: Yo · Quién tiene acceso: Cualquier persona).';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('Aula Gamificada', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e2) {}
}

// Carga la lista del curso (hoja "Cargar lista") y crea un perfil pendiente por estudiante, con el PIN inicial
function cargarLista() {
  var hl = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.HOJA_LISTA);
  if (!hl) throw new ErrorApi('No encuentro la hoja "' + CFG.HOJA_LISTA + '". Ejecuta "Configurar" primero.', 'config');
  var n = hl.getLastRow();
  if (n < 2) throw new ErrorApi('La hoja "' + CFG.HOJA_LISTA + '" está vacía. Pega Grupo, N° de lista y Nombre completo desde la fila 2.', 'lista');
  var filas = hl.getRange(2, 1, n - 1, 3).getValues();
  return conLock(function () {
    var hp = hoja(CFG.HOJA_PERFILES), hs = hoja(CFG.HOJA_SEG), actuales = leerTabla(hp, NC_P);
    var vistos = {}, ids = {}, nuevosP = [], nuevosS = [], errores = [], repetidos = 0;
    actuales.forEach(function (f) { vistos[String(f[P.GRUPO]) + '|' + Number(f[P.LISTA])] = true; ids[String(f[P.ID])] = true; });
    filas.forEach(function (f, i) {
      var g = String(f[0]).trim(), num = Math.floor(Number(f[1])), nom = String(f[2]).replace(/\s+/g, ' ').replace(/^[=+\-@]+/, '').trim(), fila = i + 2;
      if (!g && !f[1] && !String(f[2]).trim()) return;
      if (CFG.GRUPOS.indexOf(g) < 0) { errores.push('Fila ' + fila + ': el grupo "' + g + '" no está en CFG.GRUPOS.'); return; }
      if (!(num >= 1 && num <= 99)) { errores.push('Fila ' + fila + ': el N° de lista debe ser de 1 a 99.'); return; }
      if (nom.length < 3) { errores.push('Fila ' + fila + ': falta el nombre completo.'); return; }
      var k = g + '|' + num;
      if (vistos[k]) { repetidos++; return; }
      vistos[k] = true;
      var id; do { id = 'u' + aleatorio(8); } while (ids[id]); ids[id] = true;
      var sal = 's' + aleatorio(16);
      nuevosP.push([id, nom, num, '', 1, Number(g.charAt(0)), g, 1, 0, 0, 0, '', horaStr(), 'Pendiente']);
      nuevosS.push([id, hashPin(CFG.PIN_INICIAL, sal), sal, 1, 0, 0, '{}']);
    });
    if (nuevosP.length) {
      hp.getRange(hp.getLastRow() + 1, 1, nuevosP.length, NC_P).setValues(nuevosP);
      hs.getRange(hs.getLastRow() + 1, 1, nuevosS.length, NC_S).setValues(nuevosS);
      cache().remove('rk');
    }
    try { actualizarResumen(SpreadsheetApp.getActiveSpreadsheet()); } catch (e1) {}
    var msg = '✅ Estudiantes nuevos: ' + nuevosP.length + (repetidos ? '\nYa existían (se omitieron): ' + repetidos : '') +
      '\nPIN inicial de todos: ' + CFG.PIN_INICIAL;
    if (errores.length) msg += '\n\n⚠️ Filas con problemas (' + errores.length + '):\n' + errores.slice(0, 12).join('\n') + (errores.length > 12 ? '\n…' : '');
    return msg;
  });
}

// Vuelve a poner el PIN inicial a los estudiantes de las filas seleccionadas en "Perfiles"
function reiniciarPinSeleccion() {
  var h = SpreadsheetApp.getActiveSheet();
  if (h.getName() !== CFG.HOJA_PERFILES) throw new ErrorApi('Ve a la hoja "' + CFG.HOJA_PERFILES + '" y selecciona la fila (o filas) del estudiante.', 'hoja');
  var rg = h.getActiveRange(), f1 = Math.max(2, rg.getRow()), f2 = rg.getRow() + rg.getNumRows() - 1;
  if (f2 < f1) throw new ErrorApi('Selecciona una fila de estudiante (no el encabezado).', 'hoja');
  return conLock(function () {
    var ids = h.getRange(f1, 1, f2 - f1 + 1, 1).getValues(), n = 0;
    ids.forEach(function (r) {
      var id = String(r[0]); if (!id) return;
      var j = cargarJugador(id); if (!j) return;
      var sal = 's' + aleatorio(16);
      j.s[S.SAL] = sal; j.s[S.HASH] = hashPin(CFG.PIN_INICIAL, sal); j.s[S.VER] = Number(j.s[S.VER]) + 1; j.s[S.INT] = 0; j.s[S.BLOQ] = 0;
      j.p[P.ESTADO] = 'Pendiente';
      guardarJugador(j); n++;
    });
    return 'PIN restablecido a ' + CFG.PIN_INICIAL + ' para ' + n + ' estudiante(s). Al entrar deberán crear un PIN nuevo.';
  });
}

function onOpen() {
  try { actualizarResumen(SpreadsheetApp.getActiveSpreadsheet()); } catch (e0) {}
  try {
    SpreadsheetApp.getUi().createMenu('🎮 Aula Gamificada')
      .addItem('⚙️ Configurar (solo la primera vez)', 'configurar')
      .addSeparator()
      .addItem('📋 Cargar lista de estudiantes', 'menuCargarLista')
      .addItem('🔑 Restablecer PIN a ' + CFG.PIN_INICIAL + ' (filas seleccionadas en Perfiles)', 'menuReiniciarPin')
      .addItem('🚪 Abrir / cerrar el primer ingreso', 'menuPrimerIngreso')
      .addItem('📊 Actualizar resumen por grupo', 'menuActualizarResumen')
      .addSeparator()
      .addItem('🔑 Restablecer PIN por apodo', 'menuRestablecerPin')
      .addItem('⭐ Dar XP a un estudiante', 'menuDarXP')
      .addItem('🚫 Bloquear / desbloquear perfil', 'menuBloquear')
      .addItem('🗑️ Eliminar perfil', 'menuEliminar')
      .addSeparator()
      .addItem('🧹 Borrar estudiantes y avances (empezar de cero)', 'menuReiniciarEstudiantes')
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
function menuCargarLista() { _seguro(cargarLista); }
function menuReiniciarPin() { _seguro(reiniciarPinSeleccion); }
function menuPrimerIngreso() {
  var actual = props().getProperty('PRIMER_INGRESO') === 'cerrado' ? 'CERRADO' : 'ABIERTO';
  var r = _pedir('Primer ingreso', 'Ahora está ' + actual + '.\nEscribe "abrir" o "cerrar" (cerrado: nadie puede activar su perfil con el PIN ' + CFG.PIN_INICIAL + '):');
  if (!r) return;
  r = r.toLowerCase();
  if (r !== 'abrir' && r !== 'cerrar') { _avisar('Escribe exactamente abrir o cerrar.'); return; }
  props().setProperty('PRIMER_INGRESO', r === 'abrir' ? 'abierto' : 'cerrado');
  _avisar('Primer ingreso ' + (r === 'abrir' ? 'ABIERTO' : 'CERRADO') + '.');
}

// Borra TODOS los perfiles, PIN, avances y notas para volver a cargar la lista. No toca la configuración.
function reiniciarEstudiantes() {
  return conLock(function () {
    var n = 0;
    [CFG.HOJA_PERFILES, CFG.HOJA_SEG, CFG.HOJA_ESTADOS, CFG.HOJA_NOTAS, CFG.HOJA_AVANCES].forEach(function (nom) {
      var h = hoja(nom), u = h.getLastRow();
      if (u >= 2) { h.getRange(2, 1, u - 1, h.getLastColumn()).clearContent(); n += u - 1; }
    });
    cache().remove('rk');
    try { actualizarResumen(SpreadsheetApp.getActiveSpreadsheet()); } catch (e2) {}
    return 'Listo: se borraron ' + n + ' filas de estudiantes y avances.\nAhora usa "Cargar lista de estudiantes".';
  });
}
function menuReiniciarEstudiantes() {
  var r = _pedir('Empezar de cero', 'Esto BORRA todos los perfiles, PIN, avances y notas.\nEscribe BORRAR para confirmar:');
  if (r !== 'BORRAR') { _avisar('No se borró nada.'); return; }
  _seguro(reiniciarEstudiantes);
}

// "Resumen por grupo": estudiantes, XP total y XP promedio por grupo. Se calcula aquí, sin fórmulas.
function actualizarResumen(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var hp = ss.getSheetByName(CFG.HOJA_PERFILES), hr = ss.getSheetByName(CFG.HOJA_RESUMEN);
  if (!hp || !hr) return;
  var n = hp.getLastRow(), filas = n < 2 ? [] : hp.getRange(2, 1, n - 1, NC_P).getValues(), cuenta = {}, xp = {};
  filas.forEach(function (f) {
    if (!f[P.ID]) return;
    var g = String(f[P.GRUPO]); cuenta[g] = (cuenta[g] || 0) + 1; xp[g] = (xp[g] || 0) + (Number(f[P.XP]) || 0);
  });
  var grupos = CFG.GRUPOS.slice();
  Object.keys(cuenta).forEach(function (g) { if (grupos.indexOf(g) < 0) grupos.push(g); });
  var out = grupos.map(function (g) { var c = cuenta[g] || 0, x = xp[g] || 0; return [g, c, x, c ? Math.round(x / c * 10) / 10 : 0]; });
  hr.getRange(2, 1, Math.max(hr.getMaxRows() - 1, 1), 4).clearContent();
  hr.getRange(2, 1, out.length, 4).setValues(out);
}
function menuActualizarResumen() { _seguro(function () { actualizarResumen(SpreadsheetApp.getActiveSpreadsheet()); return 'Resumen por grupo actualizado.'; }); }
