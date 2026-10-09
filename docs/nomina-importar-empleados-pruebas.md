# Importar empleados desde Excel (tarea 3.1) — qué se hizo y qué se probó

Probado el 2026-10-09 contra la copia local de prod (empresa Andrés Bello), desde la interfaz y con archivos .xlsx armados a propósito. Los datos de prueba se borraron.

## Cómo funciona
- **Plantilla** (`GET /api/nomina/empleados/plantilla`): .xlsx con los empleados activos y 100 filas libres con desplegables, más una hoja «Cómo importar». Cédula, cuenta y teléfono van como texto para que Excel no se coma el cero inicial.
- **Importar** (`POST /api/nomina/empleados/importar`, pantalla `/nomina/empleados/importar`): dos pasos. La vista previa corre la importación entera y la deshace; «Aplicar» la repite y guarda. Todo o nada.
- **Llave = cédula (11 dígitos).** Nueva → se crea. Existente → se actualiza solo lo que cambió. Celda vacía nunca borra. Nunca da de baja ni reactiva (un empleado de baja se omite con aviso).
- Columnas: cédula, nombres, apellidos, cargo, salario mensual, frecuencia, fecha de ingreso, banco, cuenta, tipo de cuenta, AFP, ARS, días de vacaciones, **incentivo fijo por corrida** (crea, cambia o quita con 0 el incentivo fijo de la Fase A), teléfono, correo.
- Permiso `empleados:gestionar` (el archivo trae salarios y cuentas de banco).

## Pruebas
| Prueba | Resultado |
|---|---|
| 3 altas (cédula sin cero inicial, fecha de Excel, salario `28,500.50`, quincenal, incentivo) | Creados bien; aviso por la cédula; reaplicar el mismo archivo no duplica |
| Archivo con 9 errores distintos (cédula corta, salario `35.000,50`, frecuencia mal escrita, cuenta sin tipo, fecha 31/02, salario de RD$300 millones, fila sin nombre, cédula repetida, correo inválido) | Cada uno con su fila de Excel; con aplicar=1 no se guarda nada |
| Actualizar: salario +60 %, cargo, incentivo a 0, un empleado de baja, uno idéntico, uno nuevo | Solo cambia lo escrito; la baja se omite; aviso por el salto de 60 % |
| **Ida y vuelta real:** descargar la plantilla con 1,003 empleados y subirla sin tocar | 0 cambios, 1,003 «sin cambios» |
| Dos activos con la misma cédula en Zero | Error claro, no adivina |
| 1,000 empleados | Vista previa 2 s, aplicar 4 s (antes del arreglo: 32 s) |
| Texto no Excel, PDF/xls renombrado, vacío, sin cuerpo, JSON en vez de formulario, más de 2 MB | 400 / 413 con mensaje |
| **Bomba zip** (61 KB que se descomprimen a 60 MB) y hoja marcada hasta la fila 1,048,576 | Rechazadas antes de cargar en memoria |
| Archivo hostil: `<img onerror>`, `=CMD()`, `=HYPERLINK`, U+202E, NUL, textos de 500 caracteres | HTML queda como texto plano; fórmulas y textos más largos que la columna se rechazan; controles y U+202E se quitan |
| Rol lector | 403 en plantilla, importar y listado |

## Fallos que encontró la prueba y se corrigieron
1. 1,000 empleados tardaban 32 s (un guardado por fila): ahora inserta por lotes y precarga lo que necesita.
2. 1,000 avisos idénticos «sin fecha de ingreso»: ahora es uno solo con las filas.
3. Nombres de 500 caracteres habrían roto el guardado de TODO el archivo (la columna admite 160): se validan los largos de cada columna.
4. Textos que empiezan con `= + - @` pasaban a la base y luego irían a los CSV de TSS y banco: se rechazan.
5. Una empresa con más de 1,000 empleados no podía ni subir su propia plantilla: tope subido a 3,000.
6. Bomba zip y hoja gigante: nuevo `lib/zip-seguro.ts` y tope de filas.

## Pendientes
- El importador del catálogo de cuentas (`/api/contabilidad/cuentas/importar`) tiene la misma exposición a bombas zip y no revisa el `content-length` antes de leer el cuerpo.
- Las exportaciones CSV (TSS, dispersión bancaria) no escapan textos que empiecen con `=`: hoy el importador de Excel ya no los deja entrar, pero un empleado creado a mano sí podría llevarlos.
- La vista previa no inserta a los empleados nuevos (se calcula en memoria); un choque de datos que solo la base detectaría aparecería al aplicar. Hoy no hay restricciones únicas por cédula.
- Importa empleados con frecuencia semanal pero no sus horas, ni dependientes del SFS.
