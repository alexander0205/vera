-- 0182 · La cuenta contable de un gasto: configurable y elegible al registrar.
--
-- Hasta ahora la cuenta salía de una tabla fija en el código: cada categoría de
-- compra tenía su código (Materiales → 6114, Honorarios → 6110…) y si la
-- empresa no lo tenía imputable, el gasto caía sin avisar en la cuenta general.
-- Ahora la empresa dice una vez a qué cuenta va cada categoría, y quien registra
-- puede cambiarla en ese comprobante.
--
-- Aditiva e idempotente: se puede correr dos veces.

-- Qué cuenta usa cada categoría de gasto en esta empresa (lib/compras/categorias).
CREATE TABLE IF NOT EXISTS contabilidad_config_gastos (
  id         SERIAL PRIMARY KEY,
  team_id    INTEGER NOT NULL REFERENCES teams(id),
  -- La clave de CATEGORIAS_COMPRA: 'materiales', 'honorarios', 'alquiler'…
  categoria  VARCHAR(30) NOT NULL,
  cuenta_id  INTEGER NOT NULL REFERENCES contabilidad_cuentas(id),
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Una sola cuenta por categoría y empresa.
CREATE UNIQUE INDEX IF NOT EXISTS contabilidad_config_gastos_team_categoria_idx
  ON contabilidad_config_gastos (team_id, categoria);

-- La cuenta elegida en ESTE comprobante, si quien registró cambió la de la
-- categoría. NULL = la de la configuración o la del código de la categoría.
ALTER TABLE compras_locales_items
  ADD COLUMN IF NOT EXISTS cuenta_id INTEGER REFERENCES contabilidad_cuentas(id);
