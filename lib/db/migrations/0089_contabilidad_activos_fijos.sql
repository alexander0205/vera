-- Nivel 4.2 — Activos fijos y depreciación lineal automática.
--
-- Módulo nuevo, greenfield: dos tablas propias del motor contable más la
-- ampliación del CHECK de origen para el asiento mensual de depreciación. No
-- toca ninguna tabla de origen ajena (regla de no contaminar entidades
-- genéricas): el activo fijo ES del dominio contable.

-- 1. Inventario de activos fijos. Costo, valor residual y vida útil en meses;
--    el método es lineal (cuota = (costo − residual) / vida_util_meses).
CREATE TABLE IF NOT EXISTS contabilidad_activos_fijos (
  id                  serial PRIMARY KEY,
  team_id             integer NOT NULL REFERENCES teams(id),
  nombre              varchar(160) NOT NULL,
  costo_cents         bigint NOT NULL,
  -- Piso de la depreciación: nunca se deprecia por debajo de esto.
  valor_residual_cents bigint NOT NULL DEFAULT 0,
  vida_util_meses     integer NOT NULL,
  fecha_adquisicion   date NOT NULL,
  -- Baja lógica: un activo dado de baja deja de generar cuotas, pero su historia
  -- de depreciación y sus asientos se quedan.
  activa              boolean NOT NULL DEFAULT true,
  created_by          integer REFERENCES users(id),
  created_at          timestamp NOT NULL DEFAULT now(),
  CONSTRAINT contabilidad_activos_fijos_costo_chk    CHECK (costo_cents > 0),
  CONSTRAINT contabilidad_activos_fijos_residual_chk CHECK (valor_residual_cents >= 0 AND valor_residual_cents < costo_cents),
  CONSTRAINT contabilidad_activos_fijos_vida_chk     CHECK (vida_util_meses > 0)
);

CREATE INDEX IF NOT EXISTS contabilidad_activos_fijos_team_idx
  ON contabilidad_activos_fijos (team_id, activa);

-- 2. Cuotas de depreciación ya generadas. El UNIQUE (team, activo, periodo) es
--    la idempotencia mensual: un activo no se deprecia dos veces el mismo mes,
--    aunque el barrido corra varias veces. `periodo` = primer día del mes.
CREATE TABLE IF NOT EXISTS contabilidad_depreciaciones (
  id          serial PRIMARY KEY,
  team_id     integer NOT NULL REFERENCES teams(id),
  activo_id   integer NOT NULL REFERENCES contabilidad_activos_fijos(id),
  periodo     date NOT NULL,
  monto_cents bigint NOT NULL,
  -- El asiento que registró esta cuota. Nullable por si algún día se separa la
  -- fila de su asiento; hoy siempre va lleno.
  asiento_id  integer REFERENCES contabilidad_asientos(id),
  created_at  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT contabilidad_depreciaciones_periodo_uq UNIQUE (team_id, activo_id, periodo)
);

CREATE INDEX IF NOT EXISTS contabilidad_depreciaciones_activo_idx
  ON contabilidad_depreciaciones (team_id, activo_id);

-- 3. Ampliar el CHECK de origen para admitir 'depreciacion'. Los valores
--    anteriores siguen igual (mismo patrón de la 0088).
ALTER TABLE contabilidad_asientos
  DROP CONSTRAINT contabilidad_asientos_origen_chk;
ALTER TABLE contabilidad_asientos
  ADD CONSTRAINT contabilidad_asientos_origen_chk
    CHECK (origen_tipo IN ('factura', 'pago', 'nota', 'anulacion', 'manual', 'compra', 'gasto_caja', 'depreciacion'));

-- 4. Cuentas destino de la depreciación en la config del team. Nullables: el
--    generador cae a los códigos base estándar (1201 / 1202 / 6103) si están en
--    NULL, así que funciona sin configurar y se puede personalizar.
ALTER TABLE contabilidad_config
  ADD COLUMN IF NOT EXISTS cuenta_activo_fijo_id   integer REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_deprec_acum_id   integer REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_gasto_deprec_id  integer REFERENCES contabilidad_cuentas(id);

-- Backfill de los teams que ya tienen config: apuntar a las cuentas base
-- estándar si existen. No sobrescribe lo que el usuario ya hubiera fijado.
UPDATE contabilidad_config c SET
  cuenta_activo_fijo_id = COALESCE(c.cuenta_activo_fijo_id,
    (SELECT id FROM contabilidad_cuentas WHERE team_id = c.team_id AND codigo = '1201' AND imputable AND activa)),
  cuenta_deprec_acum_id = COALESCE(c.cuenta_deprec_acum_id,
    (SELECT id FROM contabilidad_cuentas WHERE team_id = c.team_id AND codigo = '1202' AND imputable AND activa)),
  cuenta_gasto_deprec_id = COALESCE(c.cuenta_gasto_deprec_id,
    (SELECT id FROM contabilidad_cuentas WHERE team_id = c.team_id AND codigo = '6103' AND imputable AND activa));
