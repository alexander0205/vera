-- 0214 · Avisos a las familias: qué decía el mensaje y si abrieron el enlace.
--
--   1. `texto`       Lo que salió, tal cual. NULL = aviso anterior a esta
--                    migración, cuyo texto nunca se guardó.
--   2. `con_enlace`  Si el mensaje llevaba enlace de pago. NULL = no se sabe.
--   3. `abierto_at`  La primera vez que alguien abrió ese enlace.
--   4. `aperturas`   Cuántas veces. Solo cuenta un navegador de verdad: los que
--                    previsualizan enlaces no ejecutan JavaScript.
--
-- NO se rellena nada: los avisos que ya salieron quedan en NULL y en 0.
--
-- Aditiva e idempotente: solo agrega columnas, se puede correr dos veces.
-- CORRER ANTES del deploy: el historial del código nuevo lee estas columnas.

ALTER TABLE admin_escolar_avisos_enviados
  ADD COLUMN IF NOT EXISTS texto text,
  ADD COLUMN IF NOT EXISTS con_enlace boolean,
  ADD COLUMN IF NOT EXISTS abierto_at timestamp,
  ADD COLUMN IF NOT EXISTS aperturas integer NOT NULL DEFAULT 0;
