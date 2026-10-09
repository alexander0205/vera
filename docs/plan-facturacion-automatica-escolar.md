# Plan — Facturación automática mensual + mora (Administración Escolar)

> Origen: audio de Alex (transcripción `transcripciones/whatsapp_ptt_2026-07-14_170343.md`, MD2 paso 4).
> Estado: **IMPLEMENTADO EN DEV — decisiones de Alex cerradas 2026-07-15.**
> Rama: `feature/administracion-escolar`.
>
> **⚠️ ACTUALIZACIÓN 2026-07-15:** al investigar el código se descubrió que el motor **ya tiene** casi toda la infraestructura: facturación recurrente (`facturasRecurrentes` + cron `/api/cron/facturas-recurrentes` diario 8am, schema diseñado "para colegios") y mora automática (`aplicarRecargosMoraVencidos` + cron `/api/cron/recargos-mora` diario 9am + config por team `recargoMora*`). El paso 3 (mora manual desde cargos) ya está implementado; el paso 4 es **integración**, no build. Ver el handoff autoritativo con instrucciones y decisiones: **`docs/handoff-md2-pasos-3-4.md`**. Este documento queda como contexto histórico del plan original.

> **Cierre:** Alex aprobó enfoque A: una recurrente por matrícula. Día, vencimiento, pago y mora se definen en formulario recurrente existente; auto-generación queda BORRADOR interno, nunca DGII; solo mensualidad; tutor responsable obligatorio. Migración dev `0077` aplicada y E2E UI pasado. El handoff contiene diseño final.

## Objetivo (lo que pidió Alex)

1. **La factura mensual se genera automáticamente al terminar el mes** (ej. día 30, a medianoche, vía cron de Vercel).
2. **El plazo de vencimiento viene de configuración/backend** y puede variar por negocio (un colegio 5 días, otro 2 días).
3. **Si la factura no se paga → entra como Cuenta por Cobrar** (ya es automático: toda factura con saldo pendiente aparece en CxC).
4. **Cargo por mora** cada X días según configuración del colegio, **reutilizando la mora que ya trae el motor de facturación** (no crear un sistema de mora escolar paralelo).

## Lo que YA existe (no reinventar)

- **Motor de facturación** con emisión/borrador: `POST /api/ecf/emitir` (modo borrador se usó en el escenario N:1 staged — factura sin-ncf a nombre del tutor con `dependienteId` por línea).
- **Mora como Nota de Débito (tipo 33)** atada a su factura padre vía `ecf_documents.mora_origen_id`. `getCuentasPorCobrar` ya agrega `moraSaldo`/`moraNotas` por factura y el cobro reparte factura→mora. → La "mora" del módulo escolar debe SER esta ND, no una tabla nueva.
- **Cuentas por Cobrar**: toda factura con `estado_pago IN (PENDIENTE, PARCIAL)` aparece sola. No hay que "mover" nada.
- **Vínculo cargo↔factura**: `admin_escolar_cargos.ecf_document_id` + `sincronizarSaldosDesdeFacturas` (el cargo refleja el cobro de su factura). El cargo sigue siendo la deuda; el cobro vive en la factura. Ver [[handoff-cobro-factura-escolar]] y [[modulo-administracion-escolar]].
- **Prefill de factura desde cargo**: `GET /api/administracion-escolar/cargos/[id]/prefill-factura` + `saldar-con-factura` (hoy manual desde el perfil). El cron reutilizaría esta misma lógica en batch.
- **CRON_SECRET + crons existentes** (patrón de la app; ver rama `perf/db-optimization` y crons de rollups/MV).

## Diseño propuesto (a validar)

### A. Configuración escolar por team (nueva)
Tabla nueva `admin_escolar_config` (una fila por team) o columnas en una config existente:
- `dia_corte` (int, ej. 30 / "último día del mes") — cuándo se genera la factura del mes.
- `plazo_vencimiento_dias` (int, ej. 5) — la factura vence a N días de generada → `ecf_documents.fecha_limite_pago`.
- `mora_cada_dias` (int, ej. 5) — cada cuántos días vencidos se agrega una mora.
- `mora_tipo` ('monto_fijo' | 'porcentaje') + `mora_valor` — cuánto es cada mora.
- `factura_auto_activa` (bool) — encender/apagar la generación por team.
- (posible) `tipo_ecf_auto` — qué tipo emite el cron (ver decisión #2).

### B. Cron de generación mensual (`/api/cron/administracion-escolar/facturas-mensuales`, protegido con CRON_SECRET)
Corre diario; en cada team con `factura_auto_activa` y `dia_corte == hoy`:
1. Halla los cargos de mensualidad del mes/período activo **sin factura** (`ecf_document_id IS NULL`) de estudiantes con matrícula activa.
2. Por cada uno (o consolidado por tutor — decisión #5), genera la factura reutilizando el prefill existente (`POST /api/ecf/emitir` en el modo que decida #2), con `fecha_limite_pago = hoy + plazo_vencimiento_dias`.
3. Vincula `cargo.ecf_document_id`. La factura queda con saldo → aparece sola en CxC.
4. **Idempotente**: no re-facturar un cargo que ya tiene factura; marca de "mes generado" para no duplicar.

### C. Cron de mora (`/api/cron/administracion-escolar/mora`, CRON_SECRET)
Corre diario; para cada factura escolar vencida (`fecha_limite_pago < hoy`, saldo > 0):
- Si pasaron `mora_cada_dias` desde el vencimiento (o desde la última mora) → genera una **ND de mora** (tipo 33, `mora_origen_id = factura.id`) por `mora_valor`, usando el mecanismo de mora que ya tiene el motor.
- El cobro combinado factura+mora ya lo maneja CxC/`PagoModal`.

## Decisiones pendientes de Alex (BLOQUEAN implementación)

1. **Día de corte**: ¿día fijo (30)? ¿último día del mes? ¿configurable por team? ¿genera la factura del mes que termina o del que empieza?
2. **Emisión vs borrador**: la auto-factura, ¿queda **borrador sin-ncf** (como hoy hace el módulo, sin tocar DGII) o se **emite a DGII** (e31/e32)? Esto define `tipoEcf`. Alex fue explícito antes en NO emitir a DGII automáticamente sin decisión — confirmar.
3. **Dónde vive la config**: ¿tabla nueva `admin_escolar_config` por team? ¿quién la edita (permiso `administracion-escolar:configurar`)? ¿UI en Configuración escolar?
4. **Mora = ND del motor**: confirmar que la mora escolar debe ser la ND (tipo 33, `mora_origen_id`) que ya existe, y NO un cargo escolar nuevo. (El audio dice "reutilizar el cargo por mora que viene de la factura" → sí, ND.)
5. **Granularidad**: ¿una factura por cargo, o una factura consolidada por tutor (varios hijos/varios cargos en una)? El reparto N:1 ya está resuelto en `sincronizarSaldosDesdeFacturas`, así que consolidar es viable.
6. **Qué cargos entran**: ¿solo mensualidades del período activo? ¿otros cargos (uniforme, inscripción)? ¿solo estudiantes activos con matrícula activa?
7. **Cliente/beneficiario**: la factura sale a nombre del **tutor responsable de pago** (`clientId`) con `dependienteId` del estudiante — ya garantizado por el modelo unificado. Confirmar que todo cargo a facturar tenga tutor responsable con `clientId` (si no, ¿se omite y se reporta?).
8. **Notificación**: ¿avisar al colegio/tutor cuando se genera la factura o la mora? (email/WhatsApp — fuera de alcance inicial, pero preguntar).

## Restricciones (respetar siempre)
- NO crear un motor de emisión/mora paralelo. Reusar `POST /api/ecf/emitir` y la ND de mora del motor. Ver [[no-contaminar-entidades-genericas]].
- FK unidireccional: `admin_escolar_*` → `ecf_documents`, nunca al revés.
- Migraciones solo contra DB de desarrollo; producción las corre el usuario.
- Cron con `CRON_SECRET`; idempotente; acotado (LIMIT) por team.

## Orden de implementación sugerido (cuando se desbloquee)
1. Tabla + UI de configuración escolar (decisiones #1–#3).
2. Cron de generación mensual (idempotente, borrador o emisión según #2).
3. Cron de mora (ND del motor, según #4).
4. Verificación E2E en dev (team 2) con día de corte forzado.
