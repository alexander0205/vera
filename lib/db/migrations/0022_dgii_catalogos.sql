-- ─────────────────────────────────────────────────────────────────────────────
-- Migración 0019: Tabla `dgii_catalogos` — caché local de catálogos DGII
--
-- Reemplaza llamadas de red a ecf-api (/v1/catalogos/*) por lookups locales en
-- Postgres. Los catálogos DGII son estáticos (cambian muy raramente — décadas),
-- así que cachearlos localmente elimina ~15 round-trips por carga de formulario
-- y permite filtros/joins SQL directos.
--
-- Diseño: tabla genérica con columna `metadata jsonb` para los campos extra
-- (descripcion, tasa, sigla, simbolo, codigoIso2, formato, etc.) que varían
-- entre catálogos. Single source of truth, single migración, single sync job.
--
-- Tipos esperados (catálogo: descripción):
--   ambientes               TesteCF / CerteCF / Produccion  (3)
--   tipos-comprobante       Credito Fiscal, Consumo, etc.   (~10)
--   tipos-documento         RNC, Cedula, Pasaporte          (3)
--   formas-pago             Efectivo, Cheque, etc.          (8)
--   monedas                 DOP, USD, EUR, etc.             (~18)
--   unidades-medida         BARR, BOL, CAJ, etc.            (~62)
--   indicadores-itbis       0=NoFac, 1=18%, etc.            (5)
--   paises                  DOM, USA, etc.                  (~250)
--   tipos-ingreso           01–06                           (6)
--   tipos-pago              Contado, Credito, Gratuito      (3)
--   provincias              010000 .. 320000                (32)
--   municipios              parent_codigo = provincia       (~156)
--   distritos-municipales   parent_codigo = municipio       (~394)
--   impuestos-adicionales   001, 002, etc.                  (~30)
--   codigos-modificacion    1–5                             (5)
--
-- Para aplicar:
--   psql $POSTGRES_URL -f lib/db/migrations/0019_dgii_catalogos.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dgii_catalogos (
  tipo          VARCHAR(40)  NOT NULL,
  codigo        VARCHAR(20)  NOT NULL,
  nombre        VARCHAR(255) NOT NULL,
  -- Código del padre cuando aplica (municipios.provincia, distritos.municipio).
  -- NULL para los catálogos planos.
  parent_codigo VARCHAR(20),
  -- Campos extra específicos del catálogo: { descripcion, tasa, sigla, simbolo,
  -- codigoIso2, formato, requiereReceptor, requiereAprobacionComercial, ... }.
  metadata      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT dgii_catalogos_pk PRIMARY KEY (tipo, codigo)
);

-- Lookup por padre (municipios de una provincia, distritos de un municipio).
CREATE INDEX IF NOT EXISTS dgii_catalogos_parent_idx
  ON dgii_catalogos (tipo, parent_codigo)
  WHERE parent_codigo IS NOT NULL;

-- Tabla de control para el cron de sync.
CREATE TABLE IF NOT EXISTS dgii_catalogos_sync_log (
  id          SERIAL PRIMARY KEY,
  ejecutado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ok           BOOLEAN     NOT NULL,
  -- { ambientes: 3, tipos_comprobante: 10, ... } o { error: "..." }
  detalle      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  duracion_ms  INTEGER
);
