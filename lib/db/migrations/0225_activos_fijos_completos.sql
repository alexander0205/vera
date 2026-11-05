-- 0225 · Activos fijos completos: cantidad, ubicación, categoría con sus cuentas,
-- baja de unidades con su asiento y ficha creada desde una compra.
--
-- Hasta ahora un activo era una línea (nombre, costo, vida útil) y las cuentas
-- eran las mismas para todos (1201 / 1202 / 6103). Lo que pidió el contable:
--   · varias unidades en una ficha (30 butacas) y poder dar de baja UNA;
--   · dónde está cada bien (aula, oficina);
--   · una categoría (terrenos, edificios, mobiliario, transporte, cómputo) que
--     decide su cuenta de activo y su depreciación acumulada;
--   · que una compra con categoría «activo fijo» abra la ficha sola.
--
-- Las columnas nuevas son todas opcionales o con valor por defecto: los activos
-- que ya existen quedan como estaban (1 unidad, sin categoría, cuentas globales).
-- `costo_cents` y `vida_util_meses` siguen siendo los ORIGINALES de todas las
-- unidades; lo dado de baja se anota aparte en `contabilidad_activos_bajas`.
--
-- Aditiva e idempotente: se puede correr dos veces.

ALTER TABLE contabilidad_activos_fijos
  ADD COLUMN IF NOT EXISTS cantidad integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ubicacion varchar(160),
  ADD COLUMN IF NOT EXISTS categoria varchar(20),
  -- Cuentas propias de la ficha (de su categoría). NULL = las globales de la configuración.
  ADD COLUMN IF NOT EXISTS cuenta_activo_id integer REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_deprec_acum_id integer REFERENCES contabilidad_cuentas(id),
  ADD COLUMN IF NOT EXISTS cuenta_gasto_deprec_id integer REFERENCES contabilidad_cuentas(id),
  -- Ficha abierta desde una compra: falta confirmar categoría y vida útil. No deprecia hasta entonces.
  ADD COLUMN IF NOT EXISTS en_revision boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compra_id integer REFERENCES compras_locales(id),
  ADD COLUMN IF NOT EXISTS compra_linea integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contabilidad_activos_fijos_cantidad_chk') THEN
    ALTER TABLE contabilidad_activos_fijos
      ADD CONSTRAINT contabilidad_activos_fijos_cantidad_chk CHECK (cantidad >= 1);
  END IF;
END $$;

-- Una línea de compra abre una sola ficha, aunque se reintente.
CREATE UNIQUE INDEX IF NOT EXISTS contabilidad_activos_fijos_compra_uniq
  ON contabilidad_activos_fijos (team_id, compra_id, compra_linea)
  WHERE compra_id IS NOT NULL;

-- Bajas (totales o de unas pocas unidades). Cada una con su asiento.
CREATE TABLE IF NOT EXISTS contabilidad_activos_bajas (
  id                    serial PRIMARY KEY,
  team_id               integer NOT NULL REFERENCES teams(id),
  activo_id             integer NOT NULL REFERENCES contabilidad_activos_fijos(id),
  fecha                 date NOT NULL,
  unidades              integer NOT NULL,
  -- Lo que esas unidades se llevan del costo y de la depreciación acumulada.
  costo_baja_cents      bigint NOT NULL,
  deprec_baja_cents     bigint NOT NULL DEFAULT 0,
  -- Lo cobrado si se vendió (0 si se desechó o se perdió). Positivo = ganancia en `resultado_cents`.
  precio_venta_cents    bigint NOT NULL DEFAULT 0,
  resultado_cents       bigint NOT NULL DEFAULT 0,
  motivo                varchar(300),
  asiento_id            integer REFERENCES contabilidad_asientos(id),
  created_by            integer REFERENCES users(id),
  created_at            timestamp NOT NULL DEFAULT now(),
  CONSTRAINT contabilidad_activos_bajas_unidades_chk CHECK (unidades >= 1),
  CONSTRAINT contabilidad_activos_bajas_montos_chk CHECK (costo_baja_cents >= 0 AND deprec_baja_cents >= 0 AND precio_venta_cents >= 0)
);
CREATE INDEX IF NOT EXISTS contabilidad_activos_bajas_activo_idx ON contabilidad_activos_bajas (team_id, activo_id);
