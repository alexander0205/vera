-- Permite planes recurrentes de tipo 'sin-ncf' (factura interna sin comprobante).
--
-- facturas_recurrentes.tipo_ecf nació como varchar(2) porque solo guardaba
-- códigos de e-CF ('31', '32', …). El sentinel 'sin-ncf' son 7 caracteres, así
-- que cualquier intento de crear un plan sin comprobante reventaba con
-- 22001 "value too long" — un 500 sin mensaje, porque la ruta no valida ni
-- captura el error del driver.
--
-- ecf_documents.tipo_ecf ya es varchar(10), de modo que el documento generado
-- siempre pudo albergar el valor; el cuello estaba solo en el plan.

ALTER TABLE facturas_recurrentes
  ALTER COLUMN tipo_ecf TYPE varchar(10);
