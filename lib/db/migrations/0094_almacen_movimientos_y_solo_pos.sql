-- Tres cosas que van juntas: separar qué inventario es del punto de venta.
--
-- 1) `inventory_movements.almacen_id` — hasta ahora los movimientos NO guardaban
--    en qué almacén ocurrieron, solo `product_almacen_stock` sabía el stock por
--    almacén. Sin esto era imposible mostrar el historial de un almacén.
--    NULLABLE a propósito: cuando no se sabe el almacén (ventas viejas, ajustes
--    sin almacén) se guarda NULL, que es exactamente como está hoy. El histórico
--    anterior queda en NULL — ese dato nunca se registró y no se puede inventar.
--
-- 2) `almacenes.solo_pos` — marca el almacén como de uso exclusivo del punto de
--    venta (la cafetería del colegio, por ejemplo).
--
-- 3) `products.visible_facturacion` — espejo del `visible_pos` que ya existía.
--    Permite esconder un producto del catálogo de Facturación uno por uno.
--
-- Aditiva: nada se borra y los defaults preservan la conducta actual.

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS almacen_id integer REFERENCES almacenes(id);

-- Los movimientos se listan por almacén y por fecha.
CREATE INDEX IF NOT EXISTS inv_mov_almacen_idx
  ON inventory_movements (almacen_id, created_at DESC);

ALTER TABLE almacenes
  ADD COLUMN IF NOT EXISTS solo_pos boolean NOT NULL DEFAULT false;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS visible_facturacion boolean NOT NULL DEFAULT true;
