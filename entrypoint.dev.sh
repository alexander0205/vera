#!/bin/sh
# Entrypoint dev — aplica dump completo (schema+data) de Neon si DB vacía,
# arranca Next.js con HMR. NO corre drizzle migrate (schema viene del dump).
set -e

echo "▶ Esperando Postgres..."
until pg_isready -h postgres -U dev -d emitedo_v2 >/dev/null 2>&1; do
    sleep 1
done
echo "✓ Postgres OK"

TABLE_EXISTS=$(psql "$POSTGRES_URL" -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users'" 2>/dev/null || echo "")

if [ -z "$TABLE_EXISTS" ]; then
    echo "▶ DB vacía — aplicando dump completo (schema + data) de Neon..."
    psql "$POSTGRES_URL" -v ON_ERROR_STOP=0 -q -f /seeds/emitedo-v2-full.sql > /tmp/seed.log 2>&1 || true
    ERRORS=$(grep -c "ERROR" /tmp/seed.log || echo "0")
    echo "  Aplicado. Errores: $ERRORS"

    # rnc_padron es 777k filas, ~16MB. Default ON. Apagar con SEED_RNC_PADRON=false.
    if [ "${SEED_RNC_PADRON:-true}" = "true" ] && [ -f /seeds/rnc-padron-data.sql.gz ]; then
        echo "▶ Cargando rnc_padron (777k filas, ~30-60s)..."
        gunzip -c /seeds/rnc-padron-data.sql.gz | psql "$POSTGRES_URL" -v ON_ERROR_STOP=0 -q > /tmp/rnc.log 2>&1 || true
        tail -3 /tmp/rnc.log || true
    else
        echo "▶ Saltando rnc_padron"
    fi

    echo "▶ Post-seed (passwords + admin user)..."
    psql "$POSTGRES_URL" -f /seeds/emitedo-v2-post-seed.sql
else
    echo "▶ Schema ya existe — saltando dump"
fi

echo "▶ Iniciando emitedo-v2 (Next.js HMR)..."
exec pnpm dev
