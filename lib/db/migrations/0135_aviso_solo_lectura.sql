-- 0135 — Marca de «ya le avisamos que está en solo lectura»
--
-- El paso a solo lectura no es un evento de Stripe: es el calendario. Lo
-- detecta un barrido diario (/api/cron/suscripciones), y sin una marca ese
-- barrido le mandaría el mismo correo TODOS LOS DÍAS a quien no paga —que es
-- la forma más rápida de que marque a Zero como spam justo cuando queremos
-- que vuelva.
--
-- Se limpia al reactivar (webhook), para que la próxima vez vuelva a avisar.

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS aviso_solo_lectura_en timestamp;

-- El barrido busca a quien tiene reloj corriendo y todavía no fue avisado.
-- Parcial: las filas ya avisadas no vuelven a mirarse nunca, así que no
-- tienen por qué ocupar índice.
CREATE INDEX IF NOT EXISTS teams_aviso_solo_lectura_pendiente_idx
  ON teams (id)
  WHERE aviso_solo_lectura_en IS NULL
    AND (trial_end IS NOT NULL OR moroso_desde IS NOT NULL);
