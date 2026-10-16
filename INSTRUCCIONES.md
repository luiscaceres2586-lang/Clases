# Aula Gamificada v2 — piloto (Aritmética 5° · semana 1)

## Qué cambia
- **Lista de estudiantes**: el Profe pega Grupo, N° de lista y Nombre completo en la hoja "Cargar lista". Todos arrancan con PIN **1111**.
- **Primer ingreso** (portada → "Primer ingreso"): el estudiante elige su grupo y número de lista, escribe 1111, ve su nombre real, elige apodo y crea un PIN nuevo. Después entra con apodo + PIN desde cualquier equipo.
- **La liga solo muestra apodos.** El nombre real lo ven el Profe (hoja Perfiles) y el propio estudiante (Mi jugador).
- **Avance en línea**: las clases guardan en el servidor y lo recuperan en otro computador o celular.
- **Hoja "Notas y avance"**: una fila por estudiante y clase (avance %, aciertos, nota). La columna naranja "Nota docente (editable)" es tuya: si la llenas, "Nota final" usa tu nota.
- Se retiró el código de registro `SIMON2026`: el registro libre queda cerrado.

## Instalación (en este orden)
1. **Apps Script**: abre el proyecto de tu hoja "Aula Gamificada - Datos" → reemplaza todo `Code.gs` por el de este paquete.
   - Si tus grupos no son 401, 402, 403, 501, 502 (por ejemplo, tienes 3°), edita `CFG.GRUPOS` al inicio del archivo.
2. Ejecuta **`configurar`** una vez. Migra la hoja Perfiles (conserva tu perfil de prueba) y crea "Notas y avance" y "Cargar lista".
3. En la hoja **"Cargar lista"** pega desde la fila 2: Grupo, N° lista, Nombre completo. Menú **🎮 Aula Gamificada → Cargar lista de estudiantes**.
4. **Implementar → Administrar implementaciones → ✏️ Editar → Versión: Nueva versión → Implementar.** (La URL del servidor no cambia. Sin este paso, el servidor sigue con el código viejo.)
5. **GitHub**: sube/reemplaza `index.html`, `aula-sync.js` (en la raíz) y las dos páginas de `aritmetica 5°`.

## Uso en el aula
- Entrega a cada estudiante su grupo y su N° de lista. El PIN inicial es 1111.
- Cuando todos hayan activado su perfil, cierra la puerta: menú **Abrir / cerrar el primer ingreso → cerrar**.
- ¿Olvidó el PIN? En "Perfiles" selecciona su fila → **Restablecer PIN a 1111**. Conserva su apodo y avance.
- Para corregir un nombre o apodo, edítalo directamente en "Perfiles" (el ID de la columna A no se toca). Si cambias un nombre, el avance de la estudiante se conserva.
- Los estudiantes deben entrar por la portada → su curso → la semana (no por el enlace directo de la clase).

## Alcance del piloto
Solo **Aritmética 5°** (su índice y la semana 1) tiene la sincronización. Las demás clases siguen guardando solo en el navegador hasta que se les aplique el mismo cambio (una línea en el `<head>` y un bloque `AULA_RESUMEN`).
