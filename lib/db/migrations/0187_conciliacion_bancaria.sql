-- 0187 · Conciliación bancaria: qué apuntes de una cuenta de banco ya salieron
-- en el estado de cuenta.
--
-- Un apunte conciliado es uno que la persona marcó como visto en el extracto del
-- banco. No cambia el asiento ni el saldo del libro: es una marca aparte, así
-- que se puede quitar sin tocar la contabilidad. Una marca por apunte.
--
-- Aditiva e idempotente: se puede correr dos veces.

CREATE TABLE IF NOT EXISTS contabilidad_conciliaciones (
  id            SERIAL PRIMARY KEY,
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  linea_id      INTEGER NOT NULL REFERENCES contabilidad_asiento_lineas(id),
  cuenta_id     INTEGER NOT NULL REFERENCES contabilidad_cuentas(id),
  /** Texto libre: número de línea del extracto, referencia, etc. */
  referencia    VARCHAR(120),
  conciliado_por INTEGER REFERENCES users(id),
  conciliado_en TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS contabilidad_conciliaciones_linea_uniq ON contabilidad_conciliaciones (linea_id);
CREATE INDEX IF NOT EXISTS contabilidad_conciliaciones_cuenta_idx ON contabilidad_conciliaciones (team_id, cuenta_id);
