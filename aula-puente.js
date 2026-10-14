/* ===========================================================================
   AULA ONLINE · PUENTE PARA LAS CLASES   (Profe Luis)
   Opción A: pega este bloque, dentro de una etiqueta script, antes del cierre
   de body en cada clase.
   Opción B: sube este archivo al repositorio y enlázalo desde la clase con
   una etiqueta script cuyo src sea "../aula-puente.js".
   Usa la sesión que el estudiante abrió en la portada (mismo sitio web).
   --------------------------------------------------------------------------
   AulaOnline.sesion()                     → {apodo, grupo, grado} o null
   AulaOnline.actividad(mundo, clave, xp)  → suma XP (una sola vez por "clave")
        mundo: 'a4' | 'a5' | 't4' | 't5'   clave: ej. 'a5-semana1-reto3'
   AulaOnline.guardar(clave, objeto)       → guarda el avance de la clase en línea
   AulaOnline.cargar(clave)                → recupera ese avance (o null)
   Todas devuelven una Promesa y NUNCA rompen la clase si no hay internet.
   =========================================================================== */
(function () {
  'use strict';
  var KS = 'aula_sesion_v1';
  function ses() { try { var s = JSON.parse(localStorage.getItem(KS)); return (s && s.token && s.api) ? s : null; } catch (e) { return null; } }
  function llamar(accion, datos) {
    var s = ses();
    if (!s) return Promise.reject(new Error('sin-sesion'));
    return fetch(s.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ accion: accion, token: s.token }, datos || {})) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || j.ok !== true) { var e = new Error((j && j.error) || 'error'); e.codigo = j && j.codigo; throw e; } return j; });
  }
  window.AulaOnline = {
    sesion: function () { var s = ses(); return s ? { apodo: s.apodo, grupo: s.grupo, grado: s.grado } : null; },
    actividad: function (mundo, clave, puntos) { return llamar('actividad', { mundo: mundo, clave: clave, puntos: puntos }).catch(function () { return { ok: false, otorgado: 0 }; }); },
    guardar: function (clave, objeto) { return llamar('estadoGuardar', { clave: clave, datos: JSON.stringify(objeto) }).catch(function () { return { ok: false }; }); },
    cargar: function (clave) { return llamar('estadoCargar', { clave: clave }).then(function (j) { return j.datos ? JSON.parse(j.datos) : null; }).catch(function () { return null; }); }
  };
})();
