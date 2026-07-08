-- ─────────────────────────────────────────────────────────────────────────────
-- Reportes financieros — capa de escala (rollup materializado)
--
-- `mv_reportes_ventas_lineas` expande `ecf_documents.lineas_json` (JSON, en PESOS)
-- a una fila por línea, ya normalizada a CENTAVOS y con la clave de producto.
-- El reporte "Ingresos por producto" lee de aquí en vez de escanear y parsear el
-- JSON de todas las facturas en cada request → costo plano al crecer la data.
--
-- Refresco: `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reportes_ventas_lineas`
-- vía Vercel Cron (/api/cron/reportes-refresh), NO pg_cron (que en Neon exige
-- compute 24/7). El índice único de abajo habilita el refresco CONCURRENTLY.
--
-- Si esta migración aún no se aplica, `getIngresosPorProducto` cae a expansión
-- en vivo — el rollup solo acelera, no es requisito de funcionamiento.
--
-- Nota: los campos numéricos de `lineas_json` pueden venir como texto no-numérico
-- (ej. tasaItbis = 'exento'). Se extraen con un cast SEGURO (regex que descarta
-- todo lo que no sea dígito/punto/signo) → valor inválido se trata como 0/1.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_reportes_ventas_lineas AS
SELECT
  d.id                                                        AS ecf_document_id,
  d.team_id                                                   AS team_id,
  ln.ord::int                                                 AS linea_ord,
  (d.fecha_emision AT TIME ZONE 'America/Santo_Domingo')::date AS fecha,
  -- clave de agrupación: referencia (SKU) si existe, si no nombre normalizado
  CASE
    WHEN coalesce(nullif(trim(ln.elem->>'referencia'), ''), '') <> ''
      THEN 'ref:' || trim(ln.elem->>'referencia')
    ELSE 'nom:' || lower(trim(coalesce(ln.elem->>'nombreItem', ln.elem->>'nombre', 'Ítem')))
  END                                                          AS clave,
  coalesce(ln.elem->>'nombreItem', ln.elem->>'nombre', 'Ítem') AS nombre,
  nullif(trim(coalesce(ln.elem->>'referencia', '')), '')       AS referencia,
  v.cant                                                       AS unidades,
  -- base (sin ITBIS) en centavos = (precio*cantidad − descuento) * 100
  round(greatest(0, v.precio * v.cant - v.descuento) * 100)::bigint   AS base_cents,
  -- itbis de la línea en centavos = base * tasa
  round(greatest(0, v.precio * v.cant - v.descuento) * v.tasa * 100)::bigint AS itbis_cents
FROM ecf_documents d
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN d.lineas_json IS NOT NULL AND jsonb_typeof(d.lineas_json::jsonb) = 'array'
      THEN d.lineas_json::jsonb
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS ln(elem, ord)
-- Cast numérico seguro (computa una vez por línea)
CROSS JOIN LATERAL (
  SELECT
    coalesce(nullif(regexp_replace(coalesce(ln.elem->>'precioUnitarioItem', ln.elem->>'precio', ''), '[^0-9.\-]', '', 'g'), '')::numeric, 0) AS precio,
    coalesce(nullif(regexp_replace(coalesce(ln.elem->>'cantidadItem',       ln.elem->>'cantidad',  ''), '[^0-9.\-]', '', 'g'), '')::numeric, 1) AS cant,
    coalesce(nullif(regexp_replace(coalesce(ln.elem->>'descuentoMonto',      ln.elem->>'descuento', ''), '[^0-9.\-]', '', 'g'), '')::numeric, 0) AS descuento,
    coalesce(nullif(regexp_replace(coalesce(ln.elem->>'tasaItbis',           ln.elem->>'tasa',      ''), '[^0-9.\-]', '', 'g'), '')::numeric, 0) AS tasa
) AS v
WHERE d.estado IN ('ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO')
  AND d.tipo_ecf IN ('31', '32', '33', '44', '45');

-- Índice único (grano: documento + línea) → habilita REFRESH ... CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS mv_ventas_lineas_pk
  ON mv_reportes_ventas_lineas (ecf_document_id, linea_ord);

-- Índice de consulta por team + fecha
CREATE INDEX IF NOT EXISTS mv_ventas_lineas_team_fecha
  ON mv_reportes_ventas_lineas (team_id, fecha);

-- Índice de agrupación por producto
CREATE INDEX IF NOT EXISTS mv_ventas_lineas_clave
  ON mv_reportes_ventas_lineas (team_id, clave);
