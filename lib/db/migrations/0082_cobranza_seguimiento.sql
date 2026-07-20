-- Seguimiento de cobranza: qué se ha hecho para cobrar una cuenta y cuál es el
-- próximo paso. Paso 1, subpaso 5 del plan de contabilidad.
--
-- Dos tablas con responsabilidades distintas:
--   cobranza_eventos     → el LOG: contactos, notas internas y promesas de pago.
--                          Es append-only en la práctica (historial).
--   cobranza_seguimiento → el ESTADO actual por cuenta: responsable y próxima
--                          acción. Una fila por documento, se sobrescribe.
--
-- Ambas cuelgan de ecf_documents con FK unidireccional: cobranza conoce la
-- factura, la factura no sabe nada de cobranza. Nada de esto entra en el XML
-- de la DGII ni afecta el saldo — es información interna de gestión.

-- ─── Log de gestión ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cobranza_eventos (
  id               serial PRIMARY KEY,
  team_id          integer NOT NULL REFERENCES teams(id),
  ecf_document_id  integer NOT NULL REFERENCES ecf_documents(id),

  -- 'contacto' → se habló con el cliente
  -- 'nota'     → comentario interno, sin contacto
  -- 'promesa'  → el cliente se comprometió a pagar
  tipo             varchar(20) NOT NULL,

  -- Fecha del hecho (no del registro): permite cargar gestiones atrasadas.
  fecha            date NOT NULL,

  -- Solo para tipo='contacto': llamada | whatsapp | correo | presencial | otro
  canal            varchar(20),

  comentario       text,

  -- Solo para tipo='promesa'.
  promesa_fecha       date,
  promesa_monto_cents integer,
  -- pendiente | cumplida | incumplida. Se evalúa contra los pagos recibidos.
  promesa_estado      varchar(20),

  created_by       integer REFERENCES users(id),
  created_at       timestamp NOT NULL DEFAULT now(),

  CONSTRAINT cobranza_eventos_tipo_chk
    CHECK (tipo IN ('contacto', 'nota', 'promesa')),
  CONSTRAINT cobranza_eventos_canal_chk
    CHECK (canal IS NULL OR canal IN ('llamada', 'whatsapp', 'correo', 'presencial', 'otro')),
  CONSTRAINT cobranza_eventos_promesa_estado_chk
    CHECK (promesa_estado IS NULL OR promesa_estado IN ('pendiente', 'cumplida', 'incumplida')),
  -- Una promesa sin fecha comprometida no sirve para nada: no se puede saber
  -- si se cumplió. Se exige al insertar en vez de descubrirlo al reportar.
  CONSTRAINT cobranza_eventos_promesa_completa_chk
    CHECK (tipo <> 'promesa' OR (promesa_fecha IS NOT NULL AND promesa_estado IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS cobranza_eventos_doc_idx
  ON cobranza_eventos(team_id, ecf_document_id, fecha DESC);

-- Para el conteo de promesas pendientes/incumplidas de la cartera.
CREATE INDEX IF NOT EXISTS cobranza_eventos_promesas_idx
  ON cobranza_eventos(team_id, promesa_estado, promesa_fecha)
  WHERE tipo = 'promesa';

-- ─── Estado actual del seguimiento ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cobranza_seguimiento (
  ecf_document_id      integer PRIMARY KEY REFERENCES ecf_documents(id),
  team_id              integer NOT NULL REFERENCES teams(id),

  -- Quién lleva esta cuenta dentro del equipo.
  responsable_user_id  integer REFERENCES users(id),

  -- Qué toca hacer y cuándo. Texto libre: cada empresa cobra a su manera y
  -- encasillarlo en un enum obligaría a migrar cada vez que aparezca un caso.
  proxima_accion       text,
  proxima_accion_fecha date,

  updated_by           integer REFERENCES users(id),
  updated_at           timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cobranza_seguimiento_team_idx
  ON cobranza_seguimiento(team_id, proxima_accion_fecha);

CREATE INDEX IF NOT EXISTS cobranza_seguimiento_responsable_idx
  ON cobranza_seguimiento(team_id, responsable_user_id);
