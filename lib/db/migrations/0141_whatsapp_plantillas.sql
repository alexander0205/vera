-- El contenido de las plantillas de WhatsApp.
--
-- Meta es la fuente del ESTADO (aprobada, en revisión, rechazada) pero no del
-- CONTENIDO: el CRM devuelve solo nombre, idioma, categoría y estado, sin el
-- cuerpo. Sin guardarlo aquí no se puede enseñar lo que dice una plantilla, ni
-- previsualizarla, ni saber qué variable es cuál.
--
-- Y hace falta para algo que Meta no tiene: el BORRADOR. Allá una plantilla
-- nace en revisión y ya no se edita nunca; si se rechaza hay que crear otra con
-- otro nombre. Poder redactarla y releerla antes de mandarla evita quemar
-- nombres.
--
-- `variables` guarda lo que Meta no guarda: qué significa cada {{n}}. Meta solo
-- conoce posiciones, así que sin esto la pantalla no puede decir «{{2}} es el
-- monto» ni rellenar una vista previa creíble.
--   [{ "pos": 1, "nombre": "concepto", "tipo": "texto", "ejemplo": "Mensualidad" }]

CREATE TABLE IF NOT EXISTS whatsapp_plantillas (
  id           serial PRIMARY KEY,
  nombre       varchar(128) NOT NULL,
  idioma       varchar(8)   NOT NULL DEFAULT 'es',
  categoria    varchar(24)  NOT NULL DEFAULT 'utility',

  cuerpo       text NOT NULL,
  encabezado   text,
  pie          text,

  -- Alcance: NULL = disponible para todos los negocios.
  team_id      integer REFERENCES teams(id) ON DELETE CASCADE,

  -- Mientras es borrador no existe en Meta y se puede editar a gusto.
  borrador     boolean NOT NULL DEFAULT true,
  meta_id      varchar(128),
  /** Lo que Meta contestó al publicar, para poder enseñar el motivo del rechazo. */
  meta_estado  varchar(32),

  variables    jsonb NOT NULL DEFAULT '[]'::jsonb,

  creado_en      timestamp NOT NULL DEFAULT now(),
  actualizado_en timestamp NOT NULL DEFAULT now()
);

-- El par (nombre, idioma) es la clave con la que Meta las identifica, y es por
-- donde se cruzan las locales con su estado de aprobación.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_plantillas_nombre_idioma_idx
  ON whatsapp_plantillas (nombre, idioma);

CREATE INDEX IF NOT EXISTS whatsapp_plantillas_team_idx
  ON whatsapp_plantillas (team_id);
