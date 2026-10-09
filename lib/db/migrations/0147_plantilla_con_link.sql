-- Dos plantillas por aviso: con enlace y sin enlace.
--
-- El mismo aviso se manda de dos maneras según el estado del cargo:
--
--   ya tiene factura  → lleva el botón «Ver factura» al enlace de pago
--   todavía no        → el mismo texto, sin botón
--
-- No es una preferencia estética. Un cargo sin factura NO se puede cobrar —el
-- cobro es de un documento, ver aprobarComprobante()—, así que un enlace ahí
-- lleva al padre a transferir y subir su comprobante para que el colegio no
-- pueda aplicarlo. Le queda el pago en el aire y al colegio una explicación.
--
-- Va como columna y no como otra fila con un `tipo` distinto porque son el
-- MISMO aviso: la fila ya dice de qué momento se trata, y partirla en dos
-- obligaría a mantener sincronizados dos registros que siempre cambian juntos.
--
-- Vacío = ese colegio no tiene versión con enlace y se usa siempre la de
-- siempre. Es el estado normal hasta que Meta apruebe las suyas.

ALTER TABLE whatsapp_plantillas_aviso
  ADD COLUMN IF NOT EXISTS plantilla_con_link varchar(128);
