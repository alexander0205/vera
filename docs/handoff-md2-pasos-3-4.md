# Handoff — MD2 pasos 3 y 4 (mora + facturación automática)

> Para que otra IA/chat continúe sin perder contexto. Rama **`feature/administracion-escolar`**.
> Fecha: 2026-07-15. Autor previo dejó pasos 1 y 2 de MD2 hechos y pusheados.

## Dónde estamos (MD2)

MD2 sale de la transcripción `transcripciones/whatsapp_ptt_2026-07-14_170343.md`. Se dividió en 4 pasos:

| Paso | Qué | Estado |
|---|---|---|
| 1 | Registrar pago in-place en el perfil (reusa PagoModal de CxC) | ✅ HECHO + pusheado |
| 2 | Rediseño del perfil (tarjeta horizontal, período filtro-padre, 3 secciones, compacto 14") | ✅ HECHO + pusheado (`21dbbe9`) |
| 3 | **Cargo por mora** (manual, por cargo) | ✅ HECHO — pendiente revisión visual/E2E |
| 4 | **Facturación automática mensual** + vencimiento + mora | ✅ IMPLEMENTADO + migrado dev + E2E UI |

## ⚠️ Orden de EJECUCIÓN: **3 antes que 4**

La numeración de la documentación NO es el orden de ejecución. El **paso 3 ya está implementado**; sigue el **paso 4** (automatización, más grande y necesita decisiones de Alex). El paso 4 automatiza lo que el paso 3 permite forzar manualmente.

---

## Infraestructura del motor que YA EXISTE (clave — no reconstruir)

Descubierto al investigar. Los pasos 3 y 4 son **integración**, no construcción desde cero. Regla de Alex: reusar el motor, nunca crear emisión/mora paralela (ver [[no-contaminar-entidades-genericas]]).

### Mora (Nota de Débito tipo 33) — YA COMPLETA Y VIVA
- **Config por team**: `teams.recargoMoraActivo`, `teams.recargoMoraPorcentaje` (basis points; 200 = 2%), `teams.recargoMoraDiasGracia`. Override por factura/plan: `ecfDocuments.moraPorcentaje`/`moraDiasGracia`, `facturasRecurrentes.moraPorcentaje`/`moraDiasGracia`. **UI de config**: `app/(dashboard)/dashboard/configuracion/page.tsx`.
- **Manual (1 factura)**: `POST /api/facturas/[id]/nota-debito-mora` → `generarNotaDebitoMora(ecfDocumentId, {createdBy})` en `lib/cobranza/nota-debito-mora.ts`. Crea ND tipo 33 BORRADOR interna, EXENTA de ITBIS, atada al padre vía `moraOrigenId`. Idempotente (`ya_existe`→409). Gate `facturas:crear`. Reasons de error: not_found/ya_existe/sin_saldo/es_nota_mora/anulada/mora_cero.
- **Automática (batch/cron)**: `aplicarRecargosMoraVencidos({teamId?})` en `lib/cobranza/recargo.ts`; cron **`/api/cron/recargos-mora`** corriendo **diario 9:00** (ver `vercel.json`). Genera mora a toda factura crédito (tipoPago=2) vencida con saldo>0 que superó los días de gracia, idempotente. **YA está activo para todos los teams con `recargoMoraActivo=true`.**
- **En CxC**: `getCuentasPorCobrar` ya agrega `moraSaldo`/`moraNotas` por factura, y el `PagoModal` (compartido, `components/cuentas-por-cobrar/PagoModal.tsx`) reparte el cobro factura→mora. **El módulo escolar ya cobra la mora sin tocar nada** (el cargo refleja la factura vía `sincronizarSaldosDesdeFacturas`).

### Facturación recurrente — YA EXISTE (diseñada pensando en colegios)
- Tabla **`facturasRecurrentes`** (`lib/db/schema.ts:707`). Campos relevantes (comentarios del schema mencionan explícitamente "caso colegio"):
  - `clientId` (el tutor), `tipoEcf` (default '31'), `tipoPago` (1 contado / 2 crédito), `diasParaPago` (*"Caso colegio: 5 días → vence el día 5"*), `frecuencia` ('mensual'…), **`diaCobro`** (día del mes 1-31 = el "día de corte"), `fechaInicio`/`fechaFin`, `proximaEmision`, `items` (JSON de líneas), `totalEstimado`, `moraPorcentaje`/`moraDiasGracia` override.
- **Generación**: `generarFacturaDeRecurrente(fr, {periodo?})` en `lib/cobranza/recurrente.ts`. Cron **`/api/cron/facturas-recurrentes`** corriendo **diario 8:00**. Manual: `POST /api/facturas-recurrentes/[id]/generar`. La factura generada lleva `origenRecurrenteId` + `periodoRecurrente` (detección de duplicados), entra a CxC si no se paga (automático), y la mora se le aplica sola por el cron de las 9:00.
- UI de gestión: `app/(dashboard)/dashboard/facturas-recurrentes/…`.

**Implicación para el paso 4:** casi todo existe. Lo que falta es el **puente** entre el módulo escolar (concepto/matrícula mensual) y `facturasRecurrentes`, y reconciliar la factura generada con el cargo escolar. Ver más abajo.

---

## PASO 3 — Cargo por mora (manual) — ✅ implementado

**Objetivo (audio de Alex):** en las acciones de un cargo/mensualidad, botón "Cargo por mora" que reutilice la mora que ya trae la factura.

**Entregado:** menú de acciones por mensualidad y otros cargos. Para un cargo pendiente con factura, usuarios con `facturas:crear` ven **Cargo por mora**. Ejecuta `POST /api/facturas/[id]/nota-debito-mora`, muestra éxito, maneja 409 como aviso idempotente, explica 422 (sin saldo/mora cero) y recarga el perfil. No crea datos escolares de mora.

**Archivos:** `app/(dashboard)/dashboard/administracion-escolar/estudiantes/[id]/_perfil-client.tsx`; `app/api/facturas/[id]/nota-debito-mora/route.ts`.

**Seguridad adicional:** endpoint ahora valida que factura pertenezca al `teamId` de sesión antes de generar la ND; IDs de otro equipo responden 404.

**Verificación realizada:** `pnpm exec tsc --noEmit` y `git diff --check` limpios. Falta revisión visual/E2E en servidor local: cargo vencido con factura → Acciones → Cargo por mora; repetir confirma mensaje de nota existente.

**NO** crear una tabla ni cálculo de mora escolar. La mora es la ND del motor.

---

## PASO 4 — Facturación automática mensual — instrucciones + decisiones

### Decisiones de Alex — 2026-07-15 (cerradas)

- **Arquitectura:** enfoque A. Una factura recurrente por matrícula/estudiante.
- **Día de cobro, condición de pago, vencimiento y mora:** se deciden en el formulario existente de factura recurrente, por plan. No se agregó configuración escolar duplicada.
- **DGII:** la generación automática crea solo BORRADORES internos; no envía a DGII.
- **Alcance:** solo mensualidades; inscripción, uniformes y cargos manuales siguen manuales.
- **Tutor:** siempre tutor responsable con `clientId`; sin él no se puede configurar el plan.
- **Matrícula:** al configurar mensualidad se crea y vincula su plan; luego se puede pausar/editar desde Facturas recurrentes.

### Implementación nueva (0077 aplicada a Neon dev)

- `admin_escolar_matriculas.factura_recurrente_id` + `concepto_mensualidad_id`: FK unidireccionales desde escuela; el motor genérico no recibe campos escolares.
- Perfil del estudiante, por período: botón **Configurar mensualidad** abre formulario recurrente ya prellenado con matrícula, tutor y fechas académicas. Al guardar valida: matrícula activa, concepto `mensualidad`, tutor correcto, frecuencia mensual y fechas dentro del período.
- `generarFacturaDeRecurrente` crea borrador y refleja/crea el cargo del mismo mes, vinculado a `ecfDocumentId`. Reintentos son idempotentes.
- Vencimiento ahora parte de la fecha del período generado, no del día tardío en que corra cron.
- Migración `0077` aplicada a Neon dev: columnas, FKs e índice único verificados. Producción la corre el usuario.
- E2E UI: perfil → período con fechas → **Configurar mensualidad** → formulario prellenado. Períodos sin fechas bloquean acción para no crear planes huérfanos.

**Objetivo (audio):** la factura mensual se genera automática al cerrar el mes; el plazo de vencimiento viene de config por negocio; si no se paga entra a CxC; mora cada X días.

**Lo que ya está resuelto por el motor:** generación por cron (`facturas-recurrentes`, 8am), vencimiento (`diasParaPago`/`diaCobro`), entrada a CxC (automática), mora (`recargos-mora`, 9am). **No hay que construir crons nuevos.**

**Lo que falta (el puente escolar) — dos enfoques posibles, decidir con Alex:**

- **Enfoque A (recomendado): una `facturaRecurrente` por matrícula/estudiante.** Al matricular (o desde el perfil), crear una `facturaRecurrente` con `clientId`=tutor responsable, `items`=[{producto del concepto de mensualidad, dependienteId=estudiante, monto}], `frecuencia`='mensual', `diaCobro`=día de corte del colegio, `diasParaPago`=plazo del colegio. El cron ya emite la factura mensual, la vincula por `origenRecurrenteId`, y la mora se aplica sola. Falta: (1) crear/editar/pausar esa recurrente desde el módulo escolar; (2) al generarse la factura, **vincular el cargo escolar** (`admin_escolar_cargos.ecfDocumentId`) o crear el cargo desde la factura, para que el perfil la refleje. Verificar que `items` soporte `dependienteId` por línea (el ecfDocument sí lo tiene: `dependienteId`/`dependienteNombre`).

- **Enfoque B: cron escolar propio** que cada día de corte recorra los cargos de mensualidad sin factura y genere la factura reusando el prefill ya existente (`GET /api/administracion-escolar/cargos/[id]/prefill-factura` + `POST /api/ecf/emitir` borrador). Más control, más código, duplica parte de lo que `facturas-recurrentes` ya hace.

**Reconciliación cargo↔factura:** ya existe `sincronizarSaldosDesdeFacturas` (el cargo refleja el cobro de su factura) y el reparto N:1. Hay que decidir si el cargo se crea ANTES (y se le vincula la factura generada) o se deriva DE la factura.

### Preguntas para Alex (para desbloquear el paso 4)

1. **Enfoque A vs B**: ¿preferís reutilizar `facturasRecurrentes` (una recurrente por estudiante/matrícula, el motor genera y cobra) o un cron escolar propio? (Recomendación: A — el schema de recurrentes ya se diseñó para colegios.)
2. **Emisión vs borrador**: la factura mensual auto, ¿queda **borrador sin-ncf** o se **emite a DGII** (e31/e32)? (`facturasRecurrentes.tipoEcf` lo define; hoy default '31'.) Alex antes pidió no emitir a DGII sin decisión — confirmar.
3. **Día de corte y plazo**: ¿día del mes fijo por colegio (`diaCobro`) y plazo de vencimiento (`diasParaPago`)? ¿un solo valor por team, o por curso/plan? (El motor soporta por-plan.)
4. **Config de mora**: ¿confirmás usar la config de mora por team ya existente (`recargoMoraActivo` + `recargoMoraPorcentaje` en basis points + `recargoMoraDiasGracia`)? ¿Qué % y días de gracia para el/los colegio(s) de prueba? ¿La mora corre sola (cron 9am) o solo manual (paso 3)?
5. **Granularidad de la factura**: ¿una factura por estudiante, o una consolidada por tutor (varios hijos en una)? (El reparto N:1 ya está resuelto en `sincronizarSaldosDesdeFacturas`.)
6. **Qué se factura auto**: ¿solo la mensualidad del período activo? ¿otros cargos (uniforme, inscripción) quedan manuales?
7. **Cliente/beneficiario**: la factura sale a nombre del **tutor responsable** (`clientId`) con `dependienteId` del estudiante — ya garantizado por el modelo unificado. ¿Qué hacer con estudiantes SIN tutor responsable con `clientId` (se omiten y se reportan)?
8. **Arranque**: ¿la recurrente se crea automáticamente al matricular, o manualmente por el administrador desde el perfil/configuración escolar?

### Decisión menor tomada para paso 3
- El botón manual queda disponible aunque el cron pueda correr: permite forzar una mora puntual. No bloquea el paso 4.

---

## Archivos clave (para orientarse)
- Perfil: `app/(dashboard)/dashboard/administracion-escolar/estudiantes/[id]/_perfil-client.tsx` (componentes `PeriodoDetalle`, `MensualidadesTabla`, `FacturaCell`).
- Mora: `lib/cobranza/nota-debito-mora.ts`, `lib/cobranza/recargo.ts`, `app/api/facturas/[id]/nota-debito-mora/route.ts`, `app/api/cron/recargos-mora/route.ts`.
- Recurrentes: `lib/cobranza/recurrente.ts`, `facturasRecurrentes` en `lib/db/schema.ts:707`, `app/api/cron/facturas-recurrentes/route.ts`, `app/api/facturas-recurrentes/[id]/generar/route.ts`, UI `app/(dashboard)/dashboard/facturas-recurrentes/`.
- Escolar cobro/cargo↔factura: `lib/administracion-escolar/queries.ts` (`sincronizarSaldosDesdeFacturas`), `docs/plan-facturacion-automatica-escolar.md` (plan previo, ver con este handoff que lo actualiza).
- Config mora UI: `app/(dashboard)/dashboard/configuracion/page.tsx`.

## Entorno / cómo probar
- Dev server: `preview_start` con config `emitedo-dev` (`.claude/launch.json`) en :3000. Auto-login dev: navegar a `/api/dev/auto-login?email=ferrerasalexander@gmail.com` (team 2 = YISRAEL TECHNOLOGY SRL, único con capa escolar). Screenshots del preview dan **timeout** → verificar con `javascript_tool` (el fetch lleva la cookie) + `get_page_text`/`read_page`. Tabs Radix: cambian solo con secuencia pointerdown/mouseup/click sintética.
- DB dev Neon compartida `ep-raspy-mud-annawbag` (ver [[dev-environment]]). Migraciones hand-written con `npx tsx scripts/apply-migration-XXXX.ts`. **Avisar host/DB antes de correr scripts** ([[db-switch-confirm-protocol]]).
