-- Cuadre de Caja — endurecimiento (hardening).
--
-- 1) El turno vivo debe ser único por (team, usuario), NO global por usuario.
--    El índice original solo usaba usuario_id, lo que bloqueaba a un cajero que
--    opera en dos empresas: con un turno abierto en la empresa A, abrir en la B
--    fallaba. La lógica de app ya consulta por (team_id, usuario_id).
--
-- 2) Defensa en BD para los montos: la capa de aplicación ya valida, pero un
--    INSERT directo podía violar las reglas de negocio (monto de movimiento ≤ 0,
--    apertura negativa). Los CHECK lo impiden en el motor.

-- ── 1) Índice único por (team, usuario) ──────────────────────────────────────

DROP INDEX IF EXISTS "caja_turnos_usuario_abierto_uniq";

CREATE UNIQUE INDEX IF NOT EXISTS "caja_turnos_usuario_abierto_uniq"
  ON "caja_turnos" ("team_id", "usuario_id")
  WHERE "estado" IN ('ABIERTO', 'CIERRE_SOLICITADO');

-- ── 2) CHECK de montos (idempotente vía pg_constraint) ───────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'caja_movimientos_monto_positivo'
  ) THEN
    ALTER TABLE "caja_movimientos"
      ADD CONSTRAINT "caja_movimientos_monto_positivo" CHECK ("monto_centavos" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'caja_turnos_apertura_no_negativa'
  ) THEN
    ALTER TABLE "caja_turnos"
      ADD CONSTRAINT "caja_turnos_apertura_no_negativa" CHECK ("monto_apertura_centavos" >= 0);
  END IF;
END $$;
