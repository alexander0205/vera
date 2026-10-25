-- 0205 · Por dónde salen los WhatsApp del colegio.
--
-- `admin_escolar_canales.whatsapp_via`:
--   'zero'   → siempre por el número de Zero (aunque el colegio tenga el suyo).
--   'propio' → solo por el número del colegio; si no está conectado, no sale.
--   NULL     → como hasta ahora: el del colegio si lo conectó, si no el de Zero.
-- Apagar WhatsApp sigue siendo `whatsapp_activo = false`.
--
-- Aditiva e idempotente: con NULL ningún colegio cambia.

ALTER TABLE admin_escolar_canales ADD COLUMN IF NOT EXISTS whatsapp_via VARCHAR(8);
