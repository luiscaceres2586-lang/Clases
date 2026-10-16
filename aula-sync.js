/* ===========================================================================
   AULA ONLINE · SINCRONIZACIÓN v2   (Profe Luis · Colegio Simón Bolívar)
   Guarda el avance de cada estudiante EN LÍNEA (Google Sheets) y lo recupera
   en cualquier computador o celular, sin tocar la lógica de cada clase.

   Cómo se usa: una sola línea, como PRIMERA etiqueta dentro de <head> de
   cada índice de curso y de cada clase (semana):
        <script src="../aula-sync.js"></script>

   Qué hace:
   · Lee la sesión que el estudiante abrió en la portada (apodo + PIN).
   · Clase: al abrir, trae su avance del servidor; mientras trabaja, copia al
     servidor (cada ~15 s y al salir) todo lo que la clase guarda en el
     navegador. Si no hay internet, la clase sigue y se sincroniza al volver.
   · Índice del curso: entra solo con la sesión del Aula (sin otro registro) y
     trae el avance de todas las semanas para mostrar notas y progreso.
   · Si la clase define window.AULA_RESUMEN() → {materia, semana, avance,
     aciertos, preguntas, nota}, ese resumen llena la hoja "Notas y avance".

   Compatibilidad: AulaOnline.sesion/actividad/guardar/cargar (del puente anterior).
   Nunca rompe la clase: si algo falla, la clase funciona como antes (local).
   =========================================================================== */
(function () {
  'use strict';
  var KS = 'aula_sesion_v1', LS, SS;
  try { LS = window.localStorage; SS = window.sessionStorage; LS.getItem('x'); } catch (e) { return; }
  var _set = Storage.prototype.setItem;
  function leer(k) { try { return LS.getItem(k); } catch (e) { return null; } }
  function escribir(k, v) { try { _set.call(LS, k, v); } catch (e) {} }
  function quitar(k) { try { LS.removeItem(k); } catch (e) {} }
  function ses() { try { var s = JSON.parse(leer(KS)); return (s && s.token && s.api) ? s : null; } catch (e) { return null; } }

  /* ---------- llamadas al servidor ---------- */
  function llamar(accion, datos, op) {
    var s = ses(); op = op || {};
    if (!s) return Promise.reject(Object.assign(new Error('sin-sesion'), { codigo: 'sesion' }));
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var tm = setTimeout(function () { if (ctrl) ctrl.abort(); }, op.timeout || 20000);
    return fetch(s.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, keepalive: !!op.keepalive,
      body: JSON.stringify(Object.assign({ accion: accion, token: s.token }, datos || {})), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) { clearTimeout(tm); if (!j || j.ok !== true) { var e = new Error((j && j.error) || 'error'); e.codigo = j && j.codigo; throw e; } return j; })
      .catch(function (e) { clearTimeout(tm); throw e; });
  }

  var S = ses();
  /* ---------- compatibilidad con el puente anterior ---------- */
  window.AulaOnline = {
    sesion: function () { var s = ses(); return s ? { apodo: s.apodo, grupo: s.grupo, grado: s.grado } : null; },
    actividad: function (mundo, clave, puntos) { return llamar('actividad', { mundo: mundo, clave: clave, puntos: puntos }).catch(function () { return { ok: false, otorgado: 0 }; }); },
    guardar: function (clave, objeto) { return llamar('estadoGuardar', { clave: 'c.' + clave, datos: JSON.stringify({ k: { obj: JSON.stringify(objeto) } }) }).catch(function () { return { ok: false }; }); },
    cargar: function (clave) { return llamar('estadoCargar', { clave: 'c.' + clave }).then(function (j) { var r = j.datos ? JSON.parse(j.datos) : null; return r && r.k && r.k.obj ? JSON.parse(r.k.obj) : null; }).catch(function () { return null; }); }
  };
  if (!S) { window.AulaSync = { activo: false, sesion: function () { return null; } }; return; }

  var nombreReal = function () { var s = ses() || S; return s.nombre || s.apodo || ''; };
  window.AulaSync = { activo: true, nombre: nombreReal, sesion: function () { var s = ses(); return s ? { id: s.id, apodo: s.apodo, nombre: s.nombre || s.apodo, grupo: s.grupo, grado: s.grado, avatar: s.avatar } : null; } };

  /* ---------- identidad de esta página ---------- */
  var stem = decodeURIComponent((location.pathname.split('/').pop() || 'index').replace(/\.html?$/i, '')).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 44);
  var rol = /^index/i.test(stem) ? 'indice' : 'leccion';
  var claveL = 'l.' + stem, claveI = 'i.' + stem;
  var dev = leer('aula_dev'); if (!dev) { dev = Math.random().toString(36).slice(2, 10); escribir('aula_dev', dev); }
  var normal = function (t) { return String(t || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_'); };

  /* ---------- aviso visual pequeño ---------- */
  var chip = null, chipT;
  function aviso(txt, tipo, ms) {
    try {
      if (!chip) {
        chip = document.createElement('div');
        chip.setAttribute('role', 'status');
        chip.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483000;padding:5px 11px;border-radius:999px;font:700 12px/1.2 system-ui,sans-serif;color:#fff;background:#1d4fd8;box-shadow:0 2px 8px rgba(0,0,0,.35);opacity:0;transition:opacity .25s;pointer-events:none';
        (document.body || document.documentElement).appendChild(chip);
      }
      chip.textContent = txt; chip.style.background = tipo === 'mal' ? '#c2410c' : tipo === 'ok' ? '#15803d' : '#1d4fd8';
      chip.style.opacity = '1'; clearTimeout(chipT); if (ms) chipT = setTimeout(function () { chip.style.opacity = '0'; }, ms);
    } catch (e) {}
  }
  var velo = null;
  function veloOn(txt) {
    try {
      velo = document.createElement('div');
      velo.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;background:rgba(8,18,50,.93);color:#fff;font:800 18px system-ui,sans-serif;text-align:center';
      velo.innerHTML = '<div style="width:46px;height:46px;border:5px solid rgba(255,255,255,.25);border-top-color:#ffd23f;border-radius:50%;animation:aulaspin .8s linear infinite"></div><div id="aulavt">' + txt + '</div><style>@keyframes aulaspin{to{transform:rotate(360deg)}}</style>';
      document.documentElement.appendChild(velo);
    } catch (e) {}
  }
  function veloOff() { try { if (velo && velo.parentNode) velo.parentNode.removeChild(velo); } catch (e) {} velo = null; }

  /* ---------- claves sucias (cambios aún no enviados) ---------- */
  var KD = 'aula_dirty:' + claveL;
  function sucias() { try { var a = JSON.parse(leer(KD) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function guardarSucias(a) { if (a.length) escribir(KD, JSON.stringify(a)); else quitar(KD); }
  var estabaSucio = sucias().length > 0;
  var hidratando = false, duranteHidratacion = {}, enVuelo = false, timer = null, fin = false;
  var bloqueado = false;      // la página está por recargarse con el avance recuperado: no dejar que lo pise
  var sinHidratar = false;    // no pude consultar el servidor: no subir nada que lo pueda pisar

  /* ---------- espejo: observar lo que la clase guarda ---------- */
  if (rol === 'leccion') {
    Storage.prototype.setItem = function (k) {
      if (bloqueado && this === window.localStorage && String(k).indexOf('aula_') !== 0) return;
      var r = _set.apply(this, arguments);
      try { if (this === window.localStorage) notar(String(k)); } catch (e) {}
      return r;
    };
  }
  function notar(k) {
    if (k.indexOf('aula_') === 0 || fin) return;
    if (hidratando) { duranteHidratacion[k] = 1; return; }
    var a = sucias(); if (a.indexOf(k) < 0) { a.push(k); guardarSucias(a); }
    programar();
  }
  function programar() { if (timer || fin) return; timer = setTimeout(function () { timer = null; empujar(false); }, 15000); }

  function empujar(urgente) {
    if (hidratando || fin || bloqueado) return Promise.resolve();
    if (sinHidratar) return reintentar();
    if (enVuelo) { programar(); return Promise.resolve(); }
    var claves = sucias(); if (!claves.length) return Promise.resolve();
    var k = {}, enviados = {};
    claves.forEach(function (x) { var v = leer(x); if (v !== null && v.length <= 30000) { k[x] = v; enviados[x] = v; } });
    var items = [{ clave: claveL, datos: JSON.stringify({ n: nombreReal(), k: k }), merge: true }];
    try { if (typeof window.AULA_RESUMEN === 'function') { var r = window.AULA_RESUMEN(); if (r) items[0].resumen = r; } } catch (e) {}
    var ki = {}, hay = false;
    Object.keys(k).forEach(function (x) { if (/_(data|resumen)$/.test(x)) { ki[x] = k[x]; hay = true; } });
    if (hay) items.push({ clave: claveI, datos: JSON.stringify({ n: nombreReal(), k: ki }), merge: true });
    enVuelo = true; aviso('☁️ Guardando…', 'info');
    return llamar('estadoGuardarLote', { items: items }, { keepalive: !!urgente }).then(function (j) {
      if (j.t && j.t[0]) escribir('aula_t:' + claveL, String(j.t[0]));
      if (j.t && j.t[1]) escribir('aula_t:' + claveI, String(j.t[1]));
      var ahora = sucias().filter(function (x) { return !(x in enviados) || leer(x) !== enviados[x]; });
      guardarSucias(ahora); aviso('☁️ Avance guardado', 'ok', 1800);
      if (j.xp > 0) aviso('⭐ ¡+' + j.xp + ' XP por completar la clase!', 'ok', 4500);
    }).catch(function (e) {
      if (e && e.codigo === 'sesion') { fin = true; aviso('⚠️ Tu sesión venció: entra de nuevo por la portada', 'mal'); }
      else aviso('⚠️ Sin conexión · se guardará al volver', 'mal', 4000);
    }).then(function () { enVuelo = false; if (sucias().length && !fin) { clearTimeout(timer); timer = null; timer = setTimeout(function () { timer = null; empujar(false); }, 20000); } });
  }

  /* ---------- traer el avance del servidor ---------- */
  function renombrar(k, viejo, nuevo) {
    if (!viejo || !nuevo || viejo === nuevo) return k;
    var nv = normal(viejo), nn = normal(nuevo), o = {};
    Object.keys(k).forEach(function (x) {
      var kk = nv && nn ? x.split(nv).join(nn) : x, vv = k[x];
      if (typeof vv === 'string' && vv.indexOf(viejo) >= 0) vv = vv.split(viejo).join(nuevo);
      o[kk] = vv;
    });
    return o;
  }
  function aplicar(rec, clave) {
    var k = renombrar(rec.k || {}, rec.n, nombreReal());
    Object.keys(k).forEach(function (x) { if (typeof k[x] === 'string') escribir(x, k[x]); });
    escribir('aula_t:' + clave, String(rec.t));
  }
  // Si no pude consultar el servidor, no subo nada hasta poder hacerlo (así no piso el avance guardado)
  function reintentar() {
    return llamar('estadoCargar', { clave: claveL }, { timeout: 7000 }).then(function (j) {
      if (!j.datos) { sinHidratar = false; return empujar(false); }                       // no había nada guardado: ya puedo subir
      var rec = JSON.parse(j.datos);
      if (String(rec.t) === leer('aula_t:' + claveL)) { sinHidratar = false; return empujar(false); }
      aviso('⚠️ Tu avance anterior está en línea: recarga la página para recuperarlo', 'mal');
    }).catch(function () { aviso('⚠️ Sin conexión · tu avance de hoy se guardará al volver', 'mal', 4000); programar(); });
  }
  function terminar(cambio, flag, fallo) {
    hidratando = false;
    if (fallo) { sinHidratar = true; aviso('⚠️ Sin conexión: tu avance anterior no se pudo cargar', 'mal', 6000); }
    if (cambio && !SS.getItem(flag)) { bloqueado = true; try { SS.setItem(flag, '1'); } catch (e) {} aviso('☁️ Avance recuperado', 'ok'); location.reload(); return; }
    try { SS.removeItem(flag); } catch (e) {}
    veloOff();
    var a = sucias(); Object.keys(duranteHidratacion).forEach(function (x) { if (a.indexOf(x) < 0) a.push(x); }); duranteHidratacion = {};
    if (a.length) { guardarSucias(a); programar(); }
  }

  if (rol === 'leccion') {
    hidratando = true; veloOn('☁️ Cargando tu avance…');
    llamar('estadoCargar', { clave: claveL }, { timeout: 7000 }).then(function (j) {
      if (!j.datos) return false;
      var rec = JSON.parse(j.datos);
      if (String(rec.t) === leer('aula_t:' + claveL)) return false;     // ya tengo lo último
      if (estabaSucio) return false;                                       // cambios míos sin enviar: ganan los míos
      aplicar(rec, claveL); guardarSucias([]);
      return true;
    }).catch(function (e) {
      if (e && e.codigo === 'sesion') { aviso('⚠️ Tu sesión venció: entra de nuevo por la portada', 'mal'); return false; }
      return 'fallo';
    }).then(function (c) { terminar(c === true, 'aula_hyd:' + claveL, c === 'fallo'); });
  } else {
    hidratando = true; veloOn('☁️ Cargando tu avance…');
    llamar('estadoCargarPrefijo', { prefijo: 'i.' }, { timeout: 8000 }).then(function (j) {
      var cambio = false;
      Object.keys(j.estados || {}).forEach(function (clave) {
        try {
          var rec = JSON.parse(j.estados[clave]);
          if (String(rec.t) === leer('aula_t:' + clave)) return;
          var hermana = 'aula_dirty:l.' + clave.slice(2);
          if ((leer(hermana) || '[]') !== '[]') return;                   // esa clase tiene cambios sin enviar en este equipo
          aplicar(rec, clave); cambio = true;
        } catch (e) {}
      });
      return cambio;
    }).catch(function () { return false; }).then(function (c) { terminar(c, 'aula_hydi'); });
  }

  /* ---------- guardar al salir o al cambiar de pestaña ---------- */
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') empujar(true); });
  window.addEventListener('pagehide', function () { empujar(true); });
  window.addEventListener('online', function () { if (sucias().length) empujar(false); });
  window.AulaSync.empujar = function () { return empujar(false); };
})();
