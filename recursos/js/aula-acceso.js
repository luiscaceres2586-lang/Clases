/* ===========================================================================
   UN SOLO ACCESO. Los índices de curso (Aritmética/Tecnología 4.° y 5.°) ya entran solos con el perfil
   que el estudiante usó en la portada. Si NO hay perfil del Aula, en vez de pedir otro registro con
   avatar, nombre y clave, se muestra un mensaje simple: «Primero entra con tu perfil» → portada → vuelve aquí.
   · Sin internet no se muestra (se usa el registro de este equipo).
   · «Usar el registro de este equipo» deja ver el registro antiguo (solo para ese caso).
   =========================================================================== */
(function () {
  'use strict';
  var me = document.currentScript, root = '';
  try { root = new URL('../../', me.src).href; } catch (e) { return; }
  var m = decodeURIComponent(location.pathname).match(/periodo-(\d)\/(aritmetica|tecnologia)-(\d)\//i);
  if (!m) return;
  function listo(f) { if (document.readyState !== 'loading') f(); else document.addEventListener('DOMContentLoaded', f); }
  listo(function () {
    try {
      if (sessionStorage.getItem('aula_registro_local') === '1') return;
      var ya = JSON.parse(sessionStorage.getItem('sesion_activa') || 'null');
      if (ya && ya.expira > Date.now()) return;                                   /* ya entró (automático o registro) */
      if (window.AulaModo && AulaModo.sinRed()) return;                          /* sin internet: registro de este equipo */
      var A = window.AulaSync, a = A && A.activo && A.sesion(), grado = m[3];
      var otroGrado = !!a && String(a.grupo).charAt(0) !== grado;
      var vuelve = 'periodo-' + m[1] + '/' + m[2] + '-' + m[3] + '/index_' + m[2] + m[3] + '_p' + m[1] + '.html';
      var s = document.createElement('style');
      s.textContent = '#aula-acceso{position:fixed;left:0;right:0;bottom:0;top:var(--aula-h,56px);z-index:2147482000;display:grid;place-items:center;padding:16px;overflow:auto;font-family:"Nunito","Trebuchet MS",system-ui,sans-serif;color:#0b1a5c;background:radial-gradient(800px 420px at 12% -4%,rgba(255,255,255,.75),transparent 62%),linear-gradient(180deg,#2f8cff 0%,#5ab8ff 55%,#c4ecff 100%)}' +
        '#aula-acceso .c{width:min(100%,460px);text-align:center;background:rgba(255,255,255,.88);border:5px solid #fff;border-radius:32px;padding:20px 18px 22px;box-shadow:0 18px 40px rgba(10,50,140,.3)}' +
        '#aula-acceso img{height:130px;filter:drop-shadow(0 8px 10px rgba(10,40,120,.35))}#aula-acceso h2{margin:6px 0 6px;font-size:clamp(1.5rem,6vw,2rem);line-height:1.1}' +
        '#aula-acceso p{margin:0 0 16px;font-weight:800;font-size:1.05rem}' +
        '#aula-acceso .b{display:block;width:100%;font:inherit;font-weight:900;font-size:1.2rem;cursor:pointer;text-decoration:none;color:#fff;border:4px solid #0f6b30;border-radius:999px;padding:12px 16px;background:linear-gradient(180deg,#4ade80,#16a34a);box-shadow:0 6px 0 #0f6b30;text-shadow:0 2px 0 rgba(0,0,0,.25)}' +
        '#aula-acceso .b:active{transform:translateY(3px);box-shadow:0 3px 0 #0f6b30}' +
        '#aula-acceso .l{display:inline-block;margin-top:16px;font:inherit;font-weight:800;font-size:.85rem;color:#0b1a5c;opacity:.75;background:none;border:0;text-decoration:underline;cursor:pointer}';
      document.head.appendChild(s);
      var d = document.createElement('div'); d.id = 'aula-acceso'; d.setAttribute('role', 'dialog');
      var c = document.createElement('div'); c.className = 'c';
      var im = document.createElement('img'); im.alt = 'Bolí'; im.src = root + 'recursos/imagenes/personajes/personajes_boli-piensa.png'; c.appendChild(im);
      var h = document.createElement('h2'); h.textContent = otroGrado ? 'Esta clase no es de tu grado' : 'Primero entra con tu perfil'; c.appendChild(h);
      var p = document.createElement('p'); p.textContent = otroGrado ? 'Es de ' + grado + '°. Tu grupo es el ' + a.grupo + '. Elige tu clase en la portada.' : 'Así se guardan tu nota y tu avance. Entras una sola vez.'; c.appendChild(p);
      var b = document.createElement('a'); b.className = 'b'; b.textContent = otroGrado ? '🏠 Ir a la portada' : '🎮 Entrar con mi perfil'; b.href = root + 'index.html' + (otroGrado ? '' : '?vuelve=' + encodeURIComponent(vuelve)); c.appendChild(b);
      if (!otroGrado) {
        var l = document.createElement('button'); l.type = 'button'; l.className = 'l'; l.textContent = 'Usar el registro de este equipo (sin perfil del Aula)';
        l.addEventListener('click', function () { try { sessionStorage.setItem('aula_registro_local', '1'); } catch (e) {} d.remove(); });
        c.appendChild(l);
      }
      d.appendChild(c); document.body.appendChild(d);
    } catch (e) { console.warn('Aula: acceso único omitido', e); }
  });
})();
