#!/usr/bin/env bash
#
# Corre la app conectada a la BASE DE DATOS DE DEVELOP (Neon twilight).
#
# Uso:
#   pnpm corre:dev          → next dev --turbopack contra DB develop (hot reload)
#   pnpm corre:dev:build    → next build && next start contra DB develop
#   bash scripts/run-dev.sh [dev|start]
#
# Requiere un archivo `.env.dev` con la POSTGRES_URL del Neon de develop.
# Aislado de prod — escrituras solo afectan develop.

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.dev"
MODE="${1:-dev}"

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ Falta $ENV_FILE." >&2
  exit 1
fi

# Cargar overrides de develop ANTES de next (Next no sobreescribe vars ya presentes en el entorno).
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ -z "${POSTGRES_URL:-}" ]; then
  echo "✗ $ENV_FILE no define POSTGRES_URL." >&2
  exit 1
fi

DB_HOST="$(printf '%s' "$POSTGRES_URL" | sed -E 's|.*@([^/?]+).*|\1|')"
echo "──────────────────────────────────────────────────────────────"
echo "🛠   MODO DEVELOP — conectado a la DB de develop (Neon)"
echo "    Host: $DB_HOST"
echo "    Aislado de prod. Escrituras solo afectan develop."
echo "──────────────────────────────────────────────────────────────"

case "$MODE" in
  dev)
    exec pnpm exec next dev --turbopack
    ;;
  start)
    pnpm exec next build
    exec pnpm exec next start
    ;;
  *)
    echo "Modo inválido: '$MODE'. Usa: dev | start" >&2
    exit 1
    ;;
esac
