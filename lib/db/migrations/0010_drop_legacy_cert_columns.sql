-- ─────────────────────────────────────────────────────────────────────────────
-- Migración 0010: DROP de columnas legacy de certificados en plain text
--
-- Prerrequisitos (en orden):
--   1. Migración 0009_security.sql aplicada
--   2. scripts/migrate-certs.ts ejecutado exitosamente
--   3. Verificado que cert_p12_ciphered IS NOT NULL en todos los teams con cert
--
-- Verificar antes de aplicar:
--   SELECT id, name, cert_p12, cert_password, dgii_token,
--          cert_p12_ciphered IS NOT NULL as cifrado
--   FROM teams
--   WHERE cert_p12 IS NOT NULL OR cert_password IS NOT NULL OR dgii_token IS NOT NULL;
--   -- Si devuelve 0 filas → seguro aplicar esta migración
--
-- Para aplicar:
--   npx dotenv -e .env -- psql $POSTGRES_URL -f lib/db/migrations/0010_drop_legacy_cert_columns.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Seguridad extra: fallar si quedan datos plain text sin migrar
DO $$
DECLARE
  pending_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO pending_count
  FROM teams
  WHERE cert_p12 IS NOT NULL
     OR cert_password IS NOT NULL
     OR dgii_token IS NOT NULL;

  IF pending_count > 0 THEN
    RAISE EXCEPTION
      'Hay % teams con datos en plain text sin migrar. Ejecuta scripts/migrate-certs.ts primero.',
      pending_count;
  END IF;
END $$;

-- Eliminar columnas legacy
ALTER TABLE teams
  DROP COLUMN IF EXISTS cert_p12,
  DROP COLUMN IF EXISTS cert_password,
  DROP COLUMN IF EXISTS dgii_token;

-- Confirmación
DO $$
BEGIN
  RAISE NOTICE '✅ Columnas legacy eliminadas: cert_p12, cert_password, dgii_token';
  RAISE NOTICE '   La tabla teams ahora solo contiene campos cifrados.';
END $$;
