-- Términos y condiciones por defecto de la empresa.
-- Se copian al crear una factura o cotización nueva para no reescribirlos cada
-- vez. Es una plantilla: el texto queda guardado en el documento y ahí se puede
-- editar. Cambiar este valor NO reescribe los comprobantes ya emitidos.
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "terminos_condiciones_default" text;
