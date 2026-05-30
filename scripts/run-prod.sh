#!/usr/bin/env bash
#
# Corre la app conectada a la BASE DE DATOS DE PRODUCCIÓN (Neon).
#
# Uso:
#   pnpm dev:prod      → next dev --turbopack contra prod DB (hot reload)
#   pnpm start:prod    → next build && next start contra prod DB (modo producción real)
#   bash scripts/run-prod.sh [dev|start]
#
# Requiere un archivo `.env.prod` (gitignored) con al menos:
#   POSTGRES_URL="postgresql://...neon.tech/...?sslmode=require&channel_binding=require"
# Ver `.env.prod.example`. Los demás valores (ECF_API_URL, claves, etc.) se toman de `.env`.
#
# ⚠️  Las escrituras desde la app afectan DATOS REALES de producción.

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.prod"
MODE="${1:-dev}"

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ Falta $ENV_FILE." >&2
  echo "  Créalo con la POSTGRES_URL de producción. Plantilla: .env.prod.example" >&2
  echo "  cp .env.prod.example .env.prod   # y edita POSTGRES_URL" >&2
  exit 1
fi

# Cargar overrides de prod ANTES de next (Next no sobreescribe vars ya presentes en el entorno).
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
echo "⚠️   MODO PRODUCCIÓN — conectado a la DB real"
echo "    Host: $DB_HOST"
echo "    Las escrituras (crear/editar/borrar/pagos) afectan datos reales."
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
