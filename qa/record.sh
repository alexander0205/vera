#!/bin/bash
# Helper: registra resultado de un caso QA.
# Uso: ./qa/record.sh AUTH-01 pass "Login OK, redirect inmediato"
#      ./qa/record.sh AUTH-02 fail "No muestra mensaje claro"
set -e
ID="$1"
STATUS="$2"
NOTES="$3"
SCREENSHOT="${4:-}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [[ -z "$ID" || -z "$STATUS" ]]; then
  echo "Uso: $0 <ID> <pass|fail|blocked|partial> <notes> [screenshot]"
  exit 1
fi

FILE="$(dirname "$0")/qa-results.json"
# Crear archivo si no existe
[ -f "$FILE" ] || echo "[]" > "$FILE"

# Atomic update via python (jq no siempre disponible)
python3 - "$FILE" "$ID" "$STATUS" "$NOTES" "$SCREENSHOT" "$TIMESTAMP" <<'PY'
import json, sys
file, id_, status, notes, screenshot, ts = sys.argv[1:]
with open(file, 'r') as f:
    data = json.load(f)
# Reemplazar si existe, sino append
data = [r for r in data if r.get('id') != id_]
data.append({'id': id_, 'status': status, 'notes': notes, 'screenshot': screenshot or None, 'ts': ts})
with open(file, 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
print(f"✓ {id_}: {status}")
PY
