-- Amplía los campos RNC/Cédula de varchar(11) a varchar(20)
-- para soportar cédulas formateadas (402-2114504-5 = 13 chars)
-- y futuros identificadores internacionales

ALTER TABLE clients
  ALTER COLUMN rnc TYPE varchar(20);

ALTER TABLE ecf_documents
  ALTER COLUMN rnc_comprador TYPE varchar(20);

ALTER TABLE cotizaciones
  ALTER COLUMN rnc_comprador TYPE varchar(20);
