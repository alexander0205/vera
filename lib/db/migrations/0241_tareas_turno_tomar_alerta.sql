-- 0241 · Tareas: a quién le toca (guardado), quién la tomó por lado y la alerta a las 2 horas.
--
-- 1. admin_escolar_tareas.espera_respuesta_de ('colegio' | 'zero'): A QUIÉN LE
--    TOCA contestar, guardado en la tarea. Hasta ahora se deducía de quién
--    escribió último (`turnoDe`), y no había forma de contestar sin «pasar» la
--    pelota. El respaldo (backfill) es exactamente lo que daba `turnoDe`:
--      · de Soporte y no en revisión → 'zero'
--      · en revisión, o asignada a una persona del colegio → 'colegio'
--      · completada → NULL (a nadie)
-- 2. admin_escolar_tareas.pausa_hasta: «Esto tomará más tiempo». Sin alertas
--    hasta esa hora.
-- 3. admin_escolar_tarea_atiende pasa a guardar UNA PERSONA POR LADO: la clave
--    deja de ser (tarea_id) y es (tarea_id, lado). Lo que ya había (0237) era
--    siempre del equipo de Zero, así que queda como 'zero'.
-- 4. Índice parcial para el cron de cada hora (alerta a las 2 horas): solo las
--    pendientes sin plazo de cierre, por hora del último movimiento.
--
-- Aditiva e idempotente: se puede correr dos veces. Va ANTES del deploy: el
-- código nuevo lee las dos columnas nuevas de admin_escolar_tareas.
-- Correr con psql normal (cada sentencia sola); no necesita -1 ni CONCURRENTLY.

ALTER TABLE admin_escolar_tareas
  ADD COLUMN IF NOT EXISTS espera_respuesta_de varchar(8),
  ADD COLUMN IF NOT EXISTS pausa_hasta timestamp;

UPDATE admin_escolar_tareas
   SET espera_respuesta_de = CASE
         WHEN asignada_a = 'soporte' AND estado <> 'en_revision' THEN 'zero'
         ELSE 'colegio'
       END
 WHERE espera_respuesta_de IS NULL
   AND estado <> 'completada';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_escolar_tareas_espera_chk') THEN
    ALTER TABLE admin_escolar_tareas
      ADD CONSTRAINT admin_escolar_tareas_espera_chk
      CHECK (espera_respuesta_de IS NULL OR espera_respuesta_de IN ('colegio', 'zero'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS admin_escolar_tareas_paradas_idx
  ON admin_escolar_tareas (actualizado_en)
  WHERE estado IN ('abierta', 'en_proceso', 'en_revision') AND revision_vence_en IS NULL;

-- Una persona por lado. Un solo bloque: o se hace todo o nada.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'admin_escolar_tarea_atiende' AND column_name = 'lado'
  ) THEN
    ALTER TABLE admin_escolar_tarea_atiende ADD COLUMN lado varchar(8) NOT NULL DEFAULT 'zero';
    ALTER TABLE admin_escolar_tarea_atiende DROP CONSTRAINT admin_escolar_tarea_atiende_pkey;
    ALTER TABLE admin_escolar_tarea_atiende
      ADD CONSTRAINT admin_escolar_tarea_atiende_pkey PRIMARY KEY (tarea_id, lado);
  END IF;
END $$;
