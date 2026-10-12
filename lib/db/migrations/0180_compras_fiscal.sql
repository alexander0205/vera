-- Compras y gastos · comprobante del proveedor, Formato 606 y retenciones.
--
-- Hasta aquí una «compra registrada» era solo una entrada de inventario: sin NCF
-- del proveedor, sin tipo de bienes del 606, sin retenciones y sin servicios.
-- Ahora el registro es el comprobante completo, del que salen la línea del 606,
-- el ITBIS que se adelanta, las retenciones por pagar a la DGII y el asiento.
-- Las líneas pueden ser productos del inventario o conceptos de gasto.
--
-- Aditiva e idempotente: se corre a mano con psql. Las compras viejas quedan
-- como estaban (clase 'compra', registrada, sin retenciones).

ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS clase                 VARCHAR(10) NOT NULL DEFAULT 'compra';
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS tipo_proveedor        VARCHAR(10);
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS ncf_modificado        VARCHAR(19);
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS tipo_bienes_606       VARCHAR(2);
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS monto_servicios_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS monto_bienes_cents    BIGINT NOT NULL DEFAULT 0;
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS itbis_al_costo_cents  BIGINT NOT NULL DEFAULT 0;
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS itbis_retenido_cents  BIGINT NOT NULL DEFAULT 0;
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS isr_tipo_retencion    SMALLINT;
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS isr_retenido_cents    BIGINT NOT NULL DEFAULT 0;
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS isc_cents             BIGINT NOT NULL DEFAULT 0;
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS otros_impuestos_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS propina_cents         BIGINT NOT NULL DEFAULT 0;
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS fecha_pago            DATE;
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS estado                VARCHAR(12) NOT NULL DEFAULT 'registrada';
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS anulada_en            TIMESTAMP;
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS anulada_por           INTEGER REFERENCES users(id);
ALTER TABLE compras_locales ADD COLUMN IF NOT EXISTS motivo_anulacion      VARCHAR(300);

DO $$ BEGIN
  ALTER TABLE compras_locales ADD CONSTRAINT compras_locales_clase_chk CHECK (clase IN ('compra', 'gasto'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE compras_locales ADD CONSTRAINT compras_locales_estado_chk CHECK (estado IN ('registrada', 'anulada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Montos en centavos: con INTEGER una factura de más de RD$21.4 millones no cabía.
ALTER TABLE compras_locales    ALTER COLUMN monto_total TYPE BIGINT;
ALTER TABLE compras_locales    ALTER COLUMN itbis_cents TYPE BIGINT;
ALTER TABLE pagos_proveedores  ALTER COLUMN monto_cents TYPE BIGINT;

-- El NCF repetido se revisa en la aplicación y no con un índice único: puede
-- haber entradas parciales viejas del mismo e-CF que un índice rechazaría.
CREATE INDEX IF NOT EXISTS compras_locales_ncf_idx ON compras_locales (team_id, referencia_encf);
CREATE INDEX IF NOT EXISTS compras_locales_team_fecha_idx ON compras_locales (team_id, fecha);

-- Líneas: productos del inventario o conceptos de gasto.
ALTER TABLE compras_locales_items ALTER COLUMN producto_id DROP NOT NULL;
ALTER TABLE compras_locales_items ADD COLUMN IF NOT EXISTS descripcion VARCHAR(255);
ALTER TABLE compras_locales_items ADD COLUMN IF NOT EXISTS categoria   VARCHAR(30);
ALTER TABLE compras_locales_items ADD COLUMN IF NOT EXISTS es_servicio BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE compras_locales_items ADD COLUMN IF NOT EXISTS itbis_tasa  VARCHAR(6) NOT NULL DEFAULT '0';
ALTER TABLE compras_locales_items ADD COLUMN IF NOT EXISTS itbis_cents BIGINT NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE compras_locales_items ADD CONSTRAINT compras_locales_items_linea_chk
    CHECK (producto_id IS NOT NULL OR descripcion IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Asientos: el reverso de una compra anulada.
ALTER TABLE contabilidad_asientos DROP CONSTRAINT IF EXISTS contabilidad_asientos_origen_chk;
ALTER TABLE contabilidad_asientos
  ADD CONSTRAINT contabilidad_asientos_origen_chk
    CHECK (origen_tipo IN ('factura', 'pago', 'nota', 'anulacion', 'manual', 'compra', 'gasto_caja',
                           'gasto_doc', 'depreciacion', 'pago_proveedor', 'cierre',
                           'nomina', 'pago_nomina', 'provision_nomina', 'pago_sueldos',
                           'compra_anulada'));
