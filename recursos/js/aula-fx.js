/*! aula-fx.js — Efectos "videojuego" del Aula gamificada (Profe Luis)
 *  · Cursor con aro luminoso y estela de chispas · ráfaga de partículas al hacer clic · efecto de pulsado en botones
 *  · Transiciones tipo videojuego entre páginas (iris con barra de carga) y entre pantallas
 *  · Intro "Presiona para empezar" · botón ✨ para apagar los efectos
 *  Sin dependencias. Respeta "reducir movimiento", no pinta el cursor en pantallas táctiles y no lanza errores.
 *  API: AulaFX.ir(url,ev) · AulaFX.burst(x,y) · AulaFX.intro({titulo,sub}) · AulaFX.animarTras(nombreFuncion, fn(args)->elemento|[elementos])
 */
(function () {
  'use strict';
  if (window.AulaFX) return;
  var KEY = 'aula_fx', SEL = 'a[href],button,[onclick],input,select,textarea,label,summary,[role="button"],.world,.pf';
  var mq = function (q) { try { return !!(window.matchMedia && matchMedia(q).matches); } catch (e) { return false; } };
  var reduce = mq('(prefers-reduced-motion: reduce)');
  var fine = mq('(pointer: fine)') && !mq('(hover: none)');
  var doc = document, root = doc.documentElement;
  function on() { try { return localStorage.getItem(KEY) !== 'off' && !reduce; } catch (e) { return !reduce; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ═══ si llegamos desde una transición: cuerpo oculto hasta que el iris lo revele (evita el parpadeo) ═══ */
  var llegando = false;
  try { if (on() && sessionStorage.getItem('fx_nav') === '1') { llegando = true; sessionStorage.removeItem('fx_nav'); root.classList.add('fx-arriving'); } } catch (e) {}

  /* ═══ CSS ═══ */
  var css = '' +
    'html.fx-arriving body{opacity:0}' +
    '#fx-canvas{position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2147483000}' +
    '#fx-ring,#fx-dot{position:fixed;left:0;top:0;pointer-events:none;z-index:2147483001;opacity:0;transition:opacity .2s}' +
    '#fx-ring{width:38px;height:38px;margin:-19px 0 0 -19px;border:2px solid rgba(94,234,255,.9);border-radius:50%;box-shadow:0 0 14px rgba(94,234,255,.65),inset 0 0 10px rgba(168,85,247,.45);transition:opacity .2s,scale .16s,border-color .16s,box-shadow .16s}' +
    '#fx-dot{width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:#fff;box-shadow:0 0 10px #5eeaff,0 0 18px #a855f7}' +
    'html.fx-on.fx-seen #fx-ring,html.fx-on.fx-seen #fx-dot{opacity:1}' +
    'html.fx-away #fx-ring,html.fx-away #fx-dot{opacity:0!important}' +
    '#fx-ring.fx-hover{scale:1.55;border-color:rgba(255,210,63,.95);box-shadow:0 0 18px rgba(255,210,63,.8),inset 0 0 10px rgba(255,120,0,.4)}' +
    '#fx-ring.fx-down{scale:.72}' +
    '.fx-pressed{scale:.94!important;filter:brightness(1.25)!important}' +
    '.fx-in{animation:fxIn .4s cubic-bezier(.2,.9,.3,1) both}' +
    '@keyframes fxIn{from{opacity:0;translate:0 20px;scale:.975;filter:blur(3px)}to{opacity:1;translate:0 0;scale:1;filter:blur(0)}}' +
    /* transición de página (iris) */
    '#fx-wipe{position:fixed;inset:0;z-index:2147483200;display:none;pointer-events:none;background:radial-gradient(circle at var(--fx-x,50%) var(--fx-y,50%),#241268 0,#0b0630 55%,#04021a 100%);clip-path:circle(0% at var(--fx-x,50%) var(--fx-y,50%))}' +
    '#fx-wipe::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(94,234,255,.06) 0 2px,transparent 2px 4px)}' +
    '#fx-wipe .fx-load{position:absolute;left:50%;top:50%;translate:-50% -50%;text-align:center;color:#fff;font:900 1.05rem/1.2 Nunito,system-ui,sans-serif;letter-spacing:.2em;text-shadow:0 0 12px #5eeaff}' +
    '#fx-wipe .fx-bar{width:230px;height:9px;margin:12px auto 0;border-radius:99px;background:rgba(255,255,255,.16);overflow:hidden;border:1px solid rgba(94,234,255,.5)}' +
    '#fx-wipe .fx-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#5eeaff,#a855f7,#ffd23f);border-radius:99px}' +
    '#fx-wipe.fx-cover{display:block;pointer-events:all;animation:fxCover .42s cubic-bezier(.7,0,.3,1) forwards}' +
    '#fx-wipe.fx-cover .fx-bar i{animation:fxBar .42s ease-out forwards}' +
    '#fx-wipe.fx-held{display:block;pointer-events:all;clip-path:circle(150% at 50% 50%)}' +
    '#fx-wipe.fx-held .fx-bar i{width:100%}' +
    '#fx-wipe.fx-reveal{display:block;animation:fxReveal .55s cubic-bezier(.7,0,.3,1) forwards}' +
    '#fx-wipe.fx-reveal .fx-bar i{width:100%}' +
    '@keyframes fxCover{from{clip-path:circle(0% at var(--fx-x,50%) var(--fx-y,50%))}to{clip-path:circle(150% at var(--fx-x,50%) var(--fx-y,50%))}}' +
    '@keyframes fxReveal{from{clip-path:circle(150% at 50% 50%)}to{clip-path:circle(0% at 50% 50%)}}' +
    '@keyframes fxBar{to{width:100%}}' +
    /* botón de apagado */
    '#fx-toggle{position:fixed;left:10px;bottom:10px;z-index:9500;width:38px;height:38px;border-radius:50%;border:2px solid rgba(255,210,63,.75);background:rgba(11,20,64,.78);color:#fff;font-size:1.05rem;line-height:1;cursor:pointer;display:grid;place-items:center;box-shadow:0 4px 12px rgba(0,0,0,.4);padding:0}' +
    '#fx-toggle[aria-pressed="false"]{opacity:.6;filter:grayscale(.8)}' +
    '#fx-toggle:hover,#fx-toggle:focus-visible{outline:2px solid #ffd23f}' +
    /* intro */
    '#fx-intro{position:fixed;inset:0;z-index:2147483300;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 40%,#2a1470 0,#0b0630 60%,#03011a 100%);color:#fff;font-family:Nunito,system-ui,sans-serif;text-align:center;cursor:pointer;transition:opacity .5s,scale .5s}' +
    '#fx-intro.fx-out{opacity:0;scale:1.08;pointer-events:none}' +
    '#fx-intro .fx-stars{position:absolute;inset:-50%;background-image:radial-gradient(2px 2px at 20px 30px,#fff,transparent),radial-gradient(2px 2px at 90px 120px,#9fe9ff,transparent),radial-gradient(1.5px 1.5px at 160px 60px,#fff,transparent),radial-gradient(2px 2px at 220px 170px,#ffd23f,transparent),radial-gradient(1.5px 1.5px at 60px 200px,#d7a8ff,transparent);background-size:260px 240px;animation:fxStars 40s linear infinite;opacity:.8}' +
    '@keyframes fxStars{to{transform:translate3d(-260px,240px,0)}}' +
    '#fx-intro .fx-box{position:relative;padding:20px 24px;max-width:92vw}' +
    '#fx-intro .fx-logo{font-size:4.2rem;filter:drop-shadow(0 0 18px #5eeaff);animation:fxFloat 2.4s ease-in-out infinite}' +
    '@keyframes fxFloat{50%{transform:translateY(-10px) rotate(-4deg)}}' +
    '#fx-intro h1{margin:6px 0 4px;font-size:clamp(1.8rem,6vw,3.2rem);font-weight:900;letter-spacing:.06em;background:linear-gradient(180deg,#fff 20%,#ffd23f 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 14px rgba(94,234,255,.7));animation:fxPop .7s cubic-bezier(.2,1.4,.4,1) both}' +
    '@keyframes fxPop{from{opacity:0;transform:scale(.6) translateY(20px)}to{opacity:1;transform:none}}' +
    '#fx-intro p{margin:0 0 18px;font-size:clamp(.9rem,2.6vw,1.1rem);opacity:.92;animation:fxPop .7s .25s cubic-bezier(.2,1.4,.4,1) both}' +
    '#fx-intro .fx-ibar{width:min(320px,70vw);height:10px;margin:0 auto 20px;border-radius:99px;background:rgba(255,255,255,.14);border:1px solid rgba(94,234,255,.55);overflow:hidden}' +
    '#fx-intro .fx-ibar i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#5eeaff,#a855f7,#ffd23f);animation:fxBar 2.4s .2s ease-out forwards}' +
    '#fx-intro .fx-start{font:900 1.05rem Nunito,system-ui,sans-serif;letter-spacing:.14em;color:#0b1440;background:linear-gradient(180deg,#ffd23f,#ffb000);border:0;border-radius:999px;padding:13px 28px;box-shadow:0 6px 0 #b67a00,0 0 22px rgba(255,210,63,.6);cursor:pointer;animation:fxBlink 1.1s ease-in-out infinite}' +
    '@keyframes fxBlink{50%{transform:scale(1.06);box-shadow:0 6px 0 #b67a00,0 0 34px rgba(255,210,63,.95)}}' +
    '@media (prefers-reduced-motion:reduce){#fx-intro *,#fx-wipe *{animation:none!important}}';
  var st = doc.createElement('style'); st.id = 'fx-css'; st.textContent = css; (doc.head || root).appendChild(st);

  /* ═══ estado ═══ */
  var canvas, ctx, ring, dot, wipe, toggle, W = 0, H = 0, dpr = 1;
  var parts = [], raf = 0, last = 0, mx = -100, my = -100, rx = -100, ry = -100, lastMove = 0, lastX = -999, lastY = -999, lastTrail = 0, hue = 190, listos = false;
  var COLORES = [190, 280, 45, 330];

  function medir() { W = innerWidth; H = innerHeight; dpr = Math.min(2, window.devicePixelRatio || 1); if (canvas) { canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); } }
  function arrancarLoop() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function loop(t) {
    raf = 0;
    if (!on() || !ctx) { if (ctx) ctx.clearRect(0, 0, W, H); return; }
    var dt = Math.min(50, t - last); last = t;
    ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter';
    if (fine && ring) { rx += (mx - rx) * 0.24; ry += (my - ry) * 0.24; ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)'; dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)'; }
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
      var k = p.life / p.max, f = dt / 16;
      if (p.ring) { p.r += 2.6 * f; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.strokeStyle = 'hsla(' + p.h + ',100%,70%,' + (k * .8) + ')'; ctx.lineWidth = 2.2 * k + .6; ctx.stroke(); continue; }
      p.x += p.vx * f; p.y += p.vy * f; p.vy += p.g * f; p.vx *= 0.985;
      var r = p.s * (0.4 + k); var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
      g.addColorStop(0, 'hsla(' + p.h + ',100%,80%,' + k + ')'); g.addColorStop(1, 'hsla(' + p.h + ',100%,60%,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 3, 0, 6.2832); ctx.fill();
    }
    if (parts.length || (fine && performance.now() - lastMove < 1400)) raf = requestAnimationFrame(loop);
  }
  function chispa(x, y, o) { if (parts.length > 170) parts.shift(); parts.push(o); }
  function trail(x, y) {
    hue = (hue + 7) % 360;
    chispa(x, y, { x: x + (Math.random() - .5) * 6, y: y + (Math.random() - .5) * 6, vx: (Math.random() - .5) * .6, vy: (Math.random() - .5) * .6 + .15, g: .01, s: 2.2 + Math.random() * 1.6, h: hue, life: 480, max: 480 });
  }
  function burst(x, y) {
    if (!on() || !ctx) return;
    var n = 16, base = COLORES[(Math.random() * COLORES.length) | 0];
    for (var i = 0; i < n; i++) { var a = (i / n) * 6.2832 + Math.random() * .4, v = 2.2 + Math.random() * 3.2; chispa(x, y, { x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: .09, s: 2.6 + Math.random() * 2.4, h: (base + Math.random() * 50) % 360, life: 560 + Math.random() * 260, max: 820 }); }
    chispa(x, y, { x: x, y: y, ring: true, r: 4, h: base, life: 420, max: 420 });
    arrancarLoop();
  }
  function pulsar(e) {
    var el = e.target && e.target.closest && e.target.closest('a[href],button,[onclick],[role="button"],.world,.pf'); if (!el || el.disabled) return;
    el.classList.add('fx-pressed'); setTimeout(function () { el.classList.remove('fx-pressed'); }, 150);
  }

  /* ═══ eventos ═══ */
  function onMove(e) {
    if (!on() || !ctx) return; var t = e.pointerType;
    mx = e.clientX; my = e.clientY; lastMove = performance.now(); root.classList.remove('fx-away');
    if (!root.classList.contains('fx-seen')) { rx = mx; ry = my; root.classList.add('fx-seen'); }
    if (t === 'touch') return;
    var d = Math.abs(mx - lastX) + Math.abs(my - lastY);
    if (d > 14 && lastMove - lastTrail > 22) { lastTrail = lastMove; lastX = mx; lastY = my; trail(mx, my); }
    arrancarLoop();
  }
  function onOver(e) { if (!ring) return; var t = e.target && e.target.closest && e.target.closest(SEL); ring.classList.toggle('fx-hover', !!t); }
  function onDown(e) { if (!on()) return; if (ring) ring.classList.add('fx-down'); burst(e.clientX, e.clientY); pulsar(e); }
  function onUp() { if (ring) ring.classList.remove('fx-down'); }

  function iniciar() {
    if (listos) return; listos = true;
    if (!doc.body || reduce) return;          // accesibilidad: con "reducir movimiento" no se crea ningún efecto
    canvas = doc.createElement('canvas'); canvas.id = 'fx-canvas'; canvas.setAttribute('aria-hidden', 'true'); doc.body.appendChild(canvas); ctx = canvas.getContext('2d');
    if (fine) { ring = doc.createElement('div'); ring.id = 'fx-ring'; dot = doc.createElement('div'); dot.id = 'fx-dot'; ring.setAttribute('aria-hidden', 'true'); dot.setAttribute('aria-hidden', 'true'); doc.body.appendChild(ring); doc.body.appendChild(dot); }
    wipe = doc.createElement('div'); wipe.id = 'fx-wipe'; wipe.setAttribute('aria-hidden', 'true'); wipe.innerHTML = '<div class="fx-load">CARGANDO<div class="fx-bar"><i></i></div></div>'; doc.body.appendChild(wipe);
    medir(); addEventListener('resize', medir, { passive: true });
    doc.addEventListener('pointermove', onMove, { passive: true });
    doc.addEventListener('pointerover', onOver, { passive: true });
    doc.addEventListener('pointerdown', onDown, { passive: true });
    doc.addEventListener('pointerup', onUp, { passive: true }); doc.addEventListener('pointercancel', onUp, { passive: true });
    root.addEventListener('mouseleave', function () { root.classList.add('fx-away'); });
    root.addEventListener('mouseenter', function () { root.classList.remove('fx-away'); });
    /* los enlaces internos viajan con la transición */
    doc.addEventListener('click', function (e) {
      if (!on() || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
      var h = a.getAttribute('href'); if (!h || h.charAt(0) === '#' || /^(javascript|mailto|tel|data|blob):/i.test(h) || a.target === '_blank' || a.hasAttribute('download')) return;
      if (a.origin !== location.origin) return;
      e.preventDefault(); ir(a.href, e);
    }, false);
    /* botón ✨ */
    if (!reduce) {
      toggle = doc.createElement('button'); toggle.id = 'fx-toggle'; toggle.type = 'button'; toggle.textContent = '✨';
      toggle.addEventListener('click', function (e) { e.stopPropagation(); poner(!on()); });
      doc.body.appendChild(toggle);
    }
    estado();
    /* llegada tras una transición: revelar */
    if (llegando) {
      wipe.className = 'fx-held'; root.classList.remove('fx-arriving');
      var quitar = function () { wipe.className = ''; };
      requestAnimationFrame(function () { setTimeout(function () { wipe.className = 'fx-reveal'; setTimeout(quitar, 580); }, 90); });
    }
    addEventListener('pageshow', function (e) { if (e.persisted && wipe) { wipe.className = ''; root.classList.remove('fx-arriving'); } });
  }
  function estado() {
    var v = on(); root.classList.toggle('fx-on', v && fine);
    if (toggle) { toggle.setAttribute('aria-pressed', String(v)); toggle.title = v ? 'Efectos de juego: activados (toca para apagarlos)' : 'Efectos de juego: apagados (toca para encenderlos)'; toggle.setAttribute('aria-label', toggle.title); }
    if (!v && ctx) ctx.clearRect(0, 0, W, H);
  }
  function poner(v) { try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (e) {} estado(); if (v) { arrancarLoop(); } }

  /* ═══ transición de página ═══ */
  function ir(url, ev) {
    if (!on() || !wipe) { location.href = url; return; }
    try {
      var x = ev && ev.clientX != null ? ev.clientX : innerWidth / 2, y = ev && ev.clientY != null ? ev.clientY : innerHeight / 2;
      wipe.style.setProperty('--fx-x', x + 'px'); wipe.style.setProperty('--fx-y', y + 'px');
      sessionStorage.setItem('fx_nav', '1'); wipe.className = 'fx-cover';
    } catch (e) { location.href = url; return; }
    setTimeout(function () { location.href = url; }, 440);
    setTimeout(function () { try { if (wipe) wipe.className = ''; sessionStorage.removeItem('fx_nav'); } catch (e) {} }, 5000);   // por si la navegación no ocurre
  }

  /* ═══ transición entre pantallas (al llamar a funciones que cambian de pantalla) ═══ */
  function animarTras(nombre, fn) {
    try {
      var o = window[nombre]; if (typeof o !== 'function' || o.__fx) return;
      var w = function () {
        var r = o.apply(this, arguments);
        try { if (on()) { var els = fn.apply(null, arguments); (Array.isArray(els) ? els : [els]).forEach(function (el) { if (el && el.getBoundingClientRect && el.offsetParent !== null) { el.classList.remove('fx-in'); void el.offsetWidth; el.classList.add('fx-in'); } }); } } catch (e) {}
        return r;
      };
      w.__fx = true; window[nombre] = w;
    } catch (e) {}
  }

  /* ═══ intro ═══ */
  function intro(o) {
    o = o || {}; if (!on() || !doc.body) return;
    try { if (sessionStorage.getItem('aula_intro_visto') === '1' && !o.siempre) return; sessionStorage.setItem('aula_intro_visto', '1'); } catch (e) {}
    var d = doc.createElement('div'); d.id = 'fx-intro'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Bienvenida');
    d.innerHTML = '<div class="fx-stars"></div><div class="fx-box"><div class="fx-logo">' + esc(o.icono || '🎮') + '</div><h1>' + esc(o.titulo || 'AULA GAMIFICADA') + '</h1><p>' + esc(o.sub || '') + '</p><div class="fx-ibar"><i></i></div><button type="button" class="fx-start">▶ PRESIONA PARA EMPEZAR</button></div>';
    doc.body.appendChild(d);
    var cerrado = false;
    function cerrar() { if (cerrado) return; cerrado = true; doc.removeEventListener('keydown', tecla, true); d.classList.add('fx-out'); setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 560); }
    function tecla(e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); cerrar(); } }
    d.addEventListener('click', function (e) { if (ctx) burst(e.clientX, e.clientY); cerrar(); });
    doc.addEventListener('keydown', tecla, true);
    setTimeout(cerrar, o.auto || 4200);
  }

  window.AulaFX = { ir: ir, burst: burst, intro: intro, animarTras: animarTras, activo: on, poner: poner };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  /* si la página no llegó a iniciar (sin body) no dejar el cuerpo oculto */
  setTimeout(function () { root.classList.remove('fx-arriving'); }, 4000);
})();
