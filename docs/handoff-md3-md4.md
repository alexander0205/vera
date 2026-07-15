# Handoff — MD3 y MD4 (calendario escolar, cargos y factura)

> Rama: `feature/administracion-escolar`. Fuente: `transcripciones/whatsapp_ptt_2026-07-14_172016.md` (MD3) y `transcripciones/whatsapp_ptt_2026-07-14_172446.md` (MD4).
> Actualizado: 2026-07-15.

## Estado transversal

| Bloque | Estado | Regla |
|---|---|---|
| MD2 paso 4 — facturación automática | ⏸️ BLOQUEADO por decisiones de Alex | No tocar `facturasRecurrentes`, cron, emisión DGII ni configuración automática de mora. Ver `docs/handoff-md2-pasos-3-4.md`. |
| MD3 — calendario escolar real | 🚧 EN CURSO | Se puede avanzar sin MD2 paso 4. Define los meses que el paso 4 consumirá después. |
| MD3 — cargo directo desde perfil | ✅ HECHO, pendiente E2E | Reusa `POST /api/administracion-escolar/cargos`; no crea segundo flujo. |
| MD3/MD4 — factura desde cargo + mes explícito | 🚧 EN CURSO | Selector de cargo listo; falta comprobar E2E prefill y vínculo final. |

## MD3 — Calendario escolar real

### Pedido

Un período escolar no es año calendario. Ejemplo: inicia en agosto 2025 y termina en junio 2026; mensualidades y perfil deben mostrarse en ese orden, con mes **y año**. La fecha de creación de una factura no define su mensualidad.

### Implementado en esta sesión (aún por commit al escribir este handoff)

- Fuente única `lib/administracion-escolar/periodo-utils.ts`: genera meses inclusivos desde `fechaInicio` a `fechaFin` y valida pertenencia.
- Perfil del estudiante recibe fechas del período y muestra filas académicas reales en vez de enero→diciembre fijo. Un período histórico sin fechas pide configurarlas, sin inventar meses.
- Pantallas de cargos seleccionan una mensualidad como `Mes Año` dentro del rango del período. API individual y masiva rechazan un mes fuera del rango.
- APIs de período validan rangos parciales o invertidos.

### Pendiente de MD3

1. Revisión visual/E2E: período 2025-08-01 → 2026-06-30 debe listar agosto 2025…junio 2026, sin enero 2025 ni julio 2026.
2. Revisión E2E de **Agregar cargo**: abre desde período activo, preasigna estudiante/matrícula y crea vía API existente.
3. Revisión E2E de **Crear factura**: selector elige cargo y llega a Facturas con `desdeCargo` correcto.

## MD4 — vínculo de factura al mes correcto

### Hecho antes de esta sesión

- Cargo tiene `mes`, `anio` y `ecfDocumentId`.
- `GET /api/administracion-escolar/cargos/[id]/prefill-factura` prepara cliente tutor, dependiente y línea desde cargo.
- `POST /api/administracion-escolar/cargos/[id]/saldar-con-factura` vincula la factura creada.

### Pendiente

- Perfil ya exige seleccionar cargo antes de abrir Facturas con `desdeCargo`; falta confirmar E2E que al terminar se vincula a ese cargo.
- Confirmar E2E que la vista muestra el cargo/factura bajo su `mes` + `anio`, no por fecha de emisión.

## Límites de diseño

- `admin_escolar_cargos` es dueño de mes/año y referencia la factura; `ecf_documents` sigue genérica.
- Una factura puede ser creada en otra fecha y aun así pertenecer a la mensualidad seleccionada.
- Paso 4 MD2 podrá automatizar sobre estos meses ya validados cuando Alex responda las ocho decisiones de negocio.
