#!/usr/bin/env bash
#
# Prepara una Mac para ser relé de SIGERD.
#
#   bash sigerd-relay-instalar.sh
#
# Qué comprueba y qué instala:
#   1. Que la máquina esté en República Dominicana. Si no, para aquí: una IP de
#      otro país no sirve y el síntoma sería idéntico a «el portal está caído».
#   2. Node 18 o superior. El relé necesita `fetch` y `Headers.getSetCookie`.
#   3. cloudflared, para sacar el relé a internet sin tocar el router.
#
# Nada se instala sin preguntar. El script no pide sudo por su cuenta; si algo
# lo necesita, lo dice y lo corre usted.

set -u
VERDE=$'\033[0;32m'; ROJO=$'\033[0;31m'; AMAR=$'\033[0;33m'; FIN=$'\033[0m'
ok(){ echo "  ${VERDE}✓${FIN} $1"; }
mal(){ echo "  ${ROJO}✗${FIN} $1"; }
avi(){ echo "  ${AMAR}!${FIN} $1"; }

echo
echo "═══ Preparar esta Mac como relé de SIGERD ═══"
echo

# ── 1 · ¿Estamos en el país? ───────────────────────────────────────────
echo "── 1 · Desde dónde sale esta máquina"
JSON=$(curl -s --max-time 10 https://ifconfig.co/json 2>/dev/null)
PAIS=$(echo "$JSON" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("country_iso",""))' 2>/dev/null)
IP=$(echo "$JSON"   | python3 -c 'import json,sys;print(json.load(sys.stdin).get("ip",""))' 2>/dev/null)
ISP=$(echo "$JSON"  | python3 -c 'import json,sys;print(json.load(sys.stdin).get("asn_org",""))' 2>/dev/null)

if [ "$PAIS" = "DO" ]; then
  ok "$IP · $ISP · República Dominicana"
elif [ -z "$PAIS" ]; then
  mal "No se pudo averiguar la IP de salida. ¿Hay internet?"; exit 1
else
  mal "Sale por $IP — país $PAIS, no República Dominicana."
  echo "     Esta máquina NO sirve de relé: el portal no le va a contestar."
  exit 1
fi
echo

# ── 2 · Node ───────────────────────────────────────────────────────────
echo "── 2 · Node"
if command -v node >/dev/null 2>&1; then
  V=$(node -v); MAYOR=$(echo "$V" | sed 's/v\([0-9]*\).*/\1/')
  if [ "$MAYOR" -ge 18 ]; then ok "Node $V"
  else mal "Node $V es muy viejo. Hace falta 18 o superior."; NECESITA_NODE=1; fi
else
  mal "Node no está instalado."; NECESITA_NODE=1
fi

if [ "${NECESITA_NODE:-0}" = "1" ]; then
  if command -v brew >/dev/null 2>&1; then
    read -r -p "     ¿Instalo Node con Homebrew? [s/N] " R
    [ "${R:-n}" = "s" ] && brew install node || { echo "     Instálelo y vuelva a correr esto."; exit 1; }
  else
    echo "     Descárguelo de https://nodejs.org (versión LTS) y vuelva a correr esto."
    exit 1
  fi
fi
echo

# ── 3 · cloudflared ────────────────────────────────────────────────────
echo "── 3 · cloudflared (el túnel)"
if command -v cloudflared >/dev/null 2>&1; then
  ok "$(cloudflared --version 2>/dev/null | head -1)"
else
  mal "No está instalado."
  if command -v brew >/dev/null 2>&1; then
    read -r -p "     ¿Lo instalo con Homebrew? [s/N] " R
    [ "${R:-n}" = "s" ] && brew install cloudflared
  else
    echo "     Instale Homebrew (https://brew.sh) o baje cloudflared a mano."
  fi
fi
echo

# ── 4 · El relé ────────────────────────────────────────────────────────
echo "── 4 · El relé"
AQUI="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$AQUI/sigerd-relay.mjs" ]; then ok "sigerd-relay.mjs encontrado"
else mal "Falta sigerd-relay.mjs junto a este script."; exit 1; fi

if [ -z "${RELAY_KEY:-}" ]; then
  avi "No hay RELAY_KEY en el entorno."
  echo "     Tiene que ser LA MISMA en todas las máquinas y en Vercel."
  echo "     Si es la primera, genérela así y guárdela:"
  echo
  echo "       openssl rand -hex 32"
  echo
  read -r -p "     Pegue aquí la clave (o Enter para saltar): " RELAY_KEY
fi

if [ -n "${RELAY_KEY:-}" ]; then
  echo
  read -r -p "     ¿Dejo el relé corriendo como servicio (arranca solo, no se duerme)? [s/N] " R
  if [ "${R:-n}" = "s" ]; then
    RELAY_KEY="$RELAY_KEY" node "$AQUI/sigerd-relay-servicio.mjs" instalar
    sleep 2
    echo
    echo "── Comprobación"
    curl -s --max-time 8 http://127.0.0.1:"${RELAY_PORT:-8787}"/salud || avi "El servicio no contestó todavía; revise ~/Library/Logs/sigerd-rele.log"
    echo
  fi
fi

echo
echo "═══ Falta el túnel ═══"
echo
echo "  Esto pide un login por navegador, así que va a mano:"
echo
echo "    cloudflared tunnel login"
echo "    cloudflared tunnel create sigerd-rele-$(hostname -s | tr '[:upper:]' '[:lower:]')"
echo "    cloudflared tunnel route dns sigerd-rele-$(hostname -s | tr '[:upper:]' '[:lower:]') rele.SUDOMINIO.com"
echo "    cloudflared tunnel run --url http://127.0.0.1:${RELAY_PORT:-8787} sigerd-rele-$(hostname -s | tr '[:upper:]' '[:lower:]')"
echo
echo "  Y en Vercel, agregando esta máquina a la lista:"
echo
echo "    SIGERD_RELAYS    = https://rele.SUDOMINIO.com,...las otras..."
echo "    SIGERD_RELAY_KEY = la misma clave"
echo
