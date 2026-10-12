-- Nómina · provisiones según la antigüedad de cada empleado.
--
-- La provisión se calculaba igual para todos: 14 días de vacaciones, 21 de
-- cesantía y regalía sin tope. Ahora cada línea guarda lo que le toca en ese
-- período según su antigüedad (cesantía 0/6/13/21/23 del art. 80, vacaciones
-- 14 o 18 del art. 177, regalía con el tope del art. 219), porque la antigüedad
-- cambia con el tiempo y el asiento y la pantalla tienen que leer lo mismo.
-- Null en corridas viejas: se sigue usando la estimación lineal.
--
-- Aditiva e idempotente: se corre a mano con psql.

ALTER TABLE nomina_lineas ADD COLUMN IF NOT EXISTS provision_regalia_cents    BIGINT;
ALTER TABLE nomina_lineas ADD COLUMN IF NOT EXISTS provision_vacaciones_cents BIGINT;
ALTER TABLE nomina_lineas ADD COLUMN IF NOT EXISTS provision_cesantia_cents   BIGINT;
