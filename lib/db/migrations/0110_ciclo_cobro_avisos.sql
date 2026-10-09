-- El ciclo de cobro de cada concepto y los avisos automáticos al tutor.
--
-- Va en el CONCEPTO y no en una configuración única del colegio porque los
-- colegios no cobran todo igual: la colegiatura puede vencer el día 5 y el
-- transporte el 10, y un solo ajuste global no puede decir eso.
--
-- Para los conceptos mensuales, estos números se copian al plan de factura
-- recurrente que se crea al matricular. El módulo escolar no reimplementa la
-- facturación: la configura y la deja trabajar.

ALTER TABLE admin_escolar_conceptos_pago
  -- Día del mes en que se emite la factura. Solo para conceptos recurrentes;
  -- 0 = último día del mes, que es como cobran algunos colegios.
  ADD COLUMN IF NOT EXISTS dia_cobro smallint,
  -- Días desde que se emite hasta que vence. Se copia a
  -- `facturas_recurrentes.dias_para_pago`.
  ADD COLUMN IF NOT EXISTS dias_para_pago smallint,
  -- Días de gracia después del vencimiento antes de aplicar mora. Se copia a
  -- `facturas_recurrentes.mora_dias_gracia`, que ya existía como override por
  -- plan sobre la configuración global de la empresa.
  ADD COLUMN IF NOT EXISTS mora_dias_gracia smallint,
  -- Cuántos días ANTES del vencimiento se avisa. 0 o NULL = no avisar antes.
  -- Esto no existía en ninguna parte del sistema: los recordatorios de cobro
  -- eran un botón que alguien apretaba a mano.
  ADD COLUMN IF NOT EXISTS aviso_previo_dias smallint,
  -- A los cuántos días de vencido se insiste, en orden. Ej. [3,15]. Lista y no
  -- un número porque los colegios tienen costumbres distintas y varias rondas.
  ADD COLUMN IF NOT EXISTS aviso_vencido_dias jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS aviso_correo   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aviso_whatsapp boolean NOT NULL DEFAULT false;

-- Arranque razonable para lo que ya existe: las mensualidades avisan 5 días
-- antes por correo y vuelven a insistir a los 3 y a los 15 de vencidas.
UPDATE admin_escolar_conceptos_pago
   SET dia_cobro          = COALESCE(dia_cobro, 1),
       dias_para_pago     = COALESCE(dias_para_pago, 5),
       mora_dias_gracia   = COALESCE(mora_dias_gracia, 3),
       aviso_previo_dias  = COALESCE(aviso_previo_dias, 5),
       aviso_vencido_dias = CASE WHEN aviso_vencido_dias = '[]'::jsonb
                                 THEN '[3,15]'::jsonb ELSE aviso_vencido_dias END,
       aviso_correo       = true
 WHERE tipo = 'mensualidad';

-- Qué avisos ya se mandaron.
--
-- Sin esto el cron reenvía el mismo recordatorio cada vez que corre: corre a
-- diario, y "vencido hace 3 días" sigue siendo verdad mañana. Al padre le
-- llegaría el mismo correo toda la semana.
CREATE TABLE IF NOT EXISTS admin_escolar_avisos_enviados (
  id          serial PRIMARY KEY,
  team_id     integer NOT NULL REFERENCES teams(id),
  cargo_id    integer NOT NULL REFERENCES admin_escolar_cargos(id) ON DELETE CASCADE,
  -- 'previo' | 'vencido'
  tipo        varchar(12) NOT NULL,
  -- Días de diferencia con el vencimiento: -5 = cinco días antes, 3 = tres
  -- después. Es lo que distingue la primera insistencia de la segunda.
  offset_dias smallint NOT NULL,
  canal       varchar(12) NOT NULL,
  destino     varchar(200),
  enviado_at  timestamp NOT NULL DEFAULT now()
);

-- La clave de la idempotencia: un aviso por cargo, tipo, día y canal.
CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_avisos_unico
  ON admin_escolar_avisos_enviados (cargo_id, tipo, offset_dias, canal);

CREATE INDEX IF NOT EXISTS admin_escolar_avisos_team_fecha
  ON admin_escolar_avisos_enviados (team_id, enviado_at DESC);
