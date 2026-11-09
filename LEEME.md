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
