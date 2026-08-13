# Estructura académica duplicada/basura — Colegio Andrés Bello (team 9, dev)

Investigación de solo-lectura sobre los 7 servicios de `admin_escolar_servicios`
del team 9 en la base de **desarrollo**, para decidir si "Primaria" y
"Primario" son el mismo nivel duplicado, y si "sds" es basura de pruebas.

Consulta ejecutada con `scripts/investigar-servicios-duplicados.ts`
(`npx tsx --env-file=.env --env-file=.env.local scripts/investigar-servicios-duplicados.ts`).
No se hizo ningún cambio en la base.

## Los 7 servicios

| id | nombre | tanda | período | sigerd_servicio_id | grados | secciones | matrículas | estudiantes |
|----|--------|-------|---------|---------------------|--------|-----------|------------|-------------|
| 7 | Bachillerato Académico en Humanidades y Ciencias Sociales | Matutina | 2026-2027 (activo) | 103406 | 2 | 2 | 0 | 0 |
| 6 | Inicial | Matutina | 2026-2027 (activo) | 52370 | 6 | 8 | 0 | 0 |
| 5 | **Primario** | Matutina | 2026-2027 (activo) | 61131 | 6 | 12 | 0 | 0 |
| 2 | Secundario | Matutina | 2026-2027 (activo) | 61425 | 6 | 8 | **1** | **1** |
| 8 | Kinder | Matutina | 2025-2026 (**inactivo**) | null | 0 | 0 | 0 | 0 |
| 9 | **Primaria** | Matutina | 2025-2026 (**inactivo**) | null | 0 | 0 | 0 | 0 |
| 3 | **sds** | sdsd | 2025-2026 (**inactivo**) | null | 1 | 4 | 0 | 0 |

Los dos períodos del team:

| id | nombre | activo |
|----|--------|--------|
| 1 | 2026-2027 | true |
| 3 | 2025-2026 | **false** |

## Patrón que separa los dos grupos

Los 7 servicios caen limpiamente en dos grupos, y la línea divisoria es la
misma en los tres campos a la vez — no es casualidad:

- **Grupo real** (Bachillerato, Inicial, Primario, Secundario): los 4 tienen
  `sigerd_servicio_id` poblado (vienen del sync con SIGERD) y están en el
  período **activo** 2026-2027. `Secundario` ya tiene 1 matrícula real con 1
  estudiante — es producción de verdad, aunque sea dev.
- **Grupo sobrante** (Kinder, Primaria, sds): los 3 tienen
  `sigerd_servicio_id = NULL` (nunca se sincronizaron con SIGERD) y cuelgan
  del período **2025-2026, que ya está marcado `activo = false`**. Ninguno
  tiene una sola matrícula.

## Caso "Primaria" vs "Primario"

**No son dos servicios con datos en conflicto — "Primaria" (id 9) está
completamente vacío**: 0 grados, 0 secciones, 0 matrículas, sin
`sigerd_servicio_id`, y vive en el período ya retirado 2025-2026.

"Primario" (id 5) es la estructura real: 6 grados (Primero…Sexto, cada uno
con `sigerd_grado_id` poblado: 27, 28, 39, 40, 31, 32), 12 secciones (A/B por
grado, cada una con `sigerd_seccion_id` poblado), en el período activo
2026-2027, con `sigerd_servicio_id = 61131`.

Sí, "Primaria" y "Primario" nombran el mismo nivel académico (misma palabra,
dos formas). Pero como uno de los dos no tiene absolutamente nada debajo, no
hay nada que fusionar en el sentido de mover matrículas de un lado a otro. Es
sobrante: probablemente se creó a mano antes de que existiera el sync SIGERD
(por eso no tiene `sigerd_servicio_id`), quedó bajo el período viejo, y nunca
se usó — el trabajo real de matrícula fue a parar a "Primario" cuando llegó
el sync.

**El bug de nombre-duplicado que preocupa (documentos requeridos atados a
texto) hoy no tiene impacto real**, porque los 10 documentos requeridos
configurados para nivel "Primario" cubren exactamente el servicio con
estudiantes reales asociados en el futuro (aunque a día de hoy 0 matrículas
en Primario tampoco). Ningún documento requerido apunta a nivel "Primaria".
El riesgo es solo hacia adelante: si alguien matricula un estudiante bajo el
servicio vacío "Primaria" por error (aparece en el selector porque
`activo = true`), esa matrícula no recibiría ningún documento requerido, en
silencio.

## Caso "sds"

Confirmado como basura de pruebas, con evidencia bastante clara:

- `nombre = 'sds'`, `tanda = 'sdsd'` — literal manoteo de teclado, no un
  nombre de nivel real.
- Su único grado se llama `'Gradi primaria'` (typo, tampoco es un nombre real
  de grado) y no tiene `sigerd_grado_id`.
- Sus 4 secciones son `A`, `B`, `C`, `Seccion D` — inconsistente con el
  patrón de nomenclatura del resto (`A`/`B` simple), otra señal de que se fue
  creando a mano mientras se probaba la pantalla.
- Sin `sigerd_servicio_id`, período ya inactivo, **0 matrículas** en sus 4
  secciones.

No hay caso delicado aquí: está vacío y no tiene ninguna característica de
dato real.

## Bonus: "Kinder" (no se pidió, pero es la misma categoría)

Mismo patrón que "Primaria": vacío, sin `sigerd_servicio_id`, período
inactivo. No estaba entre los dos problemas reportados por el usuario, pero
lo dejo anotado porque cualquier limpieza de "el período viejo sobrante"
debería decidir sobre los tres a la vez (Kinder, Primaria, sds), no solo dos.

## Qué decidir antes de ejecutar nada

1. **¿El período "2025-2026" (id 3, ya `activo = false`) se va a seguir
   usando?** Si la respuesta es "no, es historia muerta que se va a
   archivar", los 3 servicios sobrantes (Kinder, Primaria, sds) se pueden
   limpiar juntos sin más análisis. Si la respuesta es "sí, se va a reabrir
   con datos reales en algún momento", entonces no tocar nada todavía — solo
   quitarlos de los selectores activos mientras tanto.
2. **¿Desactivar (reversible) o borrar (definitivo)?** `scripts/limpiar-estructura.sql`
   deja las dos opciones escritas, con la opción de desactivar (`activo =
   false`) aplicada por defecto y el borrado físico comentado. El borrado
   físico requiere un orden explícito por las llaves foráneas (cursos → grados
   → servicio, sin `ON DELETE CASCADE` en este esquema) — ya está resuelto en
   el script si se decide usarlo.
3. **¿Se debe extender el mismo criterio a otros teams?** Este análisis es
   solo del team 9. Si el patrón "sin sigerd_servicio_id + período inactivo +
   cero matrículas" se repite en otros colegios, valdría la pena correr la
   misma consulta ahí antes de asumir que es un caso aislado.
4. El script SQL termina en un `SELECT` de verificación **sin `COMMIT` ni
   `ROLLBACK`** a propósito — el humano que lo corra debe mirar el resultado
   y escribir uno de los dos explícitamente.

## Archivos

- `scripts/investigar-servicios-duplicados.ts` — consulta de solo lectura que
  generó las cifras de este documento.
- `scripts/limpiar-estructura.sql` — propuesta de limpieza (desactivar por
  defecto, borrado físico comentado). **No ejecutado.**
