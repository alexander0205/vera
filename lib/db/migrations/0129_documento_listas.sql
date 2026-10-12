-- Listados de documentos con nombre.
--
-- Antes, qué papeles se piden salía de cruzar el NIVEL del alumno con el TIPO
-- de inscripción. Eso obligaba al colegio a mantener una lista por cada
-- combinación —doce en un colegio de seis niveles— y ninguna de las dos
-- dimensiones describía de verdad lo que pasa en recepción: quien matricula
-- sabe «este viene de traslado» o «este reinscribe», y esa frase no siempre
-- coincide con el nivel.
--
-- Ahora el colegio arma los listados que quiera, les pone nombre («Admisión
-- inicial», «Traslado de otro centro») y al matricular se elige uno.

CREATE TABLE IF NOT EXISTS "admin_escolar_documento_listas" (
  "id"         serial PRIMARY KEY,
  "team_id"    integer NOT NULL REFERENCES "teams"("id"),
  "nombre"     varchar(120) NOT NULL,
  "orden"      smallint NOT NULL DEFAULT 0,
  "activo"     boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "admin_escolar_doc_listas_team_idx"
  ON "admin_escolar_documento_listas" ("team_id", "orden");

-- Dos listados con el mismo nombre en un colegio serían indistinguibles en el
-- desplegable de matriculación, que es el único sitio donde se eligen.
CREATE UNIQUE INDEX IF NOT EXISTS "admin_escolar_doc_listas_nombre_uniq"
  ON "admin_escolar_documento_listas" ("team_id", lower("nombre"))
  WHERE "activo";

ALTER TABLE "admin_escolar_documentos_requeridos"
  ADD COLUMN IF NOT EXISTS "lista_id" integer
  REFERENCES "admin_escolar_documento_listas"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "admin_escolar_docs_req_lista_id_idx"
  ON "admin_escolar_documentos_requeridos" ("team_id", "lista_id", "orden");

-- Qué listado se le pidió a esta matrícula. Nulo = las de antes de todo esto;
-- su checklist sigue saliendo por el camino viejo hasta que alguien lo cambie.
ALTER TABLE "admin_escolar_matriculas"
  ADD COLUMN IF NOT EXISTS "documento_lista_id" integer
  REFERENCES "admin_escolar_documento_listas"("id");

-- ── Traspaso de lo que ya existe ───────────────────────────────────────────
--
-- Un listado por cada combinación de nivel y tipo que el colegio tenga hoy,
-- con el nombre que describe esa combinación. Es lo que ya estaba pidiendo,
-- solo que ahora con nombre propio y editable. Nada se borra: lo que no
-- encuentre listado se queda con `lista_id` nulo y sigue funcionando.
INSERT INTO "admin_escolar_documento_listas" ("team_id", "nombre", "orden")
SELECT DISTINCT
  d.team_id,
  CASE
    WHEN d.nivel IS NULL AND d.tipo_inscripcion = 'reinscripcion' THEN 'Reinscripción'
    WHEN d.nivel IS NULL                                          THEN 'Admisión'
    WHEN d.tipo_inscripcion = 'reinscripcion'                     THEN 'Reinscripción ' || d.nivel
    ELSE 'Admisión ' || d.nivel
  END,
  0
FROM "admin_escolar_documentos_requeridos" d
WHERE d.activo
ON CONFLICT DO NOTHING;

UPDATE "admin_escolar_documentos_requeridos" d
SET "lista_id" = l.id
FROM "admin_escolar_documento_listas" l
WHERE d.lista_id IS NULL
  AND l.team_id = d.team_id
  AND l.nombre = CASE
    WHEN d.nivel IS NULL AND d.tipo_inscripcion = 'reinscripcion' THEN 'Reinscripción'
    WHEN d.nivel IS NULL                                          THEN 'Admisión'
    WHEN d.tipo_inscripcion = 'reinscripcion'                     THEN 'Reinscripción ' || d.nivel
    ELSE 'Admisión ' || d.nivel
  END;
