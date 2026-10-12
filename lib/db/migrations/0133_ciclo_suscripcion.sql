-- 0133 — Ciclo de vida de la suscripción
--
-- Hasta aquí de una suscripción solo guardábamos QUÉ plan y EN QUÉ estado.
-- Faltaba el CUÁNDO, que es lo que decide si a alguien todavía le queda
-- prueba, si está dentro de la gracia por un cobro fallido, o hasta qué día
-- le sirve lo que ya pagó.
--
-- Stripe tiene todos estos datos, pero preguntárselos en cada carga de página
-- sería una llamada de red por request para pintar un banner.
--
-- Todo aditivo y nullable: una fila sin estos valores se comporta igual que
-- antes de la migración.

ALTER TABLE teams
  -- Cuándo termina (o terminó) el período de prueba.
  ADD COLUMN IF NOT EXISTS trial_end       timestamp,

  -- Hasta cuándo está pagado el período en curso. Es la fecha que se le
  -- muestra a quien canceló: "tienes acceso hasta el …".
  ADD COLUMN IF NOT EXISTS periodo_fin     timestamp,

  -- Cuándo falló el primer cobro. La gracia se cuenta desde aquí, no desde
  -- el último intento: si no, cada reintento de Stripe reiniciaría el reloj
  -- y la mora no se agotaría nunca. Se limpia al volver a cobrar bien.
  ADD COLUMN IF NOT EXISTS moroso_desde    timestamp,

  -- Hay una cancelación programada para el fin del período.
  ADD COLUMN IF NOT EXISTS cancelar_al_fin boolean NOT NULL DEFAULT false,

  -- Adicionales contratados sobre el plan (hoy solo 'pos'). Se deriva de los
  -- items de la suscripción en cada webhook.
  ADD COLUMN IF NOT EXISTS adicionales     jsonb   NOT NULL DEFAULT '[]'::jsonb;

-- El barrido diario busca a quién se le venció la prueba o la gracia. Sin
-- índice eso es un seq scan sobre teams cada vez; con él son dos lecturas.
CREATE INDEX IF NOT EXISTS teams_trial_end_idx
  ON teams (trial_end)
  WHERE trial_end IS NOT NULL;

CREATE INDEX IF NOT EXISTS teams_moroso_desde_idx
  ON teams (moroso_desde)
  WHERE moroso_desde IS NOT NULL;
