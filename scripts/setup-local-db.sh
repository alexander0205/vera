#!/usr/bin/env bash
# =============================================================================
# scripts/setup-local-db.sh
# Bootstrap de base de datos local para EmiteDO
#
# USO:
#   bash scripts/setup-local-db.sh
#   pnpm db:local:setup
#
# Lo que hace:
#   1. Verifica Docker instalado
#   2. Levanta el container postgres (docker-compose.yml)
#   3. Espera a que esté healthy
#   4. Restaura el dump seed (scripts/db-seed/emitedo-local-seed.dump)
#   5. Verifica el restore mostrando counts de teams/users/clients
# =============================================================================
set -euo pipefail

# ── Colores / íconos ──────────────────────────────────────────────────────────
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RESET="\033[0m"

ok()   { echo -e "${GREEN}✓${RESET} $*"; }
err()  { echo -e "${RED}✗${RESET} $*" >&2; }
info() { echo -e "${CYAN}▶${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }

# ── Rutas relativas al repo ───────────────────────────────────────────────────
# Resuelve el directorio raíz del repo sin importar desde dónde se ejecuta
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DUMP_FILE="$REPO_ROOT/scripts/db-seed/emitedo-local-seed.dump"

# ── Configuración (debe coincidir con docker-compose.yml) ─────────────────────
CONTAINER_NAME="emitedo_postgres"
DB_NAME="emitedo"
DB_USER="postgres"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
HEALTH_TIMEOUT=60   # segundos máximos esperando el healthcheck

echo ""
echo -e "${CYAN}========================================${RESET}"
echo -e "${CYAN}  EmiteDO — Bootstrap Base de Datos Local${RESET}"
echo -e "${CYAN}========================================${RESET}"
echo ""

# ── 1. Verificar Docker ───────────────────────────────────────────────────────
info "Verificando Docker..."

if ! command -v docker &>/dev/null; then
  err "Docker no está instalado."
  echo "   Instala Docker Desktop desde: https://www.docker.com/products/docker-desktop/"
  exit 1
fi

if ! docker info &>/dev/null; then
  err "Docker está instalado pero no está corriendo."
  echo "   Abre Docker Desktop y espera a que el ícono de la ballena aparezca en la barra de menús."
  exit 1
fi
ok "Docker está corriendo."

# Detecta 'docker compose' (plugin v2) o 'docker-compose' (legacy v1)
if docker compose version &>/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE_CMD="docker-compose"
else
  err "No se encontró 'docker compose' ni 'docker-compose'."
  echo "   Instala Docker Desktop (incluye Compose v2): https://www.docker.com/products/docker-desktop/"
  exit 1
fi
ok "Compose disponible: $COMPOSE_CMD"

# ── 2. Verificar que existe el dump ──────────────────────────────────────────
info "Verificando dump seed..."

if [[ ! -f "$DUMP_FILE" ]]; then
  err "No se encontró el dump en: $DUMP_FILE"
  echo ""
  echo "   El archivo .dump NO se incluye en git (contiene datos de clientes)."
  echo "   Cómo obtenerlo:"
  echo "     • Pídelo al lead del proyecto (Alexander / canal #devs en Slack)"
  echo "     • O descárgalo desde el Drive compartido del equipo"
  echo "   Colócalo en: scripts/db-seed/emitedo-local-seed.dump"
  exit 1
fi

DUMP_SIZE=$(du -sh "$DUMP_FILE" 2>/dev/null | cut -f1)
ok "Dump encontrado ($DUMP_SIZE): scripts/db-seed/emitedo-local-seed.dump"

# ── 3. Levantar el container Postgres ────────────────────────────────────────
info "Levantando container Postgres ($CONTAINER_NAME)..."

cd "$REPO_ROOT"
$COMPOSE_CMD up -d postgres

ok "Servicio postgres iniciado."

# ── 4. Esperar healthcheck ────────────────────────────────────────────────────
info "Esperando a que Postgres esté healthy (timeout: ${HEALTH_TIMEOUT}s)..."

elapsed=0
while true; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "missing")

  if [[ "$STATUS" == "healthy" ]]; then
    ok "Container healthy."
    break
  fi

  if [[ "$STATUS" == "missing" ]]; then
    err "Container '$CONTAINER_NAME' no encontrado. Algo salió mal con docker compose up."
    exit 1
  fi

  if [[ $elapsed -ge $HEALTH_TIMEOUT ]]; then
    err "Timeout esperando healthcheck (${HEALTH_TIMEOUT}s). Estado actual: $STATUS"
    echo "   Revisa los logs con: docker logs $CONTAINER_NAME"
    exit 1
  fi

  echo -n "."
  sleep 2
  elapsed=$((elapsed + 2))
done

# ── 5. Restaurar el dump ──────────────────────────────────────────────────────
info "Restaurando dump en la base de datos '$DB_NAME'..."

# Copia el dump al container en un path temporal
CONTAINER_DUMP_PATH="/tmp/emitedo-seed.dump"
docker cp "$DUMP_FILE" "${CONTAINER_NAME}:${CONTAINER_DUMP_PATH}"

# pg_restore con --clean --if-exists: es idempotente
# - Si la DB ya tiene objetos → los limpia antes de recrear (2da ejecución)
# - Si la DB está vacía → --if-exists evita errores por "no existe"
# - --no-owner / --no-acl: evita errores de privilegios en Postgres local
# stderr capturado a una variable para distinguir errores reales de warnings
set +e
RESTORE_OUTPUT=$(docker exec "$CONTAINER_NAME" \
  pg_restore \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    "$CONTAINER_DUMP_PATH" 2>&1)
RESTORE_EXIT=$?
set -e

# pg_restore retorna exit code 1 cuando hay warnings no fatales (e.g. "no existe" en --clean).
# Solo falla si hay errores reales que afectan el restore.
if [[ $RESTORE_EXIT -ne 0 ]]; then
  # Filtra líneas de error real (no warnings esperados de --clean/--if-exists)
  REAL_ERRORS=$(echo "$RESTORE_OUTPUT" | grep -v "does not exist, skipping" \
    | grep -v "ERROR:  role" \
    | grep -v "^pg_restore:" \
    | grep -i "error" || true)

  if [[ -n "$REAL_ERRORS" ]]; then
    err "pg_restore falló con errores:"
    echo "$REAL_ERRORS" >&2
    echo ""
    echo "   Output completo:"
    echo "$RESTORE_OUTPUT" >&2
    exit 1
  else
    warn "pg_restore terminó con warnings menores (normales en --clean/--if-exists). Continuando..."
  fi
fi

# Limpia el dump temporal del container
docker exec "$CONTAINER_NAME" rm -f "$CONTAINER_DUMP_PATH"

ok "Dump restaurado."

# ── 6. Verificar el restore ───────────────────────────────────────────────────
info "Verificando datos restaurados..."

run_sql() {
  docker exec "$CONTAINER_NAME" \
    psql -U "$DB_USER" -d "$DB_NAME" -t -c "$1" 2>/dev/null | tr -d ' '
}

TEAMS_COUNT=$(run_sql "SELECT COUNT(*) FROM teams;")
USERS_COUNT=$(run_sql "SELECT COUNT(*) FROM users;")
CLIENTS_COUNT=$(run_sql "SELECT COUNT(*) FROM clients;" 2>/dev/null || echo "N/A")

echo ""
echo -e "  Equipos  (teams)  : ${GREEN}${TEAMS_COUNT}${RESET}"
echo -e "  Usuarios (users)  : ${GREEN}${USERS_COUNT}${RESET}"
echo -e "  Clientes (clients): ${GREEN}${CLIENTS_COUNT}${RESET}"
echo ""

if [[ "$TEAMS_COUNT" == "7" ]]; then
  ok "Verificación OK — 7 teams restaurados correctamente."
else
  warn "Se esperaban 7 teams pero se encontraron ${TEAMS_COUNT}. Revisa el dump."
fi

# ── 7. Mensaje final ──────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}========================================${RESET}"
echo -e "${GREEN}  Base de datos lista.${RESET}"
echo -e "${GREEN}========================================${RESET}"
echo ""
echo "  Conexión : postgresql://postgres:postgres@localhost:54322/emitedo"
echo "  Container: $CONTAINER_NAME (puerto host 54322)"
echo ""
echo "  Siguiente paso — arrancar la app:"
echo ""
echo "    pnpm install"
echo "    pnpm dev"
echo ""
echo "  La app usa POSTGRES_URL del archivo .env, que ya apunta a localhost:54322."
echo ""
echo "  Para volver a resetear la DB desde cero:"
echo "    pnpm db:local:setup   (idempotente — puede correrse N veces)"
echo ""
