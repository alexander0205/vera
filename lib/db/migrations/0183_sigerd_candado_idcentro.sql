-- SIGERD · el candado de "Obtener información" ya no exige id_centro al iniciar.
--
-- `reclamarCandado` (lib/administracion-escolar/obtener-sigerd.ts) inserta la
-- fila `corriendo` ANTES de tocar SIGERD, cuando todavía no se conoce el centro;
-- `id_centro` se llena al completar la descarga (`guardarMirror`). El candado se
-- identifica por (team, año), no por centro: un colegio = un centro.
--
-- La tabla original (0096) quedó con `id_centro NOT NULL` y el índice único por
-- (team, id_centro, año). En PROD ese primer INSERT sin id_centro violaba el
-- NOT NULL → la transacción del candado reventaba → "Obtener información" daba
-- 500 y no dejaba fila. schema.ts ya declara id_centro nullable y el único por
-- (team, año); esta migración reconcilia el esquema con esa intención.
--
-- Idempotente y aditiva. La tabla suele estar vacía (aún no se ha importado),
-- así que el nuevo único no colisiona.

ALTER TABLE "sigerd_importaciones" ALTER COLUMN "id_centro" DROP NOT NULL;

DROP INDEX IF EXISTS "sigerd_importaciones_centro_ano_uniq";

CREATE UNIQUE INDEX IF NOT EXISTS "sigerd_importaciones_team_ano_uniq"
  ON "sigerd_importaciones" ("team_id", "ano_academico");
