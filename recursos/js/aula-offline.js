/* Panel «Usar sin internet»: guarda en el equipo la portada y las clases de un curso para abrirlas sin conexión.
   Solo funciona cuando la página se abre por internet (https). Con la copia descargada (archivos) ya funciona sin internet. */
(function () {
  'use strict';
  var CACHE = 'aula-offline-v1', btn = document.getElementById('verOffline'), box = document.getElementById('offPanel');
  if (!btn || !box) return;
  var ok = 'serviceWorker' in navigator && window.caches && /^https?:/.test(location.protocol), man = null, ocupado = false;
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function mb(b) { return (b / 1048576).toFixed(b > 5e7 ? 0 : 1) + ' MB'; }
  function nombre(k) { var p = k.split('-'); return (p[1] === 'aritmetica' ? '🔢 Aritmética ' : '💻 Tecnología ') + p[2] + '° · Período ' + p[0]; }
  function abs(u) { return new URL(u, new URL('.', location.href)).href; }
  function lista(k) { var v = {}, a = man.nucleo.concat(man.cursos[k]); a.forEach(function (i) { v[i.u] = i; }); return Object.keys(v).map(function (u) { return v[u]; }); }
  function cuantos(k) {
    return caches.open(CACHE).then(function (c) { var a = lista(k); return Promise.all(a.map(function (i) { return c.match(abs(i.u), { ignoreSearch: true }); })).then(function (r) { return { n: r.filter(Boolean).length, t: a.length }; }); });
  }
  function guardar(k, barra, txt, fila) {
    if (ocupado) return; ocupado = true; var a = lista(k), hecho = 0, fallos = 0, sig = 0;
    return caches.open(CACHE).then(function (c) {
      function uno() {
        if (sig >= a.length) return; var i = a[sig++];
        return fetch(abs(i.u), { cache: 'reload' }).then(function (r) { if (!r.ok) throw 0; return c.put(abs(i.u), r); })
          .catch(function () { fallos++; }).then(function () { hecho++; barra.style.width = Math.round(100 * hecho / a.length) + '%'; txt.textContent = hecho + ' de ' + a.length + ' archivos…'; return uno(); });
      }
      return Promise.all([uno(), uno(), uno()]);
    }).then(function () { ocupado = false; pintar(); if (fallos) { var m = el('p', 'off-aviso', '⚠️ ' + fallos + ' archivo(s) no se pudieron guardar. Revisa tu internet y vuelve a intentarlo.'); box.appendChild(m); } });
  }
  function pintar() {
    box.innerHTML = '';
    box.appendChild(el('h3', '', '📥 Usar sin internet'));
    if (!ok) { box.appendChild(el('p', '', location.protocol === 'file:' ? 'Estás usando la copia descargada: ya funciona sin internet. No necesitas guardar nada.' : 'Este navegador no permite guardar las clases para usarlas sin internet.')); return; }
    box.appendChild(el('p', '', 'Guarda tu curso en este equipo UNA vez, con internet. Después podrás abrirlo aunque se vaya la señal.'));
    var cargando = el('p', '', 'Buscando las clases…'); box.appendChild(cargando);
    fetch('offline-manifest.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (m) {
      man = m; cargando.remove(); var cfg = window.AULA_CONFIG || {}, per = String(cfg.PERIODO_ACTUAL || 4);
      Object.keys(m.cursos).filter(function (k) { return k.split('-')[0] === per; }).forEach(function (k) {
        var f = el('div', 'off-fila'), t = el('div', 'off-t'); t.appendChild(el('b', '', nombre(k))); var est = el('small', '', 'Revisando…'); t.appendChild(est); f.appendChild(t);
        var b = el('button', 'btn', '📥 Guardar (' + mb(lista(k).reduce(function (s, i) { return s + i.s; }, 0)) + ')'); b.type = 'button';
        var bar = el('div', 'off-bar'), fill = el('i'); bar.appendChild(fill); var pr = el('small', ''); 
        b.addEventListener('click', function () { b.disabled = true; bar.style.display = 'block'; guardar(k, fill, pr, f); });
        f.appendChild(b); f.appendChild(bar); f.appendChild(pr); box.appendChild(f);
        cuantos(k).then(function (r) { est.textContent = r.n === r.t ? '✅ Guardado: ya puedes usarlo sin internet' : (r.n ? '⬇ Falta guardar ' + (r.t - r.n) + ' de ' + r.t + ' archivos' : '⬇ Aún no está guardado'); if (r.n === r.t) b.textContent = '🔄 Actualizar'; });
      });
    }).catch(function () { cargando.textContent = 'No pude leer la lista de clases. Conéctate a internet e inténtalo otra vez.'; });
  }
  btn.addEventListener('click', function () { var a = box.hidden; box.hidden = !a; btn.setAttribute('aria-expanded', String(a)); if (a) { pintar(); try { box.scrollIntoView({ behavior: 'smooth' }); } catch (e) {} } });
})();
