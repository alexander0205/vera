-- 0191 · Solicitudes de pago a proveedores con aprobación.
--
-- Quien arma la lista de pagos (secretaria) no mueve dinero: pide el pago, el
-- dueño lo aprueba mirando lo disponible y después se registra el pago de siempre.
-- Estados: solicitado → aprobado → pagado  (o rechazado / cancelado; 'pagando' es
-- el instante en que se está registrando el pago).
--
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS pagos_solicitudes (
  id               SERIAL PRIMARY KEY,
  team_id          INTEGER NOT NULL REFERENCES teams(id),
  compra_id        INTEGER NOT NULL REFERENCES compras_locales(id),
  monto_cents      BIGINT  NOT NULL CHECK (monto_cents > 0),
  metodo           VARCHAR(30) NOT NULL,
  cuenta_salida_id INTEGER REFERENCES contabilidad_cuentas(id),
  nota             VARCHAR(300),
  estado           VARCHAR(12) NOT NULL DEFAULT 'solicitado',
  solicitada_por   INTEGER REFERENCES users(id),
  solicitada_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  resuelta_por     INTEGER REFERENCES users(id),
  resuelta_at      TIMESTAMP,
  motivo           VARCHAR(300),
  pago_id          INTEGER REFERENCES pagos_proveedores(id),
  CONSTRAINT pagos_solicitudes_estado_chk CHECK (estado IN ('solicitado', 'aprobado', 'rechazado', 'cancelado', 'pagando', 'pagado'))
);
CREATE INDEX IF NOT EXISTS pagos_solicitudes_team_estado_idx ON pagos_solicitudes (team_id, estado, solicitada_at);
CREATE INDEX IF NOT EXISTS pagos_solicitudes_compra_idx ON pagos_solicitudes (compra_id);
