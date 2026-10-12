-- La caja de la cafetería ofrecía mensualidades.
--
-- En la grilla del POS de un colegio salían «Incripcion RD$5,000», «MENSUALIDAD
-- RD$3,000» y —peor— «Interés por mora RD$0.00»: un botón que emite un
-- comprobante fiscal de cero pesos si alguien lo toca por error.
--
-- La compuerta para eso ya existía desde la 0061: `products.visible_pos`. Lo que
-- no existía era nadie que la apagara. Nació con DEFAULT true y con un backfill
-- que puso true a todo lo anterior, y de las cinco rutas que insertan productos
-- (alta manual, importar productos, importar facturas, alta del servicio de
-- mora, tarifas del módulo escolar) solo la última fijaba el valor. Resultado
-- medido en producción antes de este cambio: 334 de 335 productos con
-- visible_pos = true, 149 de 150 servicios incluidos. Un interruptor que en la
-- práctica nunca estuvo en dos posiciones no es un interruptor.
--
-- El default se invierte a false. La asimetría manda: un producto que falta en
-- la grilla es una molestia visible y reversible —el cajero lo pide, o cobra por
-- «Venta simple», que ya existe y no necesita catálogo—, mientras que uno que
-- sobra es un e-CF equivocado, y de eso no se vuelve. Cada ruta de inserción
-- ahora calcula el valor a partir de lo que ES el ítem (un bien se despacha en
-- mostrador, un servicio se factura), así que el default solo actúa de red para
-- la próxima ruta que alguien escriba y se olvide.
--
-- Descartado bajar `visible_pos = false` a TODOS los servicios: los datos dicen
-- que un colegio dominicano SÍ cobra la colegiatura en caja. El equipo 9
-- (Colegio Andrés Bello) vendió 47 servicios distintos en 759 líneas por su
-- terminal. Apagarlos «porque son escolares» le rompería la operación diaria a
-- quien más usa el módulo. Por eso el backfill de abajo no adivina.

ALTER TABLE products ALTER COLUMN visible_pos SET DEFAULT false;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Dos reglas, y ninguna de las dos opina sobre el negocio del cliente.
--
-- Se corre UNA vez. El `ALTER` de arriba sí es idempotente, pero estos dos
-- UPDATE no: si se repiten después de que un comerciante haya metido a mano un
-- servicio nuevo en su caja y todavía no lo haya vendido, se lo vuelven a sacar.

-- 1) El servicio de mora es de sistema: precio 0 de catálogo porque el monto se
--    calcula por factura vencida. No hay forma de venderlo bien en un mostrador,
--    así que no es una preferencia que el comerciante deba poder equivocar. En
--    producción esto apaga el «Interés por mora» del equipo 2, que ya llegó a
--    facturarse una vez desde la caja.
UPDATE products
   SET visible_pos = false
 WHERE es_mora = true
   AND visible_pos = true;

-- 2) Servicios que nunca pasaron por una caja. La garantía es verificable, no
--    una corazonada: si un producto aparece en la línea de algún comprobante
--    emitido dentro de un turno de caja (`ecf_documents.turno_caja_id`), se
--    queda. Nadie pierde de la grilla algo que ya vendía.
--
--    Los bienes no se tocan: un bien es mercancía de mostrador por naturaleza,
--    y esconderlos sí sería la regresión de vaciar el POS de un comercio real.
WITH docs_de_caja AS MATERIALIZED (
  -- El cast va en la proyección y el guardia en el filtro, en el mismo nodo:
  -- `lineas_json` es text y una fila mal formada tumbaría la migración entera.
  SELECT d.lineas_json::jsonb AS lineas
    FROM ecf_documents d
   WHERE d.turno_caja_id IS NOT NULL
     AND d.lineas_json IS JSON ARRAY
), vendidos_en_caja AS (
  SELECT DISTINCT (l->>'productoId')::int AS product_id
    FROM docs_de_caja
    CROSS JOIN LATERAL jsonb_array_elements(lineas) AS l
   WHERE l->>'productoId' ~ '^[0-9]+$'
)
UPDATE products p
   SET visible_pos = false
 WHERE p.tipo = 'servicio'
   AND p.visible_pos = true
   AND NOT EXISTS (SELECT 1 FROM vendidos_en_caja v WHERE v.product_id = p.id);

-- `updated_at` queda intacto a propósito: esto es una corrección del sistema, no
-- una edición del usuario, y mover la fecha ensuciaría el «modificado por última
-- vez» de medio catálogo sin que nadie lo haya tocado.
