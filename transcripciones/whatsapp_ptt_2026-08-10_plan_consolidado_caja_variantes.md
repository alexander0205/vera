# Plan consolidado: apertura de caja y variantes de producto

## Audios fuente

- `C:\Users\daria\Downloads\WhatsApp Ptt 2026-08-10 at 10.18.42 AM.ogg` (0:55)
- `C:\Users\daria\Downloads\WhatsApp Ptt 2026-08-10 at 10.28.27 AM.ogg` (2:44)

Nota: transcripcion asistida por Whisper y editada para conservar el sentido tecnico de ambos audios.

## Resumen

El primer audio pide evitar que el usuario tenga que abandonar `Nueva factura` para abrir caja. Al intentar guardar una factura sin una caja abierta, el sistema debe mostrar un modal amplio dentro del flujo de facturacion que permita abrirla antes de continuar.

El segundo audio propone un manejo de variantes de inventario directamente al crear un producto. Por ejemplo, una camisa debe poder tener tallas M, L y XL, cada una con su propia cantidad disponible. La configuracion debe aparecer en el mismo flujo de creacion de producto y ser lo bastante flexible para que el usuario defina las variantes necesarias.

## Puntos de accion detectados

### Apertura de caja desde facturacion

- Al guardar una factura de venta sin una caja abierta, mostrar un modal de advertencia dentro de `Nueva factura`.
- El modal debe indicar que es necesario abrir caja antes de continuar.
- Incluir en ese mismo flujo la accion para abrir la caja, evitando enviar al usuario a otra pagina y obligarlo a volver despues.
- Usar un modal amplio cuando haga falta mostrar los datos necesarios de apertura de caja.

### Variantes de producto e inventario

- Agregar al flujo de creacion de producto una seccion para definir variantes del producto.
- Permitir, por ejemplo, crear una camisa y registrar tallas como M, L y XL.
- Permitir asignar y consultar la cantidad o existencias de cada variante de manera separada.
- Mantener la configuracion de variantes dentro del mismo modal o pantalla de crear producto; ampliar ese espacio si es necesario.
- Hacer la estructura reutilizable para distintos tipos de producto, no solo para tallas de ropa.
- Evaluar una clasificacion general o configuracion de tipo de variante para que el usuario pueda definir sus propios valores, reutilizando los componentes existentes cuando aplique.

## Transcripcion editada

### Audio 1 - 10:18:42 AM

**[00:00:00 - 00:00:55]**  
Cuando el usuario esta en `Facturas de venta > Nueva factura` y trata de guardar sin tener una caja abierta, se debe presentar un modal. Debe ser suficientemente grande si necesita mostrar mas datos y debe avisar que, antes de continuar, tiene que abrir su caja. Asi el usuario no tiene que salir de facturacion, ir a Caja y volver cada vez. Se acuerda agregarlo.

### Audio 2 - 10:28:27 AM

**[00:00:00 - 00:01:23]**  
Se plantea el caso de una camisa: al agregar ese producto, deben poder definirse sus variantes, por ejemplo las tallas. Para cada talla, como M, L o XL, debe poder registrarse cuanto inventario hay.

**[00:01:23 - 00:02:15]**  
La idea es que sea una configuracion general y flexible, no limitada a camisas. Se menciona evaluar una clasificacion o estructura de variantes que pueda reutilizarse con los elementos ya existentes.

**[00:02:15 - 00:02:44]**  
La configuracion debe mostrarse en la misma parte donde se crea el producto. La pantalla o modal puede hacerse mas grande para dar espacio a las variantes y a la accion de agregar sus valores y cantidades.
