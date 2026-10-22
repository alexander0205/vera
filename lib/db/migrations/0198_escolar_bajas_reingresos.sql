-- 0197 · Historial de bajas y reingresos de cada alumno.
--
-- Los alumnos se van del colegio y a veces vuelven. Cada vez que pasa, el
-- sistema toca cosas que importan para el dinero: cierra la matrícula, pausa la
-- mensualidad automática, anula cuotas futuras y, al volver, mueve la fecha de
-- inscripción y el inicio de la mensualidad para no cobrar los meses fuera.
--
-- Todo eso vivía como texto en las notas de la matrícula, y así no sirve:
--   · no se puede preguntar «quién se retiró en octubre» ni «cuántos volvieron»;
--   · las notas se editan a mano, y borrar la línea de las cuotas anuladas
--     dejaba al reingreso sin saber cuáles devolver;
--   · no quedaba quién lo hizo, ni las fechas de antes en un campo que se pueda
--     leer.
--
-- Una fila por baja o reingreso. No se edita ni se borra: es la constancia.
--
-- Aditiva e idempotente: se puede correr dos veces.

CREATE TABLE IF NOT EXISTS admin_escolar_estudiante_movimientos (
  id                          serial PRIMARY KEY,
  team_id                     integer     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  estudiante_id               integer     NOT NULL REFERENCES admin_escolar_estudiantes(id) ON DELETE CASCADE,
  -- La matrícula que se cerró o se reabrió. NULL si no tenía ninguna activa.
  matricula_id                integer     REFERENCES admin_escolar_matriculas(id) ON DELETE SET NULL,
  -- baja | reingreso
  tipo                        varchar(12) NOT NULL CHECK (tipo IN ('baja', 'reingreso')),
  estado_anterior             varchar(20),
  estado_nuevo                varchar(20) NOT NULL,
  -- El día en que se fue o volvió, no el día en que se registró (ese es creado_en).
  fecha                       date        NOT NULL,
  motivo                      varchar(200),
  -- Ids de admin_escolar_cargos. Los que anuló la baja y los que el reingreso
  -- devolvió: el reingreso solo devuelve los que anuló la ÚLTIMA baja.
  cuotas_anuladas             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  cuotas_restauradas          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- Lo que el reingreso sobrescribió, para poder saber cómo estaba.
  fecha_inscripcion_anterior  date,
  recurrente_id               integer     REFERENCES facturas_recurrentes(id) ON DELETE SET NULL,
  recurrente_inicio_anterior  date,
  recurrente_inicio_nuevo     date,
  user_id                     integer     REFERENCES users(id),
  creado_en                   timestamp   NOT NULL DEFAULT now()
);

-- La ficha del alumno: sus movimientos, el último primero.
CREATE INDEX IF NOT EXISTS admin_escolar_est_mov_estudiante_idx
  ON admin_escolar_estudiante_movimientos (team_id, estudiante_id, creado_en DESC);
-- Los reportes: bajas o reingresos de un colegio en un rango de fechas.
CREATE INDEX IF NOT EXISTS admin_escolar_est_mov_tipo_fecha_idx
  ON admin_escolar_estudiante_movimientos (team_id, tipo, fecha);
