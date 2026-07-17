-- 0072_caja_limite_horas — Límite de duración del turno de caja + ventana de aviso
--
-- ⚠️ APLICAR MANUALMENTE, NO por drizzle-kit migrate:
--     psql "$POSTGRES_URL" -f lib/db/migrations/0072_caja_limite_horas.sql
--
-- El journal de drizzle está congelado en 0004; las migraciones 0005+ se aplican
-- manualmente en este repo. Idempotente (IF NOT EXISTS): seguro re-ejecutar.
--
-- caja_limite_horas:  duración máxima de un turno ABIERTO. NULL = SIN LÍMITE:
--                     no hay contador, no hay avisos, no hay bloqueo.
-- caja_aviso_minutos: cuántos minutos antes del límite aparece el contador y
--                     empiezan los avisos. Solo aplica si hay límite.
-- caja_gracia_horas:  horas de tolerancia tras el límite. Pasadas, no se puede
--                     facturar ni cobrar hasta cerrar caja. NULL = solo avisa.
--
-- NACE APAGADO A PROPÓSITO: ambos límites entran en NULL, así que esta migración
-- no le cambia el comportamiento a NADIE. La función queda dormida hasta que se
-- le ponga un límite a una empresa desde /admin/empresas/[id].
--
-- El motivo es concreto: al momento de escribir esto había 6 turnos abiertos en
-- producción por encima de 10h (uno de 850h). Con un default de 8h+2h, esos 6
-- cajeros habrían quedado sin poder facturar en el instante del deploy, sin
-- aviso previo. Un default que bloquea gente el día que se despliega no es un
-- default: es una salida a producción disfrazada de migración.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS caja_limite_horas  integer;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS caja_aviso_minutos integer NOT NULL DEFAULT 60;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS caja_gracia_horas  integer;
