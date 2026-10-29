-- 0211 · Lo que se va decidiendo en «Matricular desde SIGERD», guardado solo.
--
-- La pantalla del lote junta muchas decisiones antes de «Matricular»: a quién
-- se le quita un concepto, qué precio lleva, quién no entra ahora, la fecha
-- de inscripción. Todo vivía en la memoria del navegador: recargar, cambiar
-- de pantalla o abrirlo en otra computadora lo perdía (pedido de Alex en el
-- standup del 29-oct-2026: «que guarde como Word»).
--
-- Un borrador por colegio, año escolar y pantalla (`clave`), compartido por
-- quien la abra. `datos` es lo que la pantalla necesita para volver a donde
-- estaba; se borra al terminar de matricular.
--
-- 0210 la usa la rama de nómina (aviso al crear). Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS admin_escolar_borradores (
  id          serial PRIMARY KEY,
  team_id     integer     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  periodo_id  integer     NOT NULL REFERENCES admin_escolar_periodos(id) ON DELETE CASCADE,
  clave       varchar(40) NOT NULL,
  datos       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_by  integer     REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamp   NOT NULL DEFAULT now(),
  updated_at  timestamp   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_borradores_clave_idx
  ON admin_escolar_borradores (team_id, periodo_id, clave);
