-- Foto del tutor escolar.
-- Columna OPCIONAL para guardar la imagen del tutor (data URL base64, mismo
-- patrón que products.imagen / teams.logo). Sirve para identificar a un tutor
-- que no es padre/contacto (ej. chofer, cuidador) junto a su cédula (documento).
--
-- Idempotente: IF NOT EXISTS.

ALTER TABLE admin_escolar_tutores
  ADD COLUMN IF NOT EXISTS imagen TEXT;
