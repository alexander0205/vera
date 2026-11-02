-- 0213 · Comprobantes de los padres: el banco donde entró el dinero, la lectura
-- con IA de la foto y la huella del archivo para detectar repetidos.
--
-- Tres cosas que la pantalla de «Aprobar y registrar cobro» necesitaba:
--
--   1. `cuenta_banco_id`  A QUÉ cuenta de la empresa entró la transferencia, que
--                         es lo que pidió el colegio al aprobar. El cobro en sí
--                         ya lo guarda `pagos_recibidos.cuenta_banco_id` (0173);
--                         esta copia deja decirlo en la lista de comprobantes
--                         sin ir a buscar el pago. ON DELETE SET NULL: borrar
--                         una cuenta no puede borrar ni bloquear el comprobante.
--
--   2. `lectura_ia`       Lo que la IA leyó en la foto (banco destino y origen,
--                         monto, fecha, referencia, quién envía) más su
--                         confianza, como jsonb. `lectura_ia_en` dice cuándo; en
--                         NULL = no se leyó (sin llave de IA, falló, o es un
--                         comprobante anterior a esta migración). Es una
--                         propuesta: la persona que revisa decide.
--
--   3. `archivo_hash`     sha256 del archivo subido. Dos comprobantes de la misma
--                         familia con el mismo hash son la misma foto subida dos
--                         veces; junto con la referencia y el monto+fecha que lee
--                         la IA, es lo que marca «posible duplicado».
--
-- NO se rellena nada de lo anterior: los comprobantes que ya existen quedan con
-- las cuatro columnas en NULL (sin lectura, sin hash, sin banco) y se comportan
-- como siempre.
--
-- Aditiva e idempotente: solo agrega columnas nulas, se puede correr dos veces.
-- CORRER ANTES del deploy: el listado de comprobantes del código nuevo lee estas
-- columnas y sin ellas la pestaña «Comprobantes» daría error.

ALTER TABLE admin_escolar_comprobantes
  ADD COLUMN IF NOT EXISTS cuenta_banco_id integer
    REFERENCES admin_escolar_cuentas_banco(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lectura_ia jsonb,
  ADD COLUMN IF NOT EXISTS lectura_ia_en timestamp,
  ADD COLUMN IF NOT EXISTS archivo_hash varchar(64);
