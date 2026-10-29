-- 0212 · Tareas: cierre automático de las que quedan en revisión y aviso urgente
-- de las que se quedan paradas.
--
-- Pedido del 29-10: cuando Soporte deja una tarea «en revisión» para que el
-- colegio la revise, si en 24 horas nadie responde se cierra sola. Y cualquier
-- tarea pendiente que pase 24 horas sin movimiento manda un correo URGENTE a
-- quien le toca contestar (el colegio o Soporte). Lo hace el cron
-- `/api/cron/escolar-tareas`, cada hora de día.
--
--   · `revision_vence_en`  cuándo se cierra sola. Lo pone la plantilla
--                          «En revisión» de Soporte; lo borra cualquier cambio
--                          de estado o una respuesta del colegio.
--   · `urgente_enviado_en` cuándo salió el último correo urgente: uno por cada
--                          vez que la tarea se queda parada, no uno por hora.
--
-- Solo agrega columnas que el código de antes no lee. Idempotente.

ALTER TABLE admin_escolar_tareas ADD COLUMN IF NOT EXISTS revision_vence_en timestamp;
ALTER TABLE admin_escolar_tareas ADD COLUMN IF NOT EXISTS urgente_enviado_en timestamp;
CREATE INDEX IF NOT EXISTS admin_escolar_tareas_revision_vence_idx
  ON admin_escolar_tareas (revision_vence_en) WHERE revision_vence_en IS NOT NULL;
