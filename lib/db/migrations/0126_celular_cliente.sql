-- Celular del contacto, aparte del teléfono y del WhatsApp.
--
-- Son tres números distintos y en la práctica no coinciden: el fijo de la casa,
-- el celular al que se llama y el número por el que se escribe. Meterlos en el
-- mismo campo obligaba a elegir cuál se pierde, y quien cobra necesita poder
-- llamar aunque el WhatsApp esté en otro teléfono.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS celular VARCHAR(30);

-- Buscar un contacto por cédula es lo que evita crear el mismo padre dos veces,
-- y las cédulas están escritas de las dos formas: con guiones y sin ellos. El
-- índice es sobre los dígitos pelados para que la búsqueda encuentre igual
-- «001-0351455-0» que «00103514550» sin recorrer la tabla entera.
CREATE INDEX IF NOT EXISTS clients_rnc_digitos_idx
  ON clients (team_id, (regexp_replace(COALESCE(rnc, ''), '\D', '', 'g')));
