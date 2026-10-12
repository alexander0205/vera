-- Los tres recordatorios pasan a colgar de los momentos que el colegio nombra.
--
-- Antes eran: antes de emitir, al emitir, antes de vencer. El primero avisaba de
-- una factura que todavía no existe —"se acerca tu pago"—, y en la práctica el
-- padre no puede hacer nada con eso: no hay monto, no hay documento, no hay
-- dónde pagar. Los tres que sí marcan algo son el día que sale la factura, el
-- día que vence, y un aviso antes de que le entre el recargo.
--
-- Queda: al emitir · antes de la mora · al vencer.

ALTER TABLE admin_escolar_conceptos_pago
  DROP COLUMN IF EXISTS aviso_antes_emision_dias;

-- El día del vencimiento, que es el mismo en que entra la mora (no hay días de
-- gracia). Es el aviso de "se te venció y ya tienes recargo".
ALTER TABLE admin_escolar_conceptos_pago
  ADD COLUMN IF NOT EXISTS aviso_dia_vencimiento BOOLEAN NOT NULL DEFAULT FALSE;

-- Los avisos ya enviados llevan el nombre del momento en la clave de
-- idempotencia. Las filas de 'antes-emitir' pierden su sentido: ese aviso ya no
-- existe y nunca volverá a mandarse, así que dejarlas solo estorba al buscar
-- por qué un tutor recibió algo.
DELETE FROM admin_escolar_avisos_enviados WHERE tipo = 'antes-emitir';
