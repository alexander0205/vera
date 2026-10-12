-- Los recordatorios pasan a encenderse con un interruptor, y se añaden los dos
-- avisos que faltaban: el del día que vence y el de "te van a cobrar mora".
--
-- El interruptor existe porque hasta ahora "no avisar" se expresaba dejando
-- todos los campos vacíos, que es una forma torcida de decirlo: nadie sabe si
-- están vacíos porque no se quiere avisar o porque nadie los llenó.

ALTER TABLE admin_escolar_conceptos_pago
  -- Interruptor maestro. Apagado, no sale ningún aviso aunque los días estén
  -- configurados — así se puede parar el envío sin perder la configuración.
  ADD COLUMN IF NOT EXISTS avisos_activos boolean NOT NULL DEFAULT false,
  -- Avisar el mismo día que vence. Es el recordatorio que más piden los
  -- colegios y no se podía expresar: `aviso_previo_dias = 0` significa "no
  -- avisar antes", no "avisar el día del vencimiento".
  ADD COLUMN IF NOT EXISTS aviso_dia_cobro boolean NOT NULL DEFAULT false,
  -- Cuántos días antes de que entre la mora se avisa. Es el aviso que de
  -- verdad hace pagar: "si no pagas en 2 días te cobramos un recargo".
  -- NULL = no avisar por eso.
  ADD COLUMN IF NOT EXISTS aviso_antes_mora_dias smallint;

-- Lo que ya tenía avisos configurados queda encendido: apagarlo en silencio
-- sería cambiarle el comportamiento a quien ya lo dejó listo.
UPDATE admin_escolar_conceptos_pago
   SET avisos_activos  = true,
       aviso_dia_cobro = true,
       aviso_antes_mora_dias = COALESCE(aviso_antes_mora_dias, 2)
 WHERE aviso_correo = true
   AND (aviso_previo_dias IS NOT NULL OR aviso_vencido_dias <> '[]'::jsonb);
