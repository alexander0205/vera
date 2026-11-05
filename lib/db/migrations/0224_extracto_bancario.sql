-- 0224 · Estado de cuenta del banco importado y depósitos sin identificar.
--
-- Conciliar de verdad es comparar el libro contra el estado de cuenta, línea por
-- línea. Hasta ahora solo se podía marcar a mano lo que se veía en el extracto
-- (0220). Esto guarda el extracto que se sube (CSV o Excel) para emparejarlo con
-- los asientos por monto, fecha y referencia, y para atender lo que no empareja:
-- sobre todo los depósitos que llegan sin concepto y hay que identificar después.
--
--   contabilidad_extractos          cada archivo subido (quién, cuándo, cuántas líneas)
--   contabilidad_extracto_lineas    cada movimiento del banco, con su estado:
--       pendiente   sin emparejar todavía
--       emparejada  igual a un apunte del libro (linea_id)
--       registrando / asignando   un instante mientras se asienta (candado)
--       registrada  depósito sin identificar ya asentado contra «Depósitos por identificar» (2115)
--       asignada    depósito identificado: pasó de 2115 al saldo a favor del cliente (2104)
--       ignorada    la persona decidió dejarla fuera
--
-- `monto_cents` va CON SIGNO desde el banco de la empresa: + entró, − salió.
-- `huella` impide importar dos veces la misma línea al subir tramos que se traslapan.
--
-- No cambia ningún asiento ni saldo existente. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS contabilidad_extractos (
  id             SERIAL PRIMARY KEY,
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  cuenta_id      INTEGER NOT NULL REFERENCES contabilidad_cuentas(id),
  archivo_nombre VARCHAR(255),
  desde          DATE,
  hasta          DATE,
  filas          INTEGER NOT NULL DEFAULT 0,
  nuevas         INTEGER NOT NULL DEFAULT 0,
  importado_por  INTEGER REFERENCES users(id),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contabilidad_extractos_team_cuenta_idx ON contabilidad_extractos (team_id, cuenta_id);

CREATE TABLE IF NOT EXISTS contabilidad_extracto_lineas (
  id               SERIAL PRIMARY KEY,
  team_id          INTEGER NOT NULL REFERENCES teams(id),
  extracto_id      INTEGER NOT NULL REFERENCES contabilidad_extractos(id) ON DELETE CASCADE,
  cuenta_id        INTEGER NOT NULL REFERENCES contabilidad_cuentas(id),
  fecha            DATE NOT NULL,
  descripcion      VARCHAR(300),
  referencia       VARCHAR(120),
  monto_cents      BIGINT NOT NULL,
  saldo_cents      BIGINT,
  huella           VARCHAR(64) NOT NULL,
  estado           VARCHAR(12) NOT NULL DEFAULT 'pendiente',
  -- El apunte del libro (línea de asiento de la cuenta de banco) con el que se emparejó.
  linea_id         INTEGER REFERENCES contabilidad_asiento_lineas(id),
  metodo_emparejado VARCHAR(12),
  -- El apunte ya tenía una marca de conciliación hecha a mano (0220) cuando se emparejó: al desemparejar se queda con ella.
  marca_previa     BOOLEAN NOT NULL DEFAULT false,
  -- Depósito sin identificar: el asiento que lo registró y el que lo asignó.
  asiento_id       INTEGER REFERENCES contabilidad_asientos(id),
  asiento_asignacion_id INTEGER REFERENCES contabilidad_asientos(id),
  cliente_id       INTEGER REFERENCES clients(id),
  cargo_referencia VARCHAR(120),
  nota             VARCHAR(300),
  resuelta_por     INTEGER REFERENCES users(id),
  resuelta_at      TIMESTAMP,
  CONSTRAINT contabilidad_extracto_lineas_monto_chk CHECK (monto_cents <> 0),
  CONSTRAINT contabilidad_extracto_lineas_estado_chk
    CHECK (estado IN ('pendiente', 'emparejada', 'registrando', 'registrada', 'asignando', 'asignada', 'ignorada'))
);
CREATE UNIQUE INDEX IF NOT EXISTS contabilidad_extracto_lineas_huella_uniq ON contabilidad_extracto_lineas (team_id, huella);
CREATE INDEX IF NOT EXISTS contabilidad_extracto_lineas_estado_idx ON contabilidad_extracto_lineas (team_id, cuenta_id, estado, fecha);
-- Un apunte del libro se empareja con UNA sola línea del banco: la base lo impide aunque dos emparejados corran a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS contabilidad_extracto_lineas_linea_uniq ON contabilidad_extracto_lineas (linea_id) WHERE linea_id IS NOT NULL;
