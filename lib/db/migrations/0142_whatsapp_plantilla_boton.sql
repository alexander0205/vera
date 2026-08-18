-- El botón de una plantilla de WhatsApp.
--
-- Va aquí y no como columnas sueltas porque Meta lo trata como un componente
-- entero: texto + URL + ejemplo, y la URL admite UNA variable y solo al final.
--
--   { "texto": "Ver factura",
--     "url": "https://facturacion.zero.com.do/factura/{{1}}",
--     "ejemplo": "https://facturacion.zero.com.do/factura/abc123" }
--
-- Se registra desde ya aunque la página todavía no exista: añadirle un botón a
-- una plantilla YA APROBADA obliga a pasar por revisión otra vez, y en las
-- aprobadas Meta solo deja editar 1 vez cada 24 h y 10 cada 30 días. Ponerlo
-- ahora es gratis; ponerlo después se paga en esperas.

ALTER TABLE whatsapp_plantillas
  ADD COLUMN IF NOT EXISTS boton jsonb;
