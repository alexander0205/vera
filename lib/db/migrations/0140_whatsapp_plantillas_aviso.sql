-- Qué plantilla de WhatsApp usa cada aviso escolar.
--
-- Hace falta una tabla y no una constante porque el nombre de la plantilla lo
-- pone Meta al aprobarla, cambia por colegio (cada uno tiene su propia WABA y
-- su propio prefijo) y se rechaza y se vuelve a crear con otro nombre. Tenerlo
-- en código significaría un despliegue cada vez que Meta rechaza una.
--
-- team_id NULL = la asignación por defecto de la plataforma, la que usa quien
-- no tiene la suya. Postgres no considera NULL igual a NULL, así que un UNIQUE
-- normal sobre (team_id, aviso) dejaría meter dos defaults del mismo aviso:
-- por eso van dos índices parciales.

CREATE TABLE IF NOT EXISTS whatsapp_plantillas_aviso (
  id                serial PRIMARY KEY,
  team_id           integer REFERENCES teams(id) ON DELETE CASCADE,
  aviso             varchar(32)  NOT NULL,
  plantilla_nombre  varchar(128) NOT NULL,
  idioma            varchar(8)   NOT NULL DEFAULT 'es',
  creado_en         timestamp    NOT NULL DEFAULT now(),
  actualizado_en    timestamp    NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_plantillas_aviso_team_idx
  ON whatsapp_plantillas_aviso (team_id, aviso)
  WHERE team_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_plantillas_aviso_default_idx
  ON whatsapp_plantillas_aviso (aviso)
  WHERE team_id IS NULL;
