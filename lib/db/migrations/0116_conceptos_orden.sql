-- Orden manual de los conceptos de pago.
--
-- Hasta ahora la lista salía por nombre, y el alfabeto no es el orden en que un
-- colegio piensa el año: primero la inscripción, después la colegiatura, y al
-- final los extras. Ordenado por nombre, "Becas Gobierno" abre la lista y la
-- inscripción queda enterrada entre "Grafomotricidad" y "Libro de
-- alfabetización".

ALTER TABLE admin_escolar_conceptos_pago
  ADD COLUMN IF NOT EXISTS orden SMALLINT NOT NULL DEFAULT 0;

-- Se arranca desde el orden que el colegio ya veía (alfabético, por empresa),
-- para que la lista no se baraje sola el día que esto entre: quien no quiera
-- tocar nada no debe notar la migración.
WITH numerados AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY nombre, id) - 1 AS pos
    FROM admin_escolar_conceptos_pago
)
UPDATE admin_escolar_conceptos_pago c
   SET orden = n.pos
  FROM numerados n
 WHERE n.id = c.id;

-- La lista se lee siempre filtrando por empresa y ordenando por esta columna.
CREATE INDEX IF NOT EXISTS admin_escolar_conceptos_orden_idx
  ON admin_escolar_conceptos_pago (team_id, orden);
