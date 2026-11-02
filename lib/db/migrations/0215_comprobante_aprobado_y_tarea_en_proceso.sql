-- 0215 · Lo que confirmó el colegio de un comprobante, y el estado «En proceso».
--
-- 1. El comprobante guardaba solo lo que la familia DECLARÓ. Quien aprueba puede
--    corregir el monto mirando el papel del banco, y el cobro entraba bien, pero
--    el recuadro verde del padre seguía enseñando lo declarado: «Pago confirmado
--    · RD$6,000» sobre una transferencia de RD$3,000 (tarea 9 de Mi Casita).
--    Los ya aprobados toman su monto de los pagos que crearon. Sin pago asociado
--    queda NULL, y la pantalla enseña lo declarado, como hasta hoy.
--
-- 2. Una tarea puede quedar «en_proceso»: alguien la tomó y la está trabajando.
--    «En revisión» sigue siendo que ya se hizo y falta que la confirmen.
--
-- Solo agrega: el código de antes no lee la columna ni escribe el estado nuevo.
-- Se corre ANTES de desplegar, porque el código nuevo sí lee la columna.

ALTER TABLE admin_escolar_comprobantes
  ADD COLUMN IF NOT EXISTS monto_aprobado_centavos integer;

UPDATE admin_escolar_comprobantes c
   SET monto_aprobado_centavos = p.total
  FROM (
    SELECT team_id, notas, sum(monto_centavos)::integer AS total
      FROM pagos_recibidos
     WHERE notas LIKE 'Comprobante #% aprobado'
     GROUP BY team_id, notas
  ) p
 WHERE c.estado = 'aprobado'
   AND c.monto_aprobado_centavos IS NULL
   AND p.team_id = c.team_id
   AND p.notas = 'Comprobante #' || c.id || ' aprobado';

ALTER TABLE admin_escolar_tareas DROP CONSTRAINT IF EXISTS admin_escolar_tareas_estado_check;
ALTER TABLE admin_escolar_tareas ADD CONSTRAINT admin_escolar_tareas_estado_check
  CHECK (estado IN ('abierta', 'en_proceso', 'en_revision', 'completada'));
