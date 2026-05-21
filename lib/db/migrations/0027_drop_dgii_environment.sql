-- Drop teams.dgii_environment.
-- El ambiente DGII ahora vive solo en ecf-api (contrib.ambiente).
-- La copia local causaba drift (UI mostraba CerteCF, backend enviaba testecf).
ALTER TABLE "teams" DROP COLUMN IF EXISTS "dgii_environment";
