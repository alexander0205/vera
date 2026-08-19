# Plan consolidado: pagos, facturas y moras

## Audios fuente

- `C:\Users\daria\Downloads\WhatsApp Ptt 2026-08-06 at 11.48.59 AM.ogg` (2:27)
- `C:\Users\daria\Downloads\WhatsApp Ptt 2026-08-06 at 11.50.51 AM.ogg` (1:36)
- `C:\Users\daria\Downloads\WhatsApp Ptt 2026-08-06 at 12.16.45 PM.ogg` (17:06)

Nota: transcripcion asistida por Whisper y consolidada en orden cronologico. El termino `mora` se refiere al recargo generado mediante una nota de debito asociada a una factura.

## Resumen

La conversacion define mejoras de visibilidad y UX para pagos de facturas con mora. Una factura debe ser el elemento principal y sus notas de debito por mora deben mostrarse como elementos hijos, tanto en `Cuentas por cobrar` como en el detalle de la factura. El estado de la factura debe reflejar si aun queda una mora pendiente, aunque el capital de la factura ya se haya pagado.

Se revisa la distribucion de pagos y se decide no crear una interfaz compleja de reparto manual. Debe conservarse el comportamiento actual despues de validarlo: el pago total contempla la factura y sus moras; en pagos parciales se prioriza el saldo de la factura y se debe informar con claridad cualquier mora que permanezca pendiente. La prioridad es aclarar el resultado del pago y actualizar las vistas automaticamente.

## Plan final a implementar

### Jerarquia y detalle de facturas

- En `Cuentas por cobrar`, mostrar la factura como fila o tarjeta principal.
- Debajo de cada factura, mostrar como hijos las notas de debito por mora asociadas.
- Al seleccionar o expandir una factura, presentar el detalle de sus moras y notas de debito vinculadas.
- Replicar esta jerarquia en el detalle de la factura, para que el usuario pueda ver las moras sin tener que navegar a otra pantalla.
- Cada nota de debito por mora debe mostrar, de forma visible, el numero o codigo corto de la factura de origen y permitir navegar a ella.
- Verificar que la relacion tecnica entre nota de debito por mora y factura ya exista; si existe, mostrarla correctamente en la interfaz en vez de duplicar datos.

### Estados y saldos

- No marcar una factura como `Pagada` si su capital esta cubierto pero aun tiene mora pendiente.
- Usar un estado claro para ese caso, por ejemplo `Parcial` o `Mora pendiente`, segun las categorias ya disponibles en el sistema.
- Mostrar el saldo pendiente de mora de manera separada y comprensible en el detalle y en `Cuentas por cobrar`.
- Mantener visible la factura en `Cuentas por cobrar` cuando el principal este pagado pero exista una nota de debito por mora sin pagar; no dejar solamente la nota de debito aislada.
- En cada nota de debito por mora, mostrar su importe y estado (`Pendiente`, `Parcial` o `Pagada`) junto al codigo corto y una accion para ver el detalle.

### Registro y distribucion de pagos

- Conservar el mecanismo de distribucion de pagos que se valido durante la prueba; no agregar por ahora controles para repartir manualmente un abono entre capital y mora.
- Cuando el pago cubra el total, incluir la factura y las moras o notas de debito asociadas.
- En un pago parcial, priorizar el saldo de la factura conforme al comportamiento validado y dejar las moras que no alcancen a cubrirse como pendientes.
- Antes de confirmar un pago parcial, mostrar un resumen o alerta clara: importe recibido, importe aplicado a la factura y mora que permanecera pendiente.
- Evitar que el usuario tenga que inferir donde se aplico el dinero, especialmente cuando el pago no cubre el total de factura mas mora.
- Actualizar automaticamente el detalle de factura y `Cuentas por cobrar` despues de registrar un pago, sin obligar a cerrar, reabrir o recargar manualmente la vista.

### Alcance descartado

- No construir por ahora una pantalla de distribucion manual donde el usuario elija cuanto del pago va a factura y cuanto va a mora.
- No ocultar las notas de debito por mora fuera del contexto de su factura principal.
- No tratar como pagada una factura que aun tenga recargos por mora pendientes.

## Transcripcion editada

### Audio 1 - 11:48:59 AM

**[00:00 - 00:01:26]**  
La factura debe presentarse como elemento principal y, debajo, como hijos, deben aparecer las moras o notas de debito de esa factura. Al seleccionar la factura se debe poder ver esa informacion relacionada. Se aclara que la mejora actual debe centrarse en esta jerarquia y en el flujo de pago.

**[00:01:26 - 00:02:27]**  
Al pulsar `Registrar pago`, si la factura tiene notas de debito, deben presentarse para que puedan pagarse junto con la factura. Se esta registrando el pago de esa factura, incluyendo la mora cuando corresponda.

### Audio 2 - 11:50:51 AM

**[00:00 - 00:01:36]**  
Si el pago es completo, debe cubrir factura y mora. Si el pago es parcial, se conversa sobre que el saldo principal de la factura sea la prioridad y la mora no cubierta permanezca pendiente. Se pide que este resultado sea mas claro en `Cuentas por cobrar`.

### Audio 3 - 12:16:45 PM

**[00:00 - 00:03:35]**  
Se revisan ejemplos de facturas con mora y los PDF de sus notas de debito. Una nota de debito por mora debe indicar claramente a que factura corresponde. Se propone mostrar el numero de factura cerca del saldo o en el resumen de la nota, y se pide investigar si la relacion ya existe pero no se esta mostrando.

**[00:03:35 - 00:06:27]**  
Cuando una factura tiene una mora sin pagar, debe presentarse esa nota de debito como pendiente. No debe aparecer como pagada solo porque se pago el principal de la factura. Se acuerda usar el mismo patron jerarquico de `Cuentas por cobrar` en el detalle de factura: al expandirla, mostrar la mora debajo.

**[00:06:27 - 00:10:51]**  
Se discute si crear una distribucion manual de pagos entre factura y mora. La conclusion es no complicar el flujo. Se mantiene la distribucion actual, con el capital como prioridad en los pagos parciales, pero debe agregarse una explicacion o alerta que indique claramente lo pagado y lo que queda pendiente de mora.

**[00:10:51 - 00:15:21]**  
Se prueba una factura con varias moras de monto fijo. Tras revisar los resultados, se confirma que la distribucion actual funciona como se espera y se decide dejarla asi. La necesidad pendiente es que las vistas se actualicen y comuniquen el estado sin exigir que el usuario cierre y vuelva a abrir pantallas.

**[00:15:21 - 00:17:06]**  
En el detalle de factura, las notas de debito por mora deben mostrar un identificador corto, su estado (`Pagada` o `Parcial`, segun corresponda) y acceso al detalle. Se concluye que la mayor parte del trabajo es de interfaz y claridad visual.
