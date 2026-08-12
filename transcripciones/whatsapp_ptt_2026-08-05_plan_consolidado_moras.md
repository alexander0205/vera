# Plan consolidado: facturas, credito y mora

## Audios fuente

- `C:\Users\daria\Downloads\WhatsApp Ptt 2026-08-05 at 11.04.02 AM.ogg` (8:51)
- `C:\Users\daria\Downloads\WhatsApp Ptt 2026-08-05 at 11.06.37 AM.ogg` (1:23)
- `C:\Users\daria\Downloads\WhatsApp Ptt 2026-08-05 at 11.17.50 AM.ogg` (10:11)

Nota: este documento consolida los tres audios en orden cronologico. Cuando una propuesta inicial cambia despues, prevalece la ultima decision clara. La conversacion sobre la formula compuesta de la mora no concluye de forma definitiva; se mantiene como confirmacion pendiente, no como requisito para implementar.

## Plan final a implementar

### Condiciones de pago en facturas

- En `Nueva factura` y en `Factura recurrente`, mantener solamente las condiciones de pago `Al contado` y `A credito`.
- Quitar el campo o configuracion de `Plazo de vencimiento` de esas pantallas.
- Si se selecciona `A credito`, mostrar en modo informativo como esta configurado el credito y la mora en la configuracion central. Por ejemplo: el vencimiento relativo y las condiciones que aplican.
- Si se selecciona `Al contado`, no mostrar el resumen de condiciones de mora o credito.
- Corregir el desbordamiento visual del boton o control de `Al contado` visto durante la prueba.

### Configuracion de mora

- Quitar por completo la personalizacion de mora por factura o por plan en `Nueva factura` y `Factura recurrente`.
- La mora debe tomar sus reglas exclusivamente de la configuracion central existente.
- La mora se calcula sobre el saldo pendiente de la factura, no sobre el total original. Ejemplo: una factura de 1,000 con 500 abonados genera la mora sobre 500.
- Mantener en la configuracion central la opcion de generar mora automaticamente. Al activarla, solicitar y explicar claramente:
  - Dias de gracia antes de generar la mora.
  - Periodicidad o repeticion de la mora.
  - Valor de la mora, ya sea porcentaje o monto fijo, segun las opciones existentes.
- La periodicidad no debe quedar forzada solamente a mensual. Puede conservarse una configuracion por dias o periodo, pero con etiquetas y ejemplos claros, por ejemplo `cada 30 dias (mensual)` o `cada 15 dias`.
- Hacer la interfaz de `Recargo por mora` menos tecnica e intuitiva; los controles y textos deben explicar el efecto de activar la generacion automatica.

### Avisos y detalle de la mora

- Al guardar una factura marcada `Al contado` que queda sin pagar, mostrar un pop-up de advertencia. Debe informar que la factura no fue pagada y que existe configuracion de mora, dando la oportunidad de corregir la condicion a `A credito` o continuar segun el flujo definido.
- Aplicar ese aviso tanto a `Nueva factura` como a `Factura recurrente`.
- En el detalle de la factura, mostrar la proxima mora automatica: cuando se cobrara y cual sera su importe.
- Mantener visible la accion relacionada con la nota de debito por mora y hacer que el estado de la automatizacion se entienda desde el detalle de la factura.

### Correcciones funcionales

- Revisar y corregir el envio de correos desde la factura: durante la prueba, los correos no se estaban enviando.
- Confirmar que el flujo de una factura no pagada, su condicion de pago y la generacion automatica de mora se comporten de forma consistente antes de cerrar el cambio.

## Decisiones descartadas

- No mantener un `Plazo de vencimiento` editable en las pantallas de factura o factura recurrente.
- No mantener una configuracion o personalizacion de mora especifica para cada factura o plan.
- No obligar la repeticion de mora a ser solamente mensual. La alternativa mensual queda como ayuda o ejemplo, no como unica regla.
- No agregar en la factura una seleccion para decidir si la mora se calcula sobre el total de la factura o sobre el saldo; el criterio acordado es el saldo pendiente.
- No implementar todavia una interfaz que permita elegir entre aplicar mora a la factura, a una mora previa o a ambas. Ese tema quedo abierto para validacion.

## Confirmacion pendiente antes de implementar

La formula de mora compuesta se discutio, pero no quedo aprobada de forma estable. Se propusieron tres bases posibles: saldo de la factura, mora previa o ambas. Al final se sugirio dejar "mora sobre mora", pero inmediatamente se pidio confirmar si ese caso es legal o aplicable. Como el tercer audio no resuelve esa confirmacion, no debe implementarse una formula compuesta nueva ni una opcion para escogerla hasta validarla con negocio o contabilidad.

## Transcripcion editada y reconciliada

### Audio 1 - 11:04:02 AM

**[00:00 - 00:01]**  
Cuando una factura se crea a credito, debe presentar los detalles que vienen de la configuracion. No debe permitir editar ahi una regla como "vence en cinco dias", porque esos cinco dias ya pertenecen a la configuracion central. La seccion de mora se quitara de la factura.

**[00:01 - 00:03:38]**  
Se revisa `Condicion de pago`. Una factura no pagada debe ser tratada como credito y se comenta la necesidad de un pop-up cuando se deja `Al contado` sin configurar pago. La mora no se calcula sobre el total: se aplica a lo que se debe de la factura.

**[00:03:38 - 00:07:34]**  
La generacion automatica de mora requiere una opcion clara de activacion, dias de gracia y una repeticion. Se plantea mensual como ejemplo, pero se decide conservar la flexibilidad de configurar por dias o periodos, mejorando los textos para que se entiendan facilmente. Tambien se menciona que el valor puede ser porcentual o fijo.

**[00:07:40 - 00:08:51]**  
Se conversa sobre mora compuesta: aplicarla a la factura, a la mora o a ambas. La discusion termina sin una confirmacion final y se pide validar el criterio.

### Audio 2 - 11:06:37 AM

**[00:00 - 00:01:23]**  
Se ilustra el calculo compuesto con importes de factura y mora. Se vuelve a mencionar aplicar el porcentaje a ambos, pero despues se propone dejarlo solamente como mora sobre mora y confirmar si ese escenario es legal. No se toma una decision final de implementacion.

### Audio 3 - 11:17:50 AM

**[00:00 - 00:03:06]**  
Se prueba una factura normal y se confirma que, si queda sin pagar y no se marco como credito, debe aparecer un mensaje que advierta la situacion y permita aplicar credito o continuar segun corresponda. Tambien se identifica un problema visual con el control de `Al contado`.

**[00:03:06 - 00:05:30]**  
La factura debe advertir que existe configuracion de mora y explicar si se generara automaticamente. En el detalle debe mostrarse la proxima fecha de cobro por mora y el importe previsto. Se revisa la accion `Generar nota de debito por mora`.

**[00:05:30 - 00:06:14]**  
Se detecta que los correos no se estan enviando desde la factura y se pide revisarlo.

**[00:06:14 - 00:08:17]**  
En facturas recurrentes se decide eliminar `Plazo de vencimiento` y toda la personalizacion de mora por plan. Deben quedar solo `Al contado` y `A credito`; al elegir credito se muestra un texto con la configuracion central de mora.

**[00:08:28 - 00:10:11]**  
Recapitulacion final: quitar plazo de vencimiento y personalizacion por plan tanto en factura de venta como en factura recurrente; mostrar advertencia al guardar una factura no pagada marcada al contado; mostrar el proximo cargo por mora en el detalle; arreglar el envio de correos; y hacer mas intuitiva la interfaz de recargo por mora.
