-- 0237 · Tareas: qué persona del equipo de Zero atiende cada tarea de Soporte.
--
-- Al tomar una tarea (pasa a «en proceso») o al responder, queda aquí quién del
-- equipo de Zero la atiende. El colegio lo lee como «La atiende: …» y el panel
-- /admin/tareas lo usa para el filtro «Mis tareas». El autor de cada mensaje ya
-- se guardaba (`admin_escolar_tarea_mensajes.user_id`); falta solo esto.
--
-- Tabla aparte, sin tocar `admin_escolar_tareas` ni `users`: varias consultas
-- leen esas tablas completas, y una columna nueva sin migrar las tumbaría si el
-- código llega antes que la migración. Con la tabla aparte, el código nuevo sin
-- migrar solo deja de enseñar quién atiende.
--
-- Aditiva e idempotente: se puede correr dos veces y antes del deploy.

CREATE TABLE IF NOT EXISTS admin_escolar_tarea_atiende (
  tarea_id       integer   PRIMARY KEY REFERENCES admin_escolar_tareas(id) ON DELETE CASCADE,
  user_id        integer   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actualizado_en timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_escolar_tarea_atiende_user_idx
  ON admin_escolar_tarea_atiende (user_id);
