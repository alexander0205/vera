-- Nivel 4 (extra) — Cierre de ejercicio (cierre anual).
--
-- Al terminar el año fiscal, un asiento de cierre lleva los saldos de las
-- cuentas de resultado (ingresos 4 / costos 5 / gastos 6) a 3102 Resultados
-- acumulados y las deja en cero. La tabla registra cada cierre; el UNIQUE
-- (team, ejercicio) impide cerrar dos veces el mismo año y es la idempotencia.

CREATE TABLE IF NOT EXISTS contabilidad_cierres (
  id              serial PRIMARY KEY,
  team_id         integer NOT NULL REFERENCES teams(id),
  -- El año que se cierra (p. ej. 2025). El cierre estándar en RD es al 31-dic.
  ejercicio       integer NOT NULL,
  fecha_cierre    date NOT NULL,
  -- Resultado del ejercicio: utilidad (+) o pérdida (−), en centavos.
  resultado_cents bigint NOT NULL,
  asiento_id      integer REFERENCES contabilidad_asientos(id),
  created_by      integer REFERENCES users(id),
  created_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT contabilidad_cierres_ejercicio_uq UNIQUE (team_id, ejercicio)
);

-- Ampliar el CHECK de origen para admitir 'cierre' (patrón de 0088/0089/0091).
ALTER TABLE contabilidad_asientos
  DROP CONSTRAINT contabilidad_asientos_origen_chk;
ALTER TABLE contabilidad_asientos
  ADD CONSTRAINT contabilidad_asientos_origen_chk
    CHECK (origen_tipo IN ('factura', 'pago', 'nota', 'anulacion', 'manual',
                           'compra', 'gasto_caja', 'depreciacion', 'pago_proveedor', 'cierre'));
