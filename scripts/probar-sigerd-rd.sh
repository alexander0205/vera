#!/usr/bin/env bash
#
# ¿SIGERD está caído, o solo nos bloquea a nosotros?
#
# Correr ESTO en la Mac que está en República Dominicana. Desde fuera del país
# el portal acepta la conexión TCP y luego no contesta al TLS, que es lo mismo
# que se vería si estuviera caído — las dos cosas no se distinguen sin una
# prueba desde una IP dominicana.
#
#   bash probar-sigerd-rd.sh
#
# No manda credenciales ni toca nada: solo mira si el portal responde.

set -u

HOST="sigerd.minerd.gob.do"
CONTROL="www.minerd.gob.do"

echo "════════════════════════════════════════════════════"
echo " Prueba de SIGERD desde esta máquina"
echo " $(date)"
echo "════════════════════════════════════════════════════"
echo

echo "── 1 · Desde dónde sale esta máquina ──────────────"
SALIDA=$(curl -s --max-time 10 https://ifconfig.co/json 2>/dev/null)
if [ -n "$SALIDA" ]; then
  echo "$SALIDA" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("   IP pública:", d.get("ip"), "\n   País:      ", d.get("country"), "("+str(d.get("country_iso"))+")", "\n   Proveedor: ", d.get("asn_org"))' 2>/dev/null \
    || echo "   $SALIDA"
else
  echo "   No se pudo averiguar (¿sin internet?)"
fi
echo
echo "   ↑ Si el país NO dice Dominican Republic (DO), esta prueba no sirve:"
echo "     hay que correrla en la máquina que está en el país."
echo

echo "── 2 · DNS ────────────────────────────────────────"
IP=$(dig +short "$HOST" | head -1)
echo "   $HOST → ${IP:-（no resuelve）}"
echo

echo "── 3 · ¿Abre el puerto 443? ───────────────────────"
if nc -z -G 8 -w 8 "$HOST" 443 2>/dev/null; then
  echo "   ✓ TCP 443 abre"
else
  echo "   ✗ TCP 443 NO abre"
fi
echo

echo "── 4 · ¿Completa el TLS y contesta HTTP? ──────────"
echo "   (esto es lo que falla desde fuera del país)"
curl -s -o /tmp/sigerd-portada.html \
  -w "   http=%{http_code}  tls=%{time_appconnect}s  total=%{time_total}s\n" \
  --max-time 30 "https://$HOST/" || echo "   curl salió con error $?"
echo

echo "── 5 · ¿Es de verdad la página de login? ──────────"
if [ -s /tmp/sigerd-portada.html ]; then
  BYTES=$(wc -c < /tmp/sigerd-portada.html | tr -d ' ')
  echo "   Recibidos $BYTES bytes"
  if grep -qi 'inicio-form\|Account/CargarInformacion\|name="password"' /tmp/sigerd-portada.html; then
    echo "   ✓ Es el formulario de login de SIGERD"
  else
    echo "   ⚠ Contestó algo, pero no parece el login. Primeras líneas:"
    head -c 300 /tmp/sigerd-portada.html | tr -d '\r' | sed 's/^/     /'
  fi
else
  echo "   ✗ No llegó nada"
fi
echo

echo "── 6 · Control: otro host del MINERD ──────────────"
curl -s -o /dev/null -w "   $CONTROL  http=%{http_code}  total=%{time_total}s\n" \
  --max-time 20 "https://$CONTROL/" || true
echo

echo "════════════════════════════════════════════════════"
echo " CÓMO LEERLO"
echo "════════════════════════════════════════════════════"
echo " · Paso 4 da http=200 y el paso 5 encuentra el login"
echo "     → SIGERD está bien y nos bloquea por IP de fuera del país."
echo "       Hay que sacar el tráfico por esta máquina (ver el plan)."
echo
echo " · Paso 4 da http=000 también aquí"
echo "     → SIGERD está caído para todo el mundo. Ninguna VPN"
echo "       lo arregla; toca esperar o escribirle al MINERD."
echo
echo " · Paso 3 abre pero el 4 se queda colgado"
echo "     → El portal acepta y no contesta: mismo síntoma que"
echo "       tenemos nosotros. Apunta a que está roto, no a bloqueo."
echo "════════════════════════════════════════════════════"
