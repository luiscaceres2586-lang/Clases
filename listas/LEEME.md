# Lista de estudiantes (para elegir el nombre sin escribirlo, con o sin internet)

Así queda: en el registro de cada curso el estudiante **se busca en la lista, toca su nombre** y sigue con su avatar y su clave. Si un curso no tiene lista, se escribe el nombre como siempre.

## Opción 1 · La más fácil (sin instalar nada)
1. En Excel o Google Sheets arma **dos columnas**: `curso` y `nombre` (una fila por estudiante). Cursos: 401, 402, 403 (4.°) y 501, 502 (5.°).
2. Copia las filas, abre `listas/preparar-lista.html` (doble clic), **pégalas** en el cuadro de tu grado y pulsa **Revisar**.
3. Pulsa **Descargar lista.js** y guárdalo dentro de esta carpeta (`listas`), reemplazando el anterior.

## Opción 2 · Con los archivos CSV
1. Llena `grado-4.csv` y `grado-5.csv` (formato `curso;nombre`; guarda como «CSV UTF-8»). Borra la fila que empieza por EJEMPLO.
2. Ejecuta `python herramientas/crear_lista.py` (genera `lista.js`).

## Para que quede en todos los equipos
Sube a GitHub `lista.js` (y los CSV si quieres conservarlos). Después descarga el repositorio en los equipos: ya funciona sin internet.

## Reglas
- Solo nombres y curso (sin números de documento). Escribe cada nombre igual que en la lista oficial; las tildes y la ü están permitidas.
- Los nombres repetidos en un mismo curso se dejan una sola vez. Un nombre ya registrado en ese computador aparece marcado «ya tiene perfil».
