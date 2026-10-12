-- Pago por separado de la nómina: empleados (neto) y obligaciones al Estado.
-- Aditiva.

-- 1) Estado de pago por empleado (línea de la corrida). Pago parcial: se marca
--    empleado por empleado; lo no pagado queda pendiente.
ALTER TABLE nomina_lineas
  ADD COLUMN IF NOT EXISTS pagada     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pagada_en  timestamp;

-- 2) Obligaciones al Estado que nacen de una corrida aprobada. Se pagan aparte
--    y después; quedan pendientes hasta saldarse. Un destino por corrida:
--    'TSS' (AFP+SFS+SRL+INFOTEP) y 'DGII' (ISR retenido).
CREATE TABLE IF NOT EXISTS nomina_obligaciones (
  id                       serial PRIMARY KEY,
  team_id                  integer NOT NULL REFERENCES teams(id),
  corrida_id               integer NOT NULL REFERENCES nomina_corridas(id) ON DELETE CASCADE,
  destino                  varchar(10) NOT NULL,               -- 'TSS' | 'DGII'
  monto_cents              bigint  NOT NULL,
  -- Desglose para el asiento de pago (saldar el pasivo correcto):
  parte_retenciones_cents  bigint  NOT NULL DEFAULT 0,         -- del empleado (AFP/SFS emp, o ISR)
  parte_aportes_cents      bigint  NOT NULL DEFAULT 0,         -- patronales (AFP/SFS pat, SRL, INFOTEP)
  pagada                   boolean NOT NULL DEFAULT false,
  pagada_en                timestamp,
  asiento_id               integer REFERENCES contabilidad_asientos(id),
  created_at               timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS nomina_obligaciones_corrida_destino_uniq
  ON nomina_obligaciones(corrida_id, destino);
CREATE INDEX IF NOT EXISTS nomina_obligaciones_team_idx
  ON nomina_obligaciones(team_id);

-- 3) El asiento de pago de una obligación de nómina es un origen contable nuevo.
ALTER TABLE contabilidad_asientos
  DROP CONSTRAINT IF EXISTS contabilidad_asientos_origen_chk;
ALTER TABLE contabilidad_asientos
  ADD CONSTRAINT contabilidad_asientos_origen_chk
  CHECK (origen_tipo IN ('factura','pago','nota','anulacion','manual','compra','gasto_caja','depreciacion','gasto_doc','nomina','pago_nomina'));
