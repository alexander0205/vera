#!/usr/bin/env bash
#
# Las ocho migraciones de WhatsApp + enlace de pago, en orden.
#
#   0140  whatsapp_plantillas_aviso        qué plantilla usa cada aviso
#   0141  whatsapp_plantillas              almacén local de plantillas
#   0142  + boton                          la plantilla lleva botón o no
#   0143  admin_escolar_datos_pago         enlace de pago del padre
#         admin_escolar_links_pago         (uno por responsable, no caduca)
#         admin_escolar_comprobantes       lo que sube el padre
#   0144  + estado_entrega en avisos       si el aviso llegó de verdad
#   0145  admin_escolar_cuentas_banco      varias cuentas por colegio
#   0146  + documento por cuenta           el RNC puede diferir por banco
#   0147  + plantilla_con_link             la gemela con botón «Ver factura»
#
# Uso:
#   POSTGRES_URL="postgres://…" bash scripts/migrar-0140-0147.sh
#   POSTGRES_URL="…" bash scripts/migrar-0140-0147.sh --comprobar   (solo mira)
#
# Todas son aditivas salvo 0145, que MUEVE la cuenta de banco a su tabla nueva
# y luego borra las columnas viejas de admin_escolar_datos_pago. El movimiento
# va antes del borrado, dentro del mismo archivo, y el RENAME está envuelto en
# un IF EXISTS: repetir el script no rompe nada.
#
# Cada archivo corre en su propia transacción con ON_ERROR_STOP: si una falla,
# se detiene ahí y las anteriores quedan aplicadas. Ninguna depende de que la
# siguiente termine.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGS="$RAIZ/lib/db/migrations"
ARCHIVOS=(
  0140_whatsapp_plantillas_aviso.sql
  0141_whatsapp_plantillas.sql
  0142_whatsapp_plantilla_boton.sql
  0143_escolar_link_pago.sql
  0144_avisos_entrega.sql
  0145_escolar_cuentas_banco.sql
  0146_cuenta_documento.sql
  0147_plantilla_con_link.sql
)

COMPROBACION="SELECT
  (SELECT count(*) FROM information_schema.tables  WHERE table_name='whatsapp_plantillas_aviso')  AS m0140,
  (SELECT count(*) FROM information_schema.tables  WHERE table_name='whatsapp_plantillas')        AS m0141,
  (SELECT count(*) FROM information_schema.columns WHERE table_name='whatsapp_plantillas' AND column_name='boton') AS m0142,
  (SELECT count(*) FROM information_schema.tables  WHERE table_name='admin_escolar_links_pago')   AS m0143,
  (SELECT count(*) FROM information_schema.columns WHERE table_name='admin_escolar_avisos_enviados' AND column_name='estado_entrega') AS m0144,
  (SELECT count(*) FROM information_schema.tables  WHERE table_name='admin_escolar_cuentas_banco') AS m0145,
  (SELECT count(*) FROM information_schema.columns WHERE table_name='admin_escolar_cuentas_banco' AND column_name='documento') AS m0146,
  (SELECT count(*) FROM information_schema.columns WHERE table_name='whatsapp_plantillas_aviso' AND column_name='plantilla_con_link') AS m0147;"

if [ -z "${POSTGRES_URL:-}" ]; then
  echo "Falta POSTGRES_URL." >&2
  exit 1
fi

# A qué base se está apuntando. Se enseña SIEMPRE, sin la contraseña: correr
# esto contra la base equivocada es el único error caro que tiene el script.
DESTINO=$(printf '%s' "$POSTGRES_URL" | sed -E 's#.*@([^/?]+).*#\1#')
echo "════════════════════════════════════════════════════════"
echo " Destino: $DESTINO"
echo "════════════════════════════════════════════════════════"
echo

echo "── Antes ───────────────────────────────────────────────"
psql "$POSTGRES_URL" -X -q -c "$COMPROBACION"

if [ "${1:-}" = "--comprobar" ]; then
  echo "(solo comprobación: no se aplicó nada)"
  exit 0
fi

echo
echo "── Aplicando ───────────────────────────────────────────"
for f in "${ARCHIVOS[@]}"; do
  printf '   %-38s ' "$f"
  if psql "$POSTGRES_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$MIGS/$f" >/dev/null 2>/tmp/mig-err.txt; then
    echo "ok"
  else
    echo "FALLÓ"
    echo
    sed 's/^/      /' /tmp/mig-err.txt
    exit 1
  fi
done

echo
echo "── Después ─────────────────────────────────────────────"
psql "$POSTGRES_URL" -X -q -c "$COMPROBACION"
echo "   (los ocho tienen que dar 1)"
