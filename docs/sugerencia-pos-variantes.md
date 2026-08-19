# Sugerencia para Alex — Variantes en el POS (pendiente)

## Qué se hizo y qué NO

En la rama `feat/caja-facturacion-variantes` quedó implementado y verificado:

- **Apertura de caja desde la factura** (modal inline al guardar sin turno).
- **Variantes de producto (MVP):** definir ejes (Talla, Color, etc.) y stock por variante **al crear el producto**, y **vender variantes desde "Nueva factura"** (el descuento de inventario pega a la variante correcta).

**Lo que quedó pendiente: vender variantes en el POS (Punto de Venta).**

Se implementó, pero se **revirtió** (commit de revert `350ccb9f`; el trabajo original quedó en `6c5b32a8`, recuperable). No se descartó por no funcionar, sino por una decisión de riesgo que explico abajo.

## Por qué se revirtió el POS

1. **Toca de fondo el núcleo del carrito del POS.** Para vender variantes hay que cambiar la identidad de cada línea del carrito de "id de producto" a "producto + variante" (clave compuesta). Eso atraviesa: agregar al carrito, subir/bajar cantidad, editar precio, descuentos globales y las comandas. Es un cambio transversal sobre código que Alex ya tenía estable.

2. **No se pudo probar en vivo.** El POS necesita un turno de caja abierto y una terminal para siquiera cargar, y en el entorno de trabajo no se pudo manejar la pantalla táctil. El camino del dinero (descuento de stock) sí se verificó por API, pero la interacción de UI del carrito no. **No se quiso mergear un cambio no probado en la ruta crítica de cobro sin que Alex lo revise.**

3. **Choca con el modelo de stock del POS.** El POS de Alex trabaja stock **por almacén** (`product_almacen_stock`). Las variantes, por decisión, usan stock **global**. Son dos modelos distintos y meterlos juntos a la fuerza puede confundir los reportes por almacén.

## Consecuencias de aplicar el cambio del POS tal como estaba

- Un producto con variantes aparecería en la grilla del POS usando su **stock global** (suma de variantes), **ignorando el almacén** de la terminal.
- Al vender una variante, se descuenta la variante y el stock global del producto, **pero NO se actualiza `product_almacen_stock`** → los reportes de stock por almacén no verían esas ventas.
- Las **comandas/mesas no guardan la variante**: si se vende una variante en una mesa y se recarga la comanda, se pierde qué variante era.
- El escaneo de código de barras matchea el producto (no la variante) y abre el selector.

## Recomendación para hacerlo bien sin romper lo de Alex

1. **Definir primero el modelo de stock para el POS** (es la decisión de fondo):
   - **Opción A (rápida):** aceptar que las variantes usan stock global y que en el POS ignoran el almacén. Documentarlo y listo. Sirve si cada empresa opera en un solo local.
   - **Opción B (completa):** extender variantes a stock **por almacén** (tabla `product_variant_almacen_stock`) para que el POS quede consistente con el resto. Es más trabajo, pero no rompe el modelo por-almacén de Alex.

2. **Si se va con variantes en POS**, además:
   - Agregar `variantId` a los ítems de comanda (para que mesas no pierdan la variante).
   - Que el descuento de venta de variante también toque `product_almacen_stock` si importan los reportes por almacén.

3. **Reusar el trabajo ya hecho, no reescribir.** El commit `6c5b32a8` (revertido) ya tiene el refactor de carrito por clave compuesta y el selector de variante en la grilla. Se recupera con:
   ```bash
   git cherry-pick 6c5b32a8      # trae de vuelta el POS como punto de partida
   # o: git revert 350ccb9f      # revierte el revert
   ```
4. **Probar en una sesión real de POS** (turno abierto + terminal) antes de mergear: tocar un producto con variantes → elegir talla → ver que es su propia línea → cobrar → confirmar que bajó el stock de esa talla.

## Recomendación corta

Que Alex decida **Opción A vs B** del stock. Con eso claro, retomamos el commit `6c5b32a8` (ya está el 80% del POS), ajustamos según su decisión, y lo probamos juntos en un POS real antes de mergear. Así el POS entra sin sorpresas y sin pelear con lo que ya construyó.
