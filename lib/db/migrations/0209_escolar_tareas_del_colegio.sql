-- 0209 · Tareas del colegio, sin alumno ni familia.
--
-- Hasta ahora una tarea era de un alumno (`estudiante_id`) o de su familia
-- (`client_id`), y el CHECK `admin_escolar_tareas_de_alguien` lo obligaba. Lo
-- que el colegio tiene que resolver no siempre es de una familia: «llamar al
-- proveedor de uniformes», «revisar la nómina de octubre». Esas se crean desde
-- «Por revisar» con los dos en NULL y salen en el grupo «Del colegio».
--
-- Solo quita una restricción: el código de antes nunca escribe una tarea sin
-- alumno ni familia, así que se puede correr antes del deploy. Idempotente.

ALTER TABLE admin_escolar_tareas DROP CONSTRAINT IF EXISTS admin_escolar_tareas_de_alguien;
