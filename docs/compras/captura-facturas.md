# Fotos de facturas de proveedor · 2026-09-19

## Qué hace

Cada empresa tiene **un enlace** que no vence (Gastos → «Enlace para fotos»):
se copia, se manda por WhatsApp o se imprime su QR. Quien compra para la empresa
lo abre en el teléfono y **la cámara se abre sola**: encuadra la factura, dispara
(hasta 4 fotos, o un PDF desde la galería) y la envía. No necesita cuenta ni se
le pregunta nada: todo sale de la foto. Si el navegador no da la cámara —sin HTTPS, permiso denegado,
equipo sin cámara— quedan la cámara del sistema y la galería.

La factura cae en **«Facturas por revisar»**, arriba en Gastos, ya leída:

1. **QR del e-CF** (`lib/compras/captura/timbre.ts`). El QR impreso de todo e-CF
   es la URL de consulta de la DGII y trae RNC del emisor y del comprador,
   e-NCF, fecha y total exactos. Se busca en la foto a varias escalas
   (`qr.ts`, jsQR + sharp). No trae el ITBIS.
2. **IA** (`ia.ts`, `google/gemini-2.5-flash-lite` con `anthropic/claude-haiku-4.5` de respaldo). Llena **todo lo que el
   registro necesita**: nombre y RNC del proveedor, tipo de proveedor, NCF,
   fecha, subtotal, ITBIS, ISC, otros impuestos, propina, retenciones si la
   factura las detalla, total, líneas con su ITBIS, forma y método de pago, y la
   **categoría del catálogo** (`lib/compras/categorias.ts`) del comprobante y de
   cada línea — de ahí salen el tipo del 606, la cuenta contable y las
   retenciones sugeridas. Si hay QR, el QR manda en lo suyo y la IA pone el
   resto; si no coinciden se avisa.
   Dos formas de llamarla: **AI Gateway** (en Vercel, sin llave, con el token
   OIDC del despliegue; en local con `AI_GATEWAY_API_KEY`) o **`ANTHROPIC_API_KEY`**
   directa —esta segunda solo sirve para modelos de Anthropic.

   **Qué cuesta leer una factura** (precios del gateway, US$ por millón de
   palabras de entrada/salida; una factura ronda las 2.000 de entrada y 600 de
   salida):

   | Modelo | Entrada | Salida | Por factura | Nota |
   |---|---|---|---|---|
   | `anthropic/claude-sonnet-5` | 2.00 | 10.00 | ~US$0.010 | el más fino |
   | **`anthropic/claude-haiku-4.5`** (el respaldo) | 1.00 | 5.00 | ~US$0.005 | entra si el primero falla |
   | **`google/gemini-2.5-flash-lite`** (el que va) | 0.10 | 0.40 | ~US$0.0005 | 10× más barato, muy bueno en OCR |
   | `openai/gpt-5-nano` | 0.05 | 0.40 | ~US$0.0003 | |
   | `alibaba/qwen3.7-flash` | 0.03 | 0.13 | ~US$0.0001 | el más barato con visión |

   Los dos se cambian con `CAPTURA_IA_MODELO` y `CAPTURA_IA_MODELO_RESPALDO`,
   sin tocar código. El respaldo reintenta UNA vez si el primero no devuelve el
   JSON con la forma pedida —pasa con los modelos pequeños—, para que una
   factura no se quede sin leer.

   Los modelos de fuera de Anthropic solo funcionan por el gateway. Con los
   chinos (Alibaba, Zhipu, StepFun) la foto de la factura sale hacia sus
   servidores: lleva el RNC del proveedor y los montos, así que es dato de
   negocio, no documentos de personas.
3. El nombre del proveedor sale del padrón de la DGII si nadie lo leyó.
4. Si el proveedor ya mandó ese e-CF por ecf-api, el registro sale de su XML.

La lectura decide además si es **gasto** o **compra de inventario**, y el botón
principal de la bandeja lleva a esa pantalla («Registrar gasto» o «Registrar
compra»); el otro queda por si se equivocó. En una compra, cada línea se enlaza
con su producto del inventario cuando no hay duda (mismo nombre, referencia o
código de barras). Si la IA dice «compra» pero ningún artículo coincide con el
inventario, pasa a gasto y se avisa: confunde a menudo lo que se consume con
mercancía.

Nada entra al 606, a las retenciones, al inventario ni a la contabilidad hasta
que alguien con permiso pulsa el botón de registrar: el formulario de compras y gastos se abre lleno, con la foto al
lado y los avisos de lo que hay que comparar. Al registrar, la factura pasa a
«registrada» con su compra; también se puede descartar.

Sin ITBIS leído (solo QR, o IA apagada) la línea entra **exenta por el total** y
se avisa: suponer 18 % reclamaría un crédito que la factura quizá no tiene.

Lo leído no se da por bueno sin comprobarlo:
- las líneas se cuadran contra el total: si solo cuadran tal cual, el precio
  traía el ITBIS dentro (recibos de supermercado) y se le quita; si no cuadran de
  ninguna forma, se avisa;
- foto cortada (sin total), fecha a más de un año o en el futuro, NCF y RNC que
  no se leen, y comprobante de consumo (B02/E32: sin crédito ni 606), se avisan;
- al modelo se le dice a qué empresa le vendieron, y la bandeja tiene «Leer otra
  vez» en cada factura (el modelo no lee igual dos veces).

**Recibos de caja** (supermercados, tiendas, farmacias). Imprimen junto a los
datos buenos otros que el modelo toma por ellos: la resolución DGII con su fecha
(«Res DGII: 02-2009 · Del: 02/02/2009»), el NIF de la caja y, en impresoras
viejas, el NCF de 11 caracteres dentro del campo de 19 del formato anterior a
2018, relleno de ceros. Contra eso:
- el esquema pide **aparte, y antes**, la resolución, su fecha y el NIF (el
  modelo llena los campos en orden, así cada número tiene dónde ir); si aun así
  la fecha de la venta sale igual a la de la resolución, no vale y se avisa;
- el total solo se toma si el modelo **copia el renglón** donde lo leyó
  (`totalImpreso`): con la foto cortada sumaba las líneas y lo daba por total;
- `B023095708000000000` pasa como `B0230957080`, y se avisa;
- un NIF de 16 dígitos nunca pasa por RNC;
- el modelo ya no escribe observaciones libres: se contradecían con lo que
  ponía en los campos. Todos los avisos salen del código.

Con dos recibos reales (Olé 2020 cortado por abajo, La Sirena 2022), tres
lecturas cada uno: la fecha pasó de 1 acierto en 4 a 6 de 6; el total del Olé,
de inventado 3 de 3 a vacío con aviso; el NCF de La Sirena, de inválido a
B0230957080 3 de 3. El RNC de La Sirena, cortado en el borde de la foto, sigue
saliendo vacío (con aviso).

## Seguridad

- Token de 256 bits; en la base va su SHA-256 (para encontrarlo) y el token
  cifrado con `CERT_MASTER_KEY` (para volver a mostrarlo). Cambiar el enlace
  anula el anterior; desactivarlo corta las subidas.
- La página pública solo revela el nombre de la empresa. `noindex` y
  `no-referrer`; fuera del soporte y de Google Analytics.
- 30 subidas cada 10 min por enlace y 300 al día por empresa. La misma foto dos
  veces no crea otra factura. Tipo por magic bytes (JPG, PNG, WEBP, PDF).
- Fotos en el bucket privado de comprobantes (`…/factura-proveedor/<uuid>`), sin
  URLs firmadas: se sirven por `/api/gastos/capturas/[id]/archivos/[archivoId]`
  con sesión. Sin S3 (desarrollo) van a la base en base64.
- Si la empresa deja de estar activa, el enlace responde 410.

## Para activarlo en producción

1. Correr `lib/db/migrations/0181_captura_facturas.sql` (aditiva, idempotente).
2. Para la lectura con IA, una de las dos:
   - **habilitar AI Gateway en el proyecto `emitedo-v2`** (en Vercel autentica
     con OIDC, sin llave), o
   - poner `ANTHROPIC_API_KEY` en Vercel y en `.env.local`.

   Sin ninguna, el QR de los e-CF sigue funcionando y el resto queda para
   completarlo mirando la foto.
3. Opcional: `CAPTURA_IA_MODELO` para cambiar el modelo (ver la tabla de
   precios de arriba) y `CAPTURA_IA_MODELO_RESPALDO` para el reintento.

## Probado

- 44 pruebas unitarias, incluida la elección del modelo por variables de entorno y el encabezado de los recibos de caja: lector del QR (formatos reales de producción, entornos,
  direcciones falsas), lectura del QR en una foto girada, y la conversión de lo
  leído —categoría inventada que no pasa, tipo de proveedor que sale de la
  identificación salvo RST y exterior, retenciones impresas, y el QR mandando
  sobre la foto sin perder lo que solo trae la IA.
- De punta a punta contra el sandbox llamando las rutas: enlace, subida desde el
  teléfono, lectura por QR (proveedor, NCF, fecha y total exactos, nombre del
  padrón), foto repetida, registro del gasto con su asiento, la factura sale de
  la bandeja, foto sin QR queda a mano y se descarta, cambiar el enlace anula el
  viejo.
- Con la IA simulada (no hay llave en el sandbox), de punta a punta: una factura
  de papel llega con proveedor, NCF, fecha, ITBIS, líneas, categoría y método de
  pago; el formulario abre sin nada pendiente y se registra; con QR y foto a la
  vez, el QR manda en el comprobante y la IA pone lo demás.
- **Con la IA de verdad** (Gemini 2.5 Flash-Lite por el gateway, 4–6 s por
  factura): la factura electrónica y la B01 de prueba salen exactas (proveedor,
  RNC, NCF, fecha, líneas, ITBIS, totales). Un recibo real de supermercado
  cortado por abajo destapó los fallos que ahora se cuadran o se avisan: fecha de
  la resolución DGII en vez de la venta, precios con ITBIS incluido, total
  inventado y champú clasificado como mercancía.
- En el navegador con la IA encendida: la factura llega al formulario completa
  (dos líneas con su ITBIS, total RD$3,540) y se registra sin tocar nada.
- En el navegador, «Leer otra vez» sobre los dos recibos reales: La Sirena llega
  con B0230957080, 09/08/2022 y RD$12,570.00; el Olé con 28/03/2020 y sin total.
- **En el navegador** (Playwright, con cámara falsa de Chromium): la oficina saca
  el enlace con su QR; en un teléfono sin cuenta la cámara se abre sola, dispara,
  se quita la foto y entra la factura por la galería; llega a la bandeja leída por
  el QR con el proveedor del padrón; «Registrar gasto» abre el formulario lleno
  con la foto al lado; se separa el ITBIS, se registra (gasto #23, asiento #901)
  y la factura sale de la bandeja. Sin errores de página ni 5xx.
- Con la IA, la lectura tarda segundos y la bandeja se quedaba en «Leyendo la
  factura…»: `refreshInterval` como función no se reprogramaba. Ahora se
  consulta cada 3 s mientras alguna se está leyendo.
- Salió en esa prueba y se arregló: al volver a Gastos después de registrar, la
  bandeja seguía mostrando la factura. Next conserva montado el componente de la
  visita anterior y SWR no volvía a consultar; ahora registrar invalida la lista
  y la bandeja toma lo que manda el servidor.
