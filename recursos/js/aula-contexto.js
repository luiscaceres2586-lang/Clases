/* ===========================================================================
   AULA · CONTEXTO SIEMPRE VISIBLE + MODO EN LÍNEA / SIN INTERNET  (Profe Luis)
   Una sola línea en el <head> de cada clase:
     <script src="../../recursos/js/aula-contexto.js"></script>
   · Lee la carpeta (periodo-N/area-grado/semanaN_...) y muestra una barra fija
     con PERÍODO · ÁREA · GRADO · SEMANA, en colores distintos por área.
   · Si la clase NO es del período en curso, avisa en rojo.
   · Botón 🌐 / 📴: en "sin internet" no se intenta ninguna conexión: todo es local.
   · Si una imagen de internet no carga, pone un dibujo en su lugar.
   =========================================================================== */
(function () {
  'use strict';
  /* El período en curso se cambia en recursos/js/aula-config.js */
  var CFG = { PERIODO_ACTUAL: 4 };
  if (window.AULA_CONFIG) for (var k in window.AULA_CONFIG) CFG[k] = window.AULA_CONFIG[k];

  var KM = 'aula_modo';
  function leer() { try { return localStorage.getItem(KM) || 'auto'; } catch (e) { return 'auto'; } }
  function guardar(v) { try { localStorage.setItem(KM, v); } catch (e) {} }
  function sinRed() { var m = leer(); return m === 'offline' || (m === 'auto' && navigator.onLine === false); }
  window.AulaModo = { sinRed: sinRed, modo: leer };

  /* En modo sin internet ninguna petición web sale: nada se queda "cargando" */
  var _f = window.fetch;
  if (_f) window.fetch = function (u) {
    var s = String((u && u.url) || u);
    if (/^https?:/i.test(s) && sinRed()) return Promise.reject(new TypeError('Aula: modo sin internet'));
    return _f.apply(this, arguments);
  };

  /* Imágenes de internet que no cargan → dibujo de reemplazo */
  var HOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><rect width="200" height="120" rx="14" fill="#e8f1ff"/><text x="100" y="66" font-size="42" text-anchor="middle">🖼️</text><text x="100" y="98" font-size="13" text-anchor="middle" fill="#4a5a85" font-family="sans-serif">Sin internet</text></svg>');
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && !t.dataset.aulaFb && /^https?:/i.test(t.src || '')) { t.dataset.aulaFb = '1'; t.src = HOLDER; }
  }, true);

  var me = document.currentScript, base = '';
  try { base = new URL('../../', me.src).href; } catch (e) {}
  var m = decodeURIComponent(location.pathname).match(/periodo-(\d)\/(aritmetica|tecnologia)-(\d)\/(?:semana(\d+)_)?/i);
  if (!m) {
    var ini = function () {
      var s = document.createElement('style');
      s.textContent = '#aula-modo{position:fixed;left:10px;bottom:10px;z-index:2147483000;font:800 .95rem Nunito,"Trebuchet MS",sans-serif;border-radius:999px;padding:7px 14px;cursor:pointer;color:#fff;border:2px solid rgba(255,255,255,.8);box-shadow:0 4px 14px rgba(0,0,0,.3)}#aula-modo.on{background:#1fc86a;color:#052b16}#aula-modo.off{background:#566079}';
      document.head.appendChild(s);
      var b = document.createElement('button'); b.id = 'aula-modo'; b.type = 'button';
      var est = function () { var off = sinRed(); b.className = off ? 'off' : 'on'; b.textContent = off ? '📴 Sin internet' : '🌐 En línea'; };
      b.onclick = function () { var n = sinRed() ? 'online' : 'offline'; guardar(n); est(); if (n === 'online') try { window.dispatchEvent(new Event('online')); } catch (e) {} };
      window.addEventListener('online', est); window.addEventListener('offline', est); est(); document.body.appendChild(b);
    };
    if (document.body) ini(); else document.addEventListener('DOMContentLoaded', ini);
    return;
  }
  var per = +m[1], area = m[2].toLowerCase(), grado = m[3], sem = m[4] ? +m[4] : 0;
  var A = area === 'aritmetica'
    ? { n: 'ARITMÉTICA', i: '🔢', c: '#ffb020', d: '#ff6a00' }
    : { n: 'TECNOLOGÍA', i: '💻', c: '#22d3ee', d: '#2563ff' };
  var fuera = per !== +CFG.PERIODO_ACTUAL;

  var css = '#aula-ctx{position:fixed;top:0;left:0;right:0;z-index:2147483000;font-family:"Nunito","Trebuchet MS",system-ui,sans-serif;color:#fff;background:#0d1b3d;border-bottom:4px solid ' + A.c + ';box-shadow:0 4px 22px ' + A.c + '88}' +
    '#aula-ctx .fila{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:6px 10px}' +
    '#aula-ctx .p{font-weight:900;letter-spacing:.04em;border-radius:12px;padding:4px 12px;font-size:clamp(.95rem,3.6vw,1.5rem);line-height:1.15;white-space:nowrap}' +
    '#aula-ctx .per{background:#fff;color:#0d1b3d;box-shadow:0 0 14px #fff,0 0 30px ' + A.c + '}' +
    '#aula-ctx .ar{background:linear-gradient(135deg,' + A.c + ',' + A.d + ');color:#101938;text-shadow:none;box-shadow:0 0 16px ' + A.c + '}' +
    '#aula-ctx .sem{border:3px solid ' + A.c + ';color:' + A.c + ';text-shadow:0 0 8px ' + A.c + ',0 0 20px ' + A.c + '}' +
    '#aula-ctx .sp{flex:1}' +
    '#aula-ctx a,#aula-ctx button{font:inherit;font-weight:800;font-size:clamp(.8rem,3vw,1rem);cursor:pointer;text-decoration:none;color:#fff;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.55);border-radius:999px;padding:5px 12px;white-space:nowrap}' +
    '#aula-ctx button.on{background:#1fc86a;border-color:#8dffbd;color:#052b16}#aula-ctx button.off{background:#566079;border-color:#c4cce0}' +
    '#aula-ctx .alerta{background:#e11d48;font-weight:900;text-align:center;padding:6px 10px;font-size:clamp(.9rem,3.4vw,1.25rem);animation:aulaPar 1s infinite alternate}' +
    '@keyframes aulaPar{from{background:#e11d48}to{background:#9f1239}}' +
    'html{padding-top:var(--aula-h,56px)}' +
    /* Las clases de pantalla completa (#app = 100vh, sin scroll) se achican lo que mide la barra: así su botón Siguiente nunca queda fuera */
    '#app{height:calc(100vh - var(--aula-h,56px))!important;height:calc(100dvh - var(--aula-h,56px))!important}' +
    '@media(max-width:640px){#aula-ctx .fila{gap:4px 6px;padding:4px 8px}#aula-ctx .p{font-size:.8rem;padding:3px 9px;border-radius:10px}#aula-ctx a,#aula-ctx button{font-size:.76rem;padding:3px 9px;border-width:1.5px}#aula-ctx .alerta{font-size:.82rem;padding:4px 8px}}';

  function pintar() {
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    var b = document.createElement('div'); b.id = 'aula-ctx'; b.setAttribute('role', 'banner');
    function pill(c, t) { var x = document.createElement('span'); x.className = 'p ' + c; x.textContent = t; return x; }
    var f = document.createElement('div'); f.className = 'fila';
    f.appendChild(pill('per', 'PERÍODO ' + per));
    f.appendChild(pill('ar', A.i + ' ' + A.n + ' · ' + grado + '°'));
    f.appendChild(pill('sem', sem ? 'SEMANA ' + sem : 'ELIGE TU SEMANA'));
    var sp = document.createElement('span'); sp.className = 'sp'; f.appendChild(sp);
    if (sem) { var a1 = document.createElement('a'); a1.href = 'index_' + area + grado + '_p' + per + '.html'; a1.textContent = '📚 Semanas'; f.appendChild(a1); }
    if (base) { var a2 = document.createElement('a'); a2.href = base + 'index.html'; a2.textContent = '🏠 Inicio'; f.appendChild(a2); }
    var bt = document.createElement('button'); bt.type = 'button'; bt.setAttribute('aria-live', 'polite');
    function estado() { var off = sinRed(); bt.className = off ? 'off' : 'on'; bt.textContent = off ? '📴 Sin internet' : '🌐 En línea'; bt.title = 'Toca para cambiar entre En línea y Sin internet'; }
    bt.onclick = function () { var nuevo = sinRed() ? 'online' : 'offline'; guardar(nuevo); estado(); if (nuevo === 'online') try { window.dispatchEvent(new Event('online')); } catch (e) {} };
    window.addEventListener('online', estado); window.addEventListener('offline', estado); estado();
    f.appendChild(bt); b.appendChild(f);
    if (fuera) { var al = document.createElement('div'); al.className = 'alerta'; al.textContent = '⚠️ ¡Cuidado! Esta clase es del PERÍODO ' + per + ' y ahora vamos en el PERÍODO ' + CFG.PERIODO_ACTUAL; b.appendChild(al); }
    document.body.insertBefore(b, document.body.firstChild);
    var ajustar = function () { document.documentElement.style.setProperty('--aula-h', b.offsetHeight + 'px'); };
    /* Encabezados propios de la clase (fijos o pegados arriba) bajan para no quedar tapados */
    var acomodar = function () {
      var h = b.offsetHeight;
      var lista = document.querySelectorAll('header,nav,[id*="header" i],[class*="header" i],[id*="topbar" i],[class*="topbar" i],[id*="navbar" i],[class*="navbar" i]');
      for (var i = 0; i < lista.length; i++) {
        var e = lista[i]; if (b.contains(e)) continue;
        var cs = getComputedStyle(e);
        if ((cs.position === 'fixed' || cs.position === 'sticky') && e.offsetHeight < innerHeight * 0.3) {
          if (e.dataset.aulaTop === undefined) { if (parseFloat(cs.top) !== 0) continue; e.dataset.aulaTop = '0'; }
          e.style.setProperty('top', h + 'px', 'important');
        }
      }
    };
    var cabida = function () {
      if (getComputedStyle(document.body).overflowY !== 'hidden') return;
      var h = b.offsetHeight, k = document.body.children;
      for (var i = 0; i < k.length; i++) {
        var e = k[i]; if (b.contains(e) || /^(SCRIPT|STYLE|LINK|CANVAS)$/.test(e.tagName)) continue;
        var cs = getComputedStyle(e);
        if (cs.position !== 'fixed' && cs.position !== 'absolute' && e.offsetHeight >= innerHeight - 2 && e.id !== 'app') e.style.setProperty('height', 'calc(100vh - ' + h + 'px)', 'important');
      }
    };
    ajustar(); acomodar(); cabida(); window.addEventListener('resize', function () { ajustar(); acomodar(); cabida(); });
    window.addEventListener('load', function () { ajustar(); acomodar(); }); setTimeout(acomodar, 800);
    if (window.ResizeObserver) new ResizeObserver(ajustar).observe(b);
    document.title = 'P' + per + (sem ? '·S' + sem : '') + ' · ' + document.title;
  }
  if (document.body) pintar(); else document.addEventListener('DOMContentLoaded', pintar);
})();
