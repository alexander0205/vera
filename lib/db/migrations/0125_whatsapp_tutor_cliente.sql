-- WhatsApp en el tutor y en el contacto.
--
-- El colegio le escribe a las familias por WhatsApp, no por correo, y el número
-- de WhatsApp no siempre es el teléfono guardado: hay casas con fijo y madre
-- con celular aparte. Guardarlo en el mismo campo obligaba a elegir cuál se
-- pierde.
ALTER TABLE admin_escolar_tutores ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30);
ALTER TABLE clients              ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30);

-- La cédula del tutor identifica a la persona: dos filas con la misma cédula
-- son la misma madre metida dos veces, y a partir de ahí los avisos salen
-- duplicados y el histórico del alumno queda partido.
--
-- Parcial porque la cédula es opcional en los que ya existen y en los que no la
-- traen: NULL no choca con NULL, así que el índice solo vigila a los que sí la
-- tienen.
CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_tutores_documento_uniq
  ON admin_escolar_tutores (team_id, documento)
  WHERE documento IS NOT NULL;

-- Lo mismo con el id de persona de SIGERD, que es mejor llave que la cédula:
-- la cédula llega con guiones, sin ellos o mal escrita, y entonces el mismo
-- padre entra otra vez al año siguiente.
CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_tutores_sigerd_uniq
  ON admin_escolar_tutores (team_id, sigerd_id_persona)
  WHERE sigerd_id_persona IS NOT NULL;
