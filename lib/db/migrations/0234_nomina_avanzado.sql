-- 0234 · Valores «Avanzado» de la nómina, por empresa.
--
-- Los pocos números de la nómina que pueden variar por empresa o que el contable
-- puede querer ajustar (divisor del salario diario, cómo se descuentan las faltas,
-- tope exento de la regalía, base de la regalía, días de vacaciones y de cesantía).
-- Un solo jsonb por empresa: el código lo valida con rangos y completa lo que falte
-- con el valor de ley. Sin fila, o sin esta tabla, todo se calcula como siempre.
--
-- NO guarda tasas de la TSS ni la escala del ISR: esas son de ley y viven en el código.
--
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS nomina_avanzado (
  team_id     INTEGER PRIMARY KEY REFERENCES teams(id),
  valores     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
