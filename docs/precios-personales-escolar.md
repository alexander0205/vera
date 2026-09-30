# Precios personales de estudiantes

## Dónde se configuran

En la ficha del estudiante, dentro de un período, **Configuración mensual** permite fijar la mensualidad de ese alumno. **La de su generación** quita la excepción; **Monto propio** guarda un importe en centavos; **Descuento** guarda un porcentaje de 1 a 100. Se persiste en `admin_escolar_matriculas.beca_tipo`, `beca_valor` y `beca_motivo`. El descuento solo se aplica a conceptos que admiten beca.

En el mismo diálogo, **Precio personal de otro concepto** crea o cambia una fila de `admin_escolar_concepto_precios` con `objetivo_tipo='estudiante'` y `objetivo_id` igual al ID del alumno. Este precio gana sobre sección, grado y servicio para ese concepto y período. El producto de facturación se hereda de la tarifa aplicable a la matrícula o del concepto; nunca se toma de la tarifa de otro alumno o grado.

## Cuándo nace la deuda

- **Solo guardar el precio:** el POST guarda la tarifa sin llamar a `devengarPeriodo`. Un devengo posterior puede crear el cargo si el concepto está asignado a la matrícula y ya corresponde cobrarlo.
- **Generar el cargo ahora:** el POST guarda la tarifa y llama a `devengarPeriodo` acotado a la matrícula y al concepto hasta la fecha actual. El motor es idempotente: no duplica un cargo existente. Si el concepto no está asignado o aún no toca, crea cero cargos.

La resolución de tarifas se usa en plan de matrícula, devengo, prefill de factura y proyección del dashboard. Al quitar un precio personal, se elimina únicamente esa tarifa: los cargos existentes se conservan, pues pudieron haberse creado antes de la excepción. Las tarifas de estructura mantienen sus reglas de eliminación de cargos huérfanos.

## Verificación local

`tsc --noEmit` pasó el 30-09-2026. Prueba HTTP contra la app y base local: precio personal de RD$42.36 guardado sin cargo; segundo POST con devengo creó un cargo de 4236 centavos; repetir creó cero. Otra prueba creó y quitó un precio personal en una matrícula que ya tenía un cargo de Inscripción y confirmó que ese cargo siguió intacto. Los datos de prueba se restauraron. La interacción del diálogo en navegador sigue pendiente de verificación: la ficha se renderiza, pero sus botones no respondieron en la sesión de navegador usada en esta revisión.
