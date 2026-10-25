-- 0199 · Ajustes de la plataforma (no de una empresa).
--
-- Lo que decide el administrador de Zero para todos: hoy, qué modelo de IA usa
-- cada parte (clave `ia.modelos`, ver lib/ia/modelos.ts). Una fila por clave.
-- Sin filas todo sigue con los valores de fábrica, así que aplicar esto no
-- cambia nada.
--
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS plataforma_ajustes (
  clave           VARCHAR(80) PRIMARY KEY,
  valor           JSONB NOT NULL,
  actualizado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actualizado_en  TIMESTAMP NOT NULL DEFAULT now()
);
