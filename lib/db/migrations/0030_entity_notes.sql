-- Notas genéricas por entidad (factura, cliente, producto, etc.).
-- Reusable vía componente <EntityNotes entityType=... entityId=... />.
CREATE TABLE IF NOT EXISTS "entity_notes" (
  "id"          serial PRIMARY KEY NOT NULL,
  "team_id"     integer NOT NULL REFERENCES "teams"("id"),
  "entity_type" varchar(50) NOT NULL,
  "entity_id"   integer NOT NULL,
  "user_id"     integer REFERENCES "users"("id"),
  "text"        text NOT NULL,
  "created_at"  timestamp DEFAULT now() NOT NULL,
  "updated_at"  timestamp DEFAULT now() NOT NULL,
  "deleted_at"  timestamp
);

CREATE INDEX IF NOT EXISTS "entity_notes_entity_idx"
  ON "entity_notes" ("team_id", "entity_type", "entity_id");
