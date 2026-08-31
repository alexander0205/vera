-- Videollamada con pantalla compartida — ver
-- docs/superpowers/specs/2026-08-20-videollamada-soporte-design.md
--
-- Un solo par de tablas: el estado de la llamada (ticket_calls) y las
-- señales SDP del handshake (ticket_call_signals). Van separadas de
-- ticket_messages a propósito: son ruido técnico, no conversación.

CREATE TABLE IF NOT EXISTS ticket_calls (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMP,
  ended_at TIMESTAMP,
  ended_reason VARCHAR(20)
);

-- Índice parcial: solo una llamada pendiente/activa por ticket a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_calls_activa_uniq
  ON ticket_calls (ticket_id)
  WHERE status IN ('pendiente', 'activa');

CREATE TABLE IF NOT EXISTS ticket_call_signals (
  id SERIAL PRIMARY KEY,
  call_id INTEGER NOT NULL REFERENCES ticket_calls(id) ON DELETE CASCADE,
  from_role VARCHAR(10) NOT NULL,
  kind VARCHAR(10) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_call_signals_call_idx
  ON ticket_call_signals (call_id, created_at);
