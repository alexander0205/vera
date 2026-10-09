-- Onboarding obligatorio del usuario nuevo.
--
-- `onboarding_completado_en` NULL significa «esta empresa todavía no pasó por
-- el onboarding» y el muro la manda allí. Por eso el UPDATE de abajo NO es
-- opcional: sin él, las empresas que ya existen —incluidas las que están
-- facturando en producción ahora mismo— amanecen con NULL, chocan contra el
-- muro y dejan de poder trabajar. Nacen marcadas como completadas porque, en
-- efecto, ya están configuradas: tienen su RNC, sus secuencias y su gente.
--
-- Ojo al orden: primero se añade la columna, luego se marca lo existente, y
-- solo lo que se cree DESPUÉS queda en NULL.
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS onboarding_completado_en timestamp,
  -- En qué paso se quedó. El onboarding no se puede saltar, así que tiene que
  -- poder retomarse: obligatorio y amnésico a la vez deja fuera de su propia
  -- cuenta a cualquiera que cierre el navegador a mitad.
  ADD COLUMN IF NOT EXISTS onboarding_paso smallint NOT NULL DEFAULT 1,
  -- Lo contestado hasta ahora (línea deducida, tamaño, si el RNC se escribió a
  -- mano). JSONB y no columnas sueltas porque son respuestas de un formulario
  -- que va a cambiar de forma, no datos del negocio.
  ADD COLUMN IF NOT EXISTS onboarding_datos jsonb;

UPDATE teams
   SET onboarding_completado_en = created_at
 WHERE onboarding_completado_en IS NULL;

-- El WhatsApp de quien abre la cuenta. Va en el usuario y no en la empresa:
-- es la persona con la que se habla, y una persona puede tener varias
-- empresas.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telefono varchar(30);

-- El muro consulta esto en cada carga del panel.
CREATE INDEX IF NOT EXISTS teams_onboarding_pendiente
  ON teams (id)
  WHERE onboarding_completado_en IS NULL;
