-- Elimina la personalización de mora por factura y por plan recurrente.
--
-- Decisión de negocio (2026-08-05): la mora se rige EXCLUSIVAMENTE por la
-- configuración central del team (teams.recargo_mora_*). Se descarta el
-- override por factura y por plan; el motor ya no lee estas columnas.
--
-- IF EXISTS en todas: idempotente sin importar si la empresa venía de prod
-- (solo tenía mora_porcentaje / mora_dias_gracia) o de una rama donde 0080
-- alcanzó a crear mora_modo / mora_monto_cents antes de este cambio.
--
-- NO se toca "mora_periodo" ni "mora_origen_id" (soporte del cobro periódico),
-- ni las columnas de mora a nivel de team.

-- ── Override por factura ─────────────────────────────────────────────────────
ALTER TABLE "ecf_documents" DROP COLUMN IF EXISTS "mora_porcentaje";
ALTER TABLE "ecf_documents" DROP COLUMN IF EXISTS "mora_dias_gracia";
ALTER TABLE "ecf_documents" DROP COLUMN IF EXISTS "mora_modo";
ALTER TABLE "ecf_documents" DROP COLUMN IF EXISTS "mora_monto_cents";

-- ── Override por plan recurrente ─────────────────────────────────────────────
ALTER TABLE "facturas_recurrentes" DROP COLUMN IF EXISTS "mora_porcentaje";
ALTER TABLE "facturas_recurrentes" DROP COLUMN IF EXISTS "mora_dias_gracia";
ALTER TABLE "facturas_recurrentes" DROP COLUMN IF EXISTS "mora_modo";
ALTER TABLE "facturas_recurrentes" DROP COLUMN IF EXISTS "mora_monto_cents";
