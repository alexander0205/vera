#!/usr/bin/env bash
# Compara dos commits y dice si hay archivos .sql tocados en lib/db/migrations
# entre ellos (se ignora lib/db/migrations/meta, que son snapshots internos de
# drizzle-kit, no migraciones reales).
#
# Uso:
#   scripts/ci/detectar-migraciones.sh <sha-base> <sha-head>
#   scripts/ci/detectar-migraciones.sh --contra-master   # HEAD vs origin/master, para correr en local antes de abrir un PR
#
# Salida: primera línea "hay-migraciones" o "sin-migraciones"; el resto, la
# lista de archivos si los hay. Exit code siempre 0 — esto informa, no falla.
set -euo pipefail

if [ "${1:-}" = "--contra-master" ]; then
  git fetch origin master --quiet
  BASE="origin/master"
  HEAD="HEAD"
else
  BASE="${1:?Falta el sha base. Uso: detectar-migraciones.sh <sha-base> <sha-head>}"
  HEAD="${2:?Falta el sha head. Uso: detectar-migraciones.sh <sha-base> <sha-head>}"
fi

ARCHIVOS=$(git diff --name-only "$BASE" "$HEAD" -- lib/db/migrations -- ':!lib/db/migrations/meta' || true)

if [ -z "$ARCHIVOS" ]; then
  echo "sin-migraciones"
  exit 0
fi

echo "hay-migraciones"
echo "$ARCHIVOS"
