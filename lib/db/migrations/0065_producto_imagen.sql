-- Imagen del producto (data URL base64, mismo patrón que teams.logo/firma).
ALTER TABLE products ADD COLUMN IF NOT EXISTS imagen TEXT;
