-- 0208 · Lo que gasta la IA, por empresa y por chat.
--
-- Cada llamada a un modelo —el asistente del chat (el modelo gratis para las
-- preguntas normales, Claude para las de análisis), Jev de TypeSafe
-- para las decisiones, las plantillas y la lectura de facturas— deja una fila
-- con sus tokens y su costo. Con esto se sabe cuánto cuesta cada cliente y
-- cada conversación (pedido del usuario, 25-10-2026).
--
-- El costo se guarda al momento de la llamada, con el precio del catálogo de
-- ese día (lib/ia/modelos.ts): si el precio cambia después, lo ya gastado no.
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS ia_consumo (
  id               SERIAL PRIMARY KEY,
  -- NULL = de la plataforma (por ejemplo, «Probar» en /admin/ia).
  team_id          INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- asistente | decisiones | plantillas | captura
  uso              VARCHAR(20) NOT NULL,
  -- anthropic | gateway | google | typesafe
  proveedor        VARCHAR(20) NOT NULL,
  modelo           VARCHAR(80) NOT NULL,
  conversacion_id  INTEGER REFERENCES asistente_conversaciones(id) ON DELETE SET NULL,
  mensaje_id       INTEGER REFERENCES asistente_mensajes(id) ON DELETE SET NULL,
  tokens_entrada   INTEGER NOT NULL DEFAULT 0,
  tokens_salida    INTEGER NOT NULL DEFAULT 0,
  -- Leídos de la caché del proveedor (más baratos); ya incluidos en tokens_entrada.
  tokens_cache     INTEGER NOT NULL DEFAULT 0,
  -- Escritos en la caché (Anthropic los cobra 1.25×); también dentro de tokens_entrada.
  tokens_cache_escritura INTEGER NOT NULL DEFAULT 0,
  -- Del asistente: normal o analisis (decidió el modelo que se usó).
  nivel            VARCHAR(12),
  costo_usd        NUMERIC(14, 8) NOT NULL DEFAULT 0,
  creado_en        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ia_consumo_team_idx ON ia_consumo (team_id, creado_en);
CREATE INDEX IF NOT EXISTS ia_consumo_conversacion_idx ON ia_consumo (conversacion_id);

-- Si la tabla ya existía sin la columna (la copia de pruebas), se agrega.
ALTER TABLE ia_consumo ADD COLUMN IF NOT EXISTS tokens_cache_escritura INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ia_consumo ADD COLUMN IF NOT EXISTS nivel VARCHAR(12);
