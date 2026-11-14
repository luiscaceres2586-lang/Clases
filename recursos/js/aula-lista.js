/* ===========================================================================
   LISTA DE ESTUDIANTES EN EL REGISTRO (con o sin internet).
   Lee listas/lista.js (window.AULA_LISTA[grado][curso] = [nombres]) y, en «Crear mi Astro-Perfil»,
   cambia «escribe tu nombre» por «búscate en la lista y toca tu nombre». Después sigue el proceso normal
   (avatar y clave). Si no hay lista para ese curso, queda el campo de texto de siempre.
   =========================================================================== */
(function () {
  'use strict';
  var me = document.currentScript, root = '';
  try { root = new URL('../../', me.src).href; } catch (e) { return; }
  var m = decodeURIComponent(location.pathname).match(/periodo-(\d)\/(aritmetica|tecnologia)-(\d)\//i);
  if (!m) return;
  var grado = m[3];
  function sin(t) { return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function nombresDe(curso) { var L = window.AULA_LISTA; return (L && L[grado] && L[grado][curso]) || []; }
  var cargada = false, dom = document.readyState !== 'loading';
  function intento() { if (cargada && dom) enganchar(); }
  var s = document.createElement('script'); s.src = root + 'listas/lista.js'; s.onerror = function () {}; s.onload = function () { cargada = true; intento(); }; document.head.appendChild(s);
  if (!dom) document.addEventListener('DOMContentLoaded', function () { dom = true; intento(); });
  window.addEventListener('load', function () { intento(); });
  function enganchar() {
    if (typeof window.abrirRegistro !== 'function' || window.abrirRegistro.__lista) return;
    var original = window.abrirRegistro;
    window.abrirRegistro = function () { original.apply(this, arguments); try { pintar(); } catch (e) { console.warn('Aula: lista omitida', e); } };
    window.abrirRegistro.__lista = true;
  }
  function pintar() {
    var curso = (typeof grupoSeleccionado !== 'undefined' && grupoSeleccionado) || '', nombres = nombresDe(curso);
    var input = document.getElementById('reg-nombre'), viejo = document.getElementById('aula-lista'); if (viejo) viejo.remove();
    if (!input) return;
    if (!nombres.length) { input.style.display = ''; return; }
    var registrados = {}; try { cargarUsuarios().forEach(function (u) { registrados[sin(u.nombre)] = 1; }); } catch (e) {}
    input.style.display = 'none'; input.value = '';
    var caja = document.createElement('div'); caja.id = 'aula-lista';
    caja.innerHTML = '<style>#aula-lista .b{width:100%;font:inherit;font-size:1rem;padding:10px 12px;border-radius:12px;border:2px solid rgba(255,255,255,.35);background:rgba(10,20,70,.65);color:#fff}' +
      '#aula-lista .l{max-height:210px;overflow:auto;margin-top:8px;display:grid;gap:6px}' +
      '#aula-lista .n{text-align:left;font:inherit;font-weight:700;font-size:.98rem;padding:9px 12px;border-radius:12px;border:2px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:#fff;cursor:pointer}' +
      '#aula-lista .n:hover{background:rgba(255,210,63,.25)}#aula-lista .n.ya{opacity:.6}' +
      '#aula-lista .e{display:none;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;border:3px solid #4ade80;background:rgba(74,222,128,.18);color:#fff;font-weight:900}' +
      '#aula-lista .e button{margin-left:auto;font:inherit;font-size:.85rem;border:2px solid #fff;border-radius:99px;background:none;color:#fff;padding:3px 10px;cursor:pointer}</style>' +
      '<input class="b" type="search" placeholder="🔎 Escribe tu apellido o tu nombre…" aria-label="Buscar tu nombre" autocomplete="off"><div class="l" role="listbox"></div><div class="e"><span>✅</span><b></b><button type="button">Cambiar</button></div>';
    input.parentNode.insertBefore(caja, input);
    var q = caja.querySelector('.b'), l = caja.querySelector('.l'), e = caja.querySelector('.e'), nom = e.querySelector('b');
    function lista() {
      l.innerHTML = ''; var t = sin(q.value.trim()), n = 0;
      nombres.forEach(function (x) {
        if (t && sin(x).indexOf(t) < 0) return; n++;
        var b = document.createElement('button'); b.type = 'button'; b.className = 'n' + (registrados[sin(x)] ? ' ya' : ''); b.textContent = registrados[sin(x)] ? x + '  ·  ✅ ya tiene perfil' : x;
        b.addEventListener('click', function () {
          if (registrados[sin(x)]) { if (typeof volverUsuarios === 'function') volverUsuarios(); return; }
          input.value = x; nom.textContent = x; e.style.display = 'flex'; q.style.display = 'none'; l.style.display = 'none';
          var er = document.getElementById('reg-nombre-error'); if (er) er.textContent = '';
        });
        l.appendChild(b);
      });
      if (!n) { var p = document.createElement('p'); p.style.cssText = 'color:#ffd23f;font-weight:800;margin:6px 0'; p.textContent = 'No te encuentro. Revisa cómo escribes tu apellido o avisa a tu profe.'; l.appendChild(p); }
    }
    q.addEventListener('input', lista); lista();
    e.querySelector('button').addEventListener('click', function () { input.value = ''; e.style.display = 'none'; q.style.display = ''; l.style.display = 'grid'; q.value = ''; lista(); q.focus(); });
  }
})();
