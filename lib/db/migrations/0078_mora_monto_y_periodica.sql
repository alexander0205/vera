-- Mora: cargo por monto fijo, cobro periódico, base compuesta y topes.
--
-- Hasta ahora la mora era un único cargo porcentual sobre el saldo de la
-- factura. Se amplía en cuatro ejes, todos configurables por empresa.
-- (La personalización por factura/plan se descartó: la mora se rige solo
-- por la configuración central del team.)
--
-- COMPATIBILIDAD: las empresas existentes quedan en periodicidad = 0
-- (una sola vez, el comportamiento de hoy). Activar el cobro periódico sobre
-- facturas ya vencidas es una decisión de negocio, no un efecto secundario de
-- desplegar esto.

-- ── Empresa ──────────────────────────────────────────────────────────────────

-- 'porcentaje' → usa recargo_mora_porcentaje (basis points)
-- 'fijo'       → usa recargo_mora_monto_cents
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "recargo_mora_modo" varchar(12) NOT NULL DEFAULT 'porcentaje';

-- Monto del cargo en centavos cuando modo = 'fijo'.
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "recargo_mora_monto_cents" integer NOT NULL DEFAULT 0;

-- Cada cuántos días se vuelve a cobrar mientras siga vencida.
-- 0 = una sola vez (comportamiento histórico). 30 = mensual.
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "recargo_mora_periodicidad_dias" integer NOT NULL DEFAULT 0;

-- true  → la base incluye las moras anteriores impagas (mora sobre mora)
-- false → la base es solo el saldo de la factura
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "recargo_mora_compuesta" boolean NOT NULL DEFAULT false;

-- Tope de mora ACUMULADA como % del monto de la factura, en basis points.
-- 0 = sin tope. Ej. 5000 = la mora acumulada nunca pasa del 50% de la factura.
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "recargo_mora_tope_bps" integer NOT NULL DEFAULT 0;

-- Máximo de períodos a cobrar. 0 = sin límite.
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "recargo_mora_max_periodos" integer NOT NULL DEFAULT 0;

-- Período que cubre esta nota de mora (fecha de inicio del período).
-- NULL en las notas generadas antes de este cambio.
ALTER TABLE "ecf_documents" ADD COLUMN IF NOT EXISTS "mora_periodo" date;

-- ── Índices ──────────────────────────────────────────────────────────────────

-- El índice viejo permitía UNA sola nota de mora activa por factura, lo que
-- hacía imposible el cobro periódico. Se reemplaza por uno que garantiza una
-- nota por (factura, período): el cron puede correr varias veces el mismo día
-- sin duplicar, y aun así acumular un cargo por mes.
DROP INDEX IF EXISTS "ecf_documents_mora_activa_unica_idx";

-- Las notas históricas tienen mora_periodo NULL; se les asigna su fecha de
-- emisión para que entren en el índice sin colisionar entre sí.
UPDATE "ecf_documents"
   SET "mora_periodo" = COALESCE("fecha_emision"::date, CURRENT_DATE)
 WHERE "mora_origen_id" IS NOT NULL
   AND "mora_periodo" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ecf_documents_mora_periodo_unico_idx"
  ON "ecf_documents"("mora_origen_id", "mora_periodo")
  WHERE "mora_origen_id" IS NOT NULL AND "estado" != 'ANULADO';
