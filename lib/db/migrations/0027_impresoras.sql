-- Migration: 0027_impresoras
-- Adds the `impresoras` table for per-team printer configuration.
-- No driver integration — purely config + PDF routing.

CREATE TABLE IF NOT EXISTS "impresoras" (
  "id"         serial PRIMARY KEY NOT NULL,
  "team_id"    integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "nombre"     varchar(100) NOT NULL,
  "tipo"       varchar(20) NOT NULL DEFAULT 'a4',
  "es_default" boolean NOT NULL DEFAULT false,
  "ip"         varchar(100),
  "backend"    varchar(20) NOT NULL DEFAULT 'browser',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "impresoras_team_idx" ON "impresoras" ("team_id");
