# Plan — Los 3 niveles pendientes del módulo de contabilidad

> Armado 2026-07-23. **No ejecutar hasta que Darian lo pida.**
> Contexto: el plan original (`docs/plan-contabilidad-vera.md`) está cerrado hasta
> donde se acordó; ver `docs/seguimiento-contabilidad.md`. Esto es lo que quedó
> fuera, ordenado por esfuerzo y dependencias.
>
> Rama: `feature/modulo-escolar`. Primera migración libre: **0087**.
> El guion de demo al cliente NO depende de nada de esto — se mantiene igual.

## Orden recomendado

1.1 → 1.2 → 2.1+2.2 → 3.1 → 3.3 → 3.2 (el más grande y el único que
necesita decisión de producto con Alex antes de escribir una línea).

---

## Nivel 1 — Cierre del plan original (barato, sin riesgo)

### 1.1 Estado de resultados

- **Qué:** ingresos − costos − gastos = resultado del período, con rango de fechas.
- **Cómo:** agrupar la salida de `balanceComprobacion()` por `tipo` de cuenta
  (4 ingresos / 5 costos / 6 gastos). La lógica de saldo ya existe y está
  probada (`saldoSegunNaturaleza()` en `lib/contabilidad/reportes.ts` +
  `tests/unit/contabilidad-saldos.test.ts`). Las cuentas de contrapartida
  (4103 Descuentos, naturaleza invertida) ya restan solas.
- **UI:** página nueva bajo Contabilidad, permiso `contabilidad:ver`, filtros de
  fecha en la URL (mismo patrón del libro diario).
- **Sin migración.** Estimado: sesión corta.

### 1.2 Export de los 3 reportes contables

- **Qué:** libro diario, mayor general y balance a Excel. PDF después (o nunca —
  decidir con el uso real).
- **Cómo:** patrón de `/api/cuentas-por-cobrar/export` (ya existe y funciona):
  ruta propia por reporte, respeta los filtros activos vía query params, exporta
  el conjunto filtrado COMPLETO (no la página). El mayor general exporta la
  cuenta seleccionada entera con saldo corrido.
- **Sin migración.** Estimado: sesión corta.

---

## Nivel 2 — Compromisos conocidos (convertir "manual" en "solo")

### 2.1 Cron del barrido de asientos

- **Qué:** que los asientos se generen sin que nadie apriete el botón.
- **Cómo:** el punto de enganche está aislado a propósito en
  `generarAsientosPendientes()`. Ruta cron protegida con `CRON_SECRET` (ya
  existe en el entorno; mirar rutas cron existentes en `app/api/` para copiar el
  patrón). Solo teams con `contabilidad_config.activa = true`. El botón se queda
  — sirve para "quiero verlo ahora".
- **Ojo:** respetar el tope de 200 por barrido por team; el cron itera hasta
  vaciar o hasta un tope global de tiempo.

### 2.2 Promesas vencidas al mismo cron

- **Qué:** `evaluarPromesasVencidas` hoy solo corre en el GET de gestión — una
  promesa que nadie abre no se marca nunca.
- **Cómo:** colgarla del mismo cron de 2.1. Ya es idempotente (marca cumplidas
  antes que incumplidas). Cambio de pocas líneas.

### 2.3 El "saldo invertido" de 1103 en el balance

- **Qué:** hay cobros cuya factura no es asentable → el pago acredita CxC sin
  que exista el débito de la factura → 1103 puede quedar acreedor.
- **PRIMERO INVESTIGAR, después decidir.** Opciones sobre la mesa: (a) asentar
  esos cobros contra una cuenta puente en vez de CxC; (b) generar un asiento
  simplificado para la factura no asentable; (c) documentarlo y dejarlo (estado
  actual). No elegir sin medir cuántos casos reales hay y por qué las facturas
  no son asentables (motivos del barrido).

---

## Nivel 3 — Alcance nuevo (esto es OTRO proyecto, no un pendiente)

> ⚠️ Todo el nivel 3 necesita conversación con Alex antes de empezar: es
> ampliar el producto, no cerrar el módulo. Regla vigente:
> [[no-contaminar-entidades-genericas]] — nada de vocabulario contable en
> tablas genéricas.

### 3.1 Asientos manuales

- **Qué:** que el contador registre ajustes a mano (hoy todo asiento nace de un
  documento).
- **Cómo:** reusar `insertarAsiento()` (el guardián de cuadre ya existe).
  `origen_tipo = 'manual'`. **Trampa:** el índice único
  `(team_id, origen_tipo, origen_id)` exige un `origen_id` — para manuales usar
  un serial propio o el propio id (resolver en diseño; no quitar el índice).
  Permiso `contabilidad:gestionar`. UI: formulario debe/haber con validación de
  cuadre en vivo, solo cuentas imputables y activas.
- **Decisión previa:** ¿los manuales se pueden anular con reverso igual que los
  automáticos? (probablemente sí, mismo mecanismo).

### 3.2 Lado de gastos y compras — INTEGRAR a lo que ya existe

> Corrección (2026-07-23): la primera versión de este plan decía que no había
> registro de compras/gastos. **Falso.** Existen dos fuentes reales:
> `compras_locales` + `compras_locales_items` (UI en `/dashboard/compras`) y
> `caja_movimientos` con `tipo = 'GASTO'` (caja chica por turno).

- **Qué:** generar asientos desde esas dos fuentes. Mismo patrón que facturas:
  contabilidad LEE las tablas de origen, `origen_tipo` nuevos (`compra`,
  `gasto_caja`), FK unidireccional, cero columnas contables en las tablas de
  origen (regla de Alex: no contaminar entidades genéricas).
- **Asientos:**
  - Compra → Debe Inventario/Costo · Haber Cuentas por pagar (o Caja).
  - Gasto caja → Debe cuenta de gasto 6xxx · Haber 1101 Caja.
- **Huecos que exigen decisión de Alex ANTES de codificar** (son SUS tablas):
  1. `compras_locales` no guarda ITBIS → sin él no hay crédito fiscal
     (ITBIS pagado en compras, recuperable ante DGII).
  2. `compras_locales` no tiene forma de pago ni estado de pago → no se sabe
     si el haber va a Caja o a Cuentas por pagar.
  3. `caja_movimientos.descripcion` es texto libre → sin categoría de gasto,
     todo caería a una única cuenta "gastos generales" (o mapa en la config de
     contabilidad, como los métodos de pago — alternativa que NO toca su tabla).
- Nómina, alquiler, depreciación siguen sin fuente: van por asientos manuales
  (3.1) hasta que exista algo. Por eso 3.1 va antes.
- **Migraciones nuevas seguras** (0087+, renumerar si main choca — ya pasó dos
  veces).

### 3.3 Balance general (estado de situación) + períodos

- **Qué:** activo = pasivo + patrimonio a una fecha, y eventualmente cierre de
  ejercicio.
- **Cómo (balance general):** derivable de `balanceComprobacion()` agrupando
  por tipo 1/2/3 + resultado del período (de 1.1) como línea de patrimonio.
  Barato una vez exista 1.1.
- **Cierre de ejercicio:** dejarlo para cuando haya un año real de datos.
  No inventar el mecanismo antes de la necesidad.

---

## Qué NO tocar al implementar

- La `naturaleza` de las cuentas y `saldoSegunNaturaleza()` — resuelto, probado,
  no reabrir (ver seguimiento, trampa del Paso 6).
- El flujo de emisión de facturas — la generación de asientos sigue fuera de él
  a propósito (un fallo contable no puede tumbar una emisión a la DGII).
- Los `bigint` → pasar todo por `aNumero()` de `lib/contabilidad/libro-diario.ts`.
- `guardarConfig` ignora `undefined` en silencio — scripts que configuren deben
  fallar ruidoso.
