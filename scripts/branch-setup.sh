#!/bin/bash
set -e

NEON_PROJECT_ID="rapid-wind-65520589"
NEON_DEVELOP_BRANCH_ID="br-lingering-sky-anjp3iri"
ENV_FILE=".env.local"

BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)

if [ "$BRANCH_NAME" = "develop" ] || [ "$BRANCH_NAME" = "main" ] || [ "$BRANCH_NAME" = "developer" ]; then
  echo "Ya estás en '$BRANCH_NAME' — no se crea branch de Neon para branches principales."
  exit 0
fi

SAFE_NAME="${BRANCH_NAME//\//-}"

echo "🌿 Branch git: $BRANCH_NAME"
echo "🐘 Creando Neon branch: $SAFE_NAME (desde develop)..."

# Create branch (idempotent — ignore if exists)
RESPONSE=$(neonctl branches create \
  --project-id "$NEON_PROJECT_ID" \
  --name "$SAFE_NAME" \
  --parent "$NEON_DEVELOP_BRANCH_ID" \
  --output json 2>/dev/null || echo "exists")

if [ "$RESPONSE" = "exists" ]; then
  echo "   Branch ya existe, obteniendo connection string..."
fi

# Get connection string
DB_URL=$(neonctl connection-string \
  --project-id "$NEON_PROJECT_ID" \
  --branch "$SAFE_NAME" 2>/dev/null)

if [ -z "$DB_URL" ]; then
  echo "❌ No se pudo obtener connection string para '$SAFE_NAME'"
  exit 1
fi

# Update POSTGRES_URL in .env.local
if [ -f "$ENV_FILE" ]; then
  if grep -q "^POSTGRES_URL=" "$ENV_FILE"; then
    # Replace existing
    sed -i.bak "s|^POSTGRES_URL=.*|POSTGRES_URL=$DB_URL|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    echo "POSTGRES_URL=$DB_URL" >> "$ENV_FILE"
  fi
else
  echo "POSTGRES_URL=$DB_URL" > "$ENV_FILE"
fi

echo "✅ .env.local actualizado con Neon branch '$SAFE_NAME'"
echo "   $DB_URL" | sed 's|npg_[^@]*|npg_***|'
echo ""
echo "💡 Corre 'pnpm db:migrate' si tienes migraciones nuevas en este branch."
