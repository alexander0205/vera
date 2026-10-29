-- 0211 · Migración de un colegio en «Matricular desde SIGERD»: el borrador que
-- se guarda solo y el trabajo que completa las familias desde SIGERD.
--
-- 1 · Lo que se va decidiendo en la pantalla, guardado solo.
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

-- 2 · Trabajos largos que siguen aunque se cierre la pantalla.
--
-- «Completar familias desde SIGERD» recorre a los alumnos uno por uno (una o
-- dos peticiones al portal por alumno) y les trae fecha de nacimiento, sexo y
-- padres. Con un colegio de cientos de alumnos no cabe en una petición: el
-- servidor avanza una tanda al empezar y el cron sigue cada pocos minutos
-- desde `cursor_id` hasta terminar. `ocupado_hasta` es el candado: dos
-- pasadas a la vez no procesan al mismo alumno.
--
-- Uno activo (pendiente o corriendo) por colegio y tipo.

CREATE TABLE IF NOT EXISTS admin_escolar_trabajos (
  id            serial PRIMARY KEY,
  team_id       integer     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  tipo          varchar(40) NOT NULL,
  -- pendiente | corriendo | hecho | fallo | cancelado
  estado        varchar(16) NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'corriendo', 'hecho', 'fallo', 'cancelado')),
  total         integer     NOT NULL DEFAULT 0,
  hechos        integer     NOT NULL DEFAULT 0,
  -- Lo que salió de cada alumno: con qué se completó y qué no se pudo.
  resumen       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  cursor_id     integer     NOT NULL DEFAULT 0,
  ultimo_error  text,
  ocupado_hasta timestamp,
  creado_por    integer     REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamp   NOT NULL DEFAULT now(),
  updated_at    timestamp   NOT NULL DEFAULT now(),
  terminado_at  timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_escolar_trabajos_activo_idx
  ON admin_escolar_trabajos (team_id, tipo) WHERE estado IN ('pendiente', 'corriendo');
CREATE INDEX IF NOT EXISTS admin_escolar_trabajos_pendientes_idx
  ON admin_escolar_trabajos (estado) WHERE estado IN ('pendiente', 'corriendo');
