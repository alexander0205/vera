-- 0210 · Avisar a las familias al crear un cobro a un grupo.
--
-- «Cobrar a un grupo» (el día de cine, la excursión) crea cargos hechos a mano,
-- sin calendario. Los avisos de cobro solo salían colgados del vencimiento, así
-- que la familia se enteraba días después —o el mismo día que vencía—. Ahora,
-- si quien cobra lo pide, cada cargo lleva el día en que sale su aviso de
-- «cobro nuevo», y el cron de avisos lo manda ese día con la plantilla de
-- WhatsApp «al emitir» (respaldo por SMS) y por correo.
--
-- Aditiva: una columna nullable. NULL = no se pidió avisar.

ALTER TABLE admin_escolar_cargos
  ADD COLUMN IF NOT EXISTS aviso_al_crear date;

-- El cron busca los de hoy en todo el sistema: sin índice recorrería todos los cargos.
CREATE INDEX IF NOT EXISTS admin_escolar_cargos_aviso_al_crear_idx
  ON admin_escolar_cargos (aviso_al_crear)
  WHERE aviso_al_crear IS NOT NULL;
