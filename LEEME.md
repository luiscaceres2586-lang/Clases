# Aula Gamificada · Profe Luis

## Usarla SIN internet (en la sala)
1. Descarga el repositorio completo (Code → Download ZIP) y descomprímelo. No abras los archivos desde dentro del ZIP.
2. Abre `index.html` con doble clic. Todo es local: fuentes, confeti, imágenes y enlaces.
3. Sin internet el avance se guarda en el navegador del equipo. Al volver el internet, el botón de la barra superior (🌐 En línea / 📴 Sin internet) permite sincronizar.

## Estructura
- `index.html` portada
- `periodo-1/` … `periodo-4/`, cada uno con `aritmetica-4`, `aritmetica-5`, `tecnologia-4`, `tecnologia-5`
- `recursos/` scripts, fuentes, estilos y el banco de imágenes
- `servidor/Code.gs` servidor de Google Apps Script (ver INSTRUCCIONES.md)

## Reglas para agregar clases nuevas
- Ponerlas en `periodo-N/area-grado/`.
- Nombre de la clase: `semanaN_mat4_pN.html` (mat o tec, grado y período). El índice: `index_aritmetica4_pN.html` o `index_tecnologia5_pN.html`.
- En el `<head>`, estas líneas (con `../../`): `recursos/css/fuentes.css`, `recursos/js/aula-sync.js`, `recursos/js/aula-config.js`, `recursos/js/aula-contexto.js` (en ese orden).
- No usar enlaces `https://` a scripts, fuentes o estilos: así la clase sigue funcionando sin internet.

## Período en curso
En `recursos/js/aula-config.js` cambia `PERIODO_ACTUAL` (y `PERIODOS_LISTOS` cuando publiques clases de otro período). Si un estudiante abre una clase de otro período, la barra superior muestra una alerta roja.

## Navegador recomendado para la copia descargada
Usa **Google Chrome o Microsoft Edge** al abrir los archivos con doble clic. Otros navegadores (por ejemplo Firefox o Safari) pueden no compartir la sesión entre archivos locales y mostrar la pantalla «ENTRASTE SIN TU PERFIL» aunque el estudiante ya haya entrado.

## Qué está comprobado (con navegador real, sin internet y con archivos locales)
- Portada, 4 índices y clases cargan sin pedir nada de internet.
- Camino completo: menú de semanas → ¡EMPEZAR! → clase con el nombre del estudiante → Siguiente.
- El botón 🌐 / 📴 bloquea las conexiones y recuerda el modo entre páginas.
Lo que NO se pudo comprobar: la lista real de estudiantes (viene del servidor de Google) y navegadores distintos de Chrome.

## Índices de curso con texto (plantilla para los períodos 1 a 3)
- Plantilla: `recursos/plantillas/indice-curso.html`. Generador: `herramientas/crear_indice.py`.
- Cada vez que agregues una clase `periodo-N/area-G/semanaK_..._pN.html`, ejecuta `python herramientas/crear_indice.py N area G` (por ejemplo `python herramientas/crear_indice.py 1 aritmetica 4`). Las clases que existan salen con «¡EMPEZAR!» y las que faltan con «En construcción».
- El índice también muestra el avance de cada semana (barra, nota, «Continuar» o «Repasar») y cuántas semanas lleva completadas, leyendo lo que guarda cada clase en el equipo del estudiante.
- El índice entra solo con la sesión de la portada y entrega a la clase la misma sesión que usan los índices de galaxia del período 4. No necesita imagen de fondo.
- Cuando un período ya tenga clases publicadas, agrégalo en `PERIODOS_LISTOS` de `recursos/js/aula-config.js`.

## Mascotas
Bolí es la única mascota de la portada y los índices. ARIA vive solo dentro de las clases.

## Usar las clases sin internet SIN descargar el ZIP (cuando se abre la página por internet)
- En la portada hay un botón **📥 Usar sin internet**: guarda en el equipo la portada y un curso completo (una sola vez, con internet). Después el curso abre aunque se vaya la señal.
- Funciona con un *service worker* (`sw.js`) y una lista de archivos (`offline-manifest.json`). Solo corre en páginas https (por ejemplo GitHub Pages); con archivos locales no hace falta.
- **Cada vez que agregues clases o imágenes, regenera la lista:** `python herramientas/crear_manifiesto.py` y sube `offline-manifest.json`.
- Las páginas, scripts y estilos se piden primero a internet (así llegan las actualizaciones) y, si no hay señal o va muy lenta, se usa lo guardado.
- Comprobado con navegador real: con el servidor apagado, abrió la portada, el índice y una clase guardados; una clase no guardada no abrió.

## Cómo entra el estudiante (una pregunta por pantalla)
1. **¿Quién eres?** (Ya tengo perfil · Primer ingreso · Solo mirar) → 2. **¿De qué grado eres?** → 3. **¿Qué quieres estudiar?** (Aritmética o Tecnología) → 4. **¿En qué período vamos?** → índice de semanas del curso → clase.
Con el perfil ya iniciado se salta el grado y empieza en «¿Qué quieres estudiar?». Cada pantalla tiene «← Atrás».
