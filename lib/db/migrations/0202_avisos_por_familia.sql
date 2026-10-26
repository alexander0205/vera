-- Un mensaje por familia: varios cobros en el mismo aviso.
--
-- Hasta ahora los avisos de cobro salían por cargo × momento × canal. Una familia
-- con tres hijos recibía, el día del vencimiento, tres correos, tres WhatsApp y
-- tres SMS por la misma fecha, cada uno con el mismo enlace de pago. Ahora los
-- cargos de un mismo responsable que caen el mismo día, en el mismo momento y
-- por el mismo canal viajan en UN mensaje.
--
-- La tabla NO cambia de forma: sigue habiendo una fila por cargo, porque el
-- índice único (cargo_id, tipo, offset_dias, canal) —la idempotencia—, la
-- reconciliación de entregas y los paneles del alumno trabajan por cargo.
--
-- Lo único que hace falta es poder decir «estas filas fueron el mismo mensaje»,
-- para contar la cuota mensual y el presupuesto de la corrida por mensajes y no
-- por filas. El WhatsApp ya comparte `mensaje_id`, pero el SMS y el correo no
-- devuelven un id, así que la columna es de todos los canales.
--
-- NULL = el mensaje fue de un solo cobro, que es todo lo anterior: no hay nada
-- que rellenar, y contar `coalesce(grupo, id::text)` da lo mismo que antes.
--
-- Aditiva e idempotente. ORDEN DE DESPLIEGUE: correr esta migración ANTES de
-- publicar el código, que escribe la columna al reservar un aviso.

ALTER TABLE admin_escolar_avisos_enviados
  ADD COLUMN IF NOT EXISTS grupo varchar(40);
