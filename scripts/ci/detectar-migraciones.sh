#!/usr/bin/env bash
# Compara dos commits y dice si hay archivos .sql tocados en lib/db/migrations
# entre ellos (se ignora lib/db/migrations/meta, que son snapshots internos de
# drizzle-kit, no migraciones reales).
#
# Uso:
#   scripts/ci/detectar-migraciones.sh <sha-base> <sha-head>
#   scripts/ci/detectar-migraciones.sh --contra-v2   # HEAD vs origin/v2, para correr en local antes de abrir un PR
#
# Salida: primera línea "hay-migraciones" o "sin-migraciones"; el resto, la
# lista de archivos si los hay. Exit code 0 cuando los refs son válidos —
# esto informa, no falla. Si $BASE o $HEAD no son refs válidos, es un error
# de uso/entorno real y el script falla (exit no-cero) en vez de reportar
# "sin-migraciones" falsamente.
set -euo pipefail

if [ "${1:-}" = "--contra-v2" ]; then
  git fetch origin v2 --quiet
  BASE="origin/v2"
  HEAD="HEAD"
else
  BASE="${1:?Falta el sha base. Uso: detectar-migraciones.sh <sha-base> <sha-head>}"
  HEAD="${2:?Falta el sha head. Uso: detectar-migraciones.sh <sha-base> <sha-head>}"
fi

if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
  echo "Error: '$BASE' no es un ref válido en este repositorio." >&2
  exit 1
fi
if ! git rev-parse --verify --quiet "$HEAD" >/dev/null; then
  echo "Error: '$HEAD' no es un ref válido en este repositorio." >&2
  exit 1
fi

ARCHIVOS=$(git diff --name-only "$BASE" "$HEAD" -- lib/db/migrations ':!lib/db/migrations/meta')

if [ -z "$ARCHIVOS" ]; then
  echo "sin-migraciones"
  exit 0
fi

echo "hay-migraciones"
echo "$ARCHIVOS"
