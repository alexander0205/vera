-- El recargo por mora deja de caer el mismo día del vencimiento.
--
-- Hasta ahora vencer y entrar en mora eran el mismo instante, y por eso los dos
-- avisos del final tenían que colgar los dos del vencimiento. Con unos días de
-- margen entre una cosa y otra, la línea de tiempo recupera sus tres momentos:
--
--   se emite  →  vence  →  (N días)  →  entra el recargo
--
-- y el último aviso vuelve a ser lo que el colegio pide: «te quedan N días
-- antes de que esto te cueste más».

ALTER TABLE admin_escolar_conceptos_pago
  ADD COLUMN IF NOT EXISTS mora_dias_gracia SMALLINT NOT NULL DEFAULT 0;

-- El aviso pasa a colgar de la fecha de la MORA, no de la del vencimiento. Se
-- renombra porque el nombre viejo describía un anclaje que ya no es el suyo, y
-- una columna que miente sobre lo que guarda es peor que una que falta.
ALTER TABLE admin_escolar_conceptos_pago
  RENAME COLUMN aviso_antes_vencer_dias TO aviso_antes_mora_dias;

-- Con la gracia en 0 el aviso «antes del recargo» caería el mismo día que el de
-- «hoy venció», que es justo el choque que hay que evitar. Se apaga en los
-- conceptos que se quedan sin margen; el colegio lo vuelve a encender cuando
-- ponga los días.
UPDATE admin_escolar_conceptos_pago
   SET aviso_antes_mora_dias = NULL
 WHERE mora_dias_gracia = 0;

-- Los avisos ya enviados llevan el momento en la clave de idempotencia.
-- 'antes-vencer' ya no existe como momento.
DELETE FROM admin_escolar_avisos_enviados WHERE tipo = 'antes-vencer';
