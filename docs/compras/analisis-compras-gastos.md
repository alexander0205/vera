# Compras y Gastos — análisis y registro fiscal (RD) · 2026-09-14

## Cómo estaba

**Compras** (`/dashboard/compras`) tenía dos pestañas sin relación entre sí:

- *Facturas recibidas*: los e-CF que llegan por ecf-api. Solo se veían: no se
  asentaban, no creaban cuenta por pagar y no iban al 606.
- *Compras registradas*: un modal «Registrar entrada de inventario» que solo
  aceptaba productos de tipo bien. Sin NCF del proveedor (salvo el que venía de
  un e-CF), sin tipo de bienes del 606, sin servicios ni conceptos de gasto, sin
  retenciones, con el ITBIS tecleado a mano como un solo monto, y el
  inventario se movía con un «fire-and-forget» que podía fallar en silencio.
  El costo del producto nunca se actualizaba.

**Gastos** (`/dashboard/gastos`) solo listaba e-CF 43/47 guardados como
borrador. Un gasto con NCF de proveedor (B01, E31) se registraba como e43:
fiscalmente es otro comprobante, nunca se emitía y no salía en el 606. Las
categorías eran texto libre sin relación con el 606 ni con cuentas.

**Formato 606** solo incluía e41/e43 emitidos; el tipo de bienes iba fijo en
02, todo el monto como servicios, el ITBIS retenido en cero y el tipo de
retención ISR siempre 2. Las compras registradas y los gastos no aparecían.

**Contabilidad**: la compra iba entera a Inventario contra Cuentas por pagar
(1104 solo en régimen gravado); los gastos 43/47 a 6101 contra caja; no había
cuentas para retenciones a terceros.

## Qué pide la DGII (resumen con fuentes)

- **606** mensual antes del día 15 (Norma General 07-2018): una línea de 23
  campos por comprobante. Tipo de bienes y servicios 01–11 (01 gastos de
  personal, 02 trabajos/suministros/servicios, 03 arrendamientos, 04 gastos de
  activos fijos, 05 representación, 06 otras deducciones, 07 financieros, 08
  extraordinarios, 09 costo de venta, 10 adquisiciones de activos, 11 seguros).
  Fecha de pago obligatoria cuando hay retención. Formas de pago 1–7.
- **Consumo (B02/E32)** no sustenta costos ni gastos ni da crédito: no va al 606.
- **Gastos menores (B13/E43)**: los emite la propia empresa a su nombre, van al
  606 con el RNC de la empresa y su ITBIS no se adelanta.
- **Compras a informales (B11/E41)** y **pagos al exterior (B17/E47)**: los
  emite la empresa; llevan retención.
- **Retenciones de ITBIS**: 100 % a personas físicas y al RST; 30 % en
  servicios profesionales entre empresas (NG 02-05); 100 % en seguridad y
  vigilancia (NG 07-09).
- **Retenciones de ISR a personas físicas**: desde el **1-jul-2026** honorarios
  y alquileres 15 % (antes 10 %) y servicios técnicos 3 % (antes 2 %, renta
  presunta) — Ley 30-26 art. 17, Aviso DGII 10-26. Pagos al exterior 27 %.
- Lo retenido se declara y paga aparte: ITBIS en el IT-1, ISR en el IR-17.

Fuentes: [DGII · tipos de bienes y servicios del 606](https://ayuda.dgii.gov.do/conversations/discusiones/tipo-de-bienes-y-servicios-comprados-formato-de-envo-606/6495d9fe29354c079132b242),
[DGII · e-CF 43 y 41](https://ayuda.dgii.gov.do/conversations/discusiones/ecf-de-gastos-menores-y-de-compras/66e06493ae5dba20f4a5f76f),
[DGII · RNC en gastos menores](https://ayuda.dgii.gov.do/conversations/discusiones/uso-de-comprobante-de-gasto-menor-b13/64344fb7c7dea832a77e0b12),
[DGII · B02 en el 606](https://ayuda.dgii.gov.do/conversations/discusiones/duda-con-el-606-y-el-b02/5f3c17cb8cd858ce87ab44e1),
[DGII · retención 15 % Ley 30-26](https://ayuda.dgii.gov.do/conversations/discusiones/retencin-isr-del-15-segn-ley-3026/6a452f52de3c6003da13b350),
[DGII · retención 3 % servicios técnicos](https://ayuda.dgii.gov.do/conversations/discusiones/ley-3026-nueva-retencin-efectiva-del-3-que-modifica-el-articulo-2-de-la-norma-general-707/6a4535910748377e135156ed),
[Retenciones de ITBIS (NG 02-05)](https://ayuda.dgii.gov.do/conversations/discusiones/itbis-retenido-empresas-norma-0205/627c1e65c10fd3205efd2147),
[Siempre al Día · retenciones en compras](https://siemprealdia.co/republica-dominicana/impuestos/guia-de-retenciones-en-compras/).

## Qué se hizo

**Un solo registro para las dos pantallas** (`compras_locales`, migración 0180):
el comprobante completo con proveedor (RNC/cédula con dígito verificador y
consulta al padrón), tipo de proveedor, NCF (B/E, 11/13 caracteres, tipo y si da
crédito), NCF modificado en notas, tipo de bienes 606 (automático por la línea
de mayor monto), líneas de **productos** (suman existencia y actualizan el
**costo promedio ponderado**) o de **conceptos de gasto** por categoría, ITBIS
por línea (18/16/0/exento), ITBIS llevado al costo (automático: consumo,
gastos menores, pagos al exterior, empresa exenta), ISC, otros impuestos,
propina legal, retenciones sugeridas con su base legal (editables), contado con
método y fecha de pago o crédito con vencimiento. Aviso de NCF repetido del
mismo proveedor (y bloqueo del que ya se emitió en Zero). Anulación con motivo:
revierte inventario y genera el reverso del asiento; no se anula lo ya pagado.

- Compras: `/dashboard/compras/registrar` (y desde un e-CF recibido, con los
  datos del XML: emisor, e-NCF, fecha, crédito y líneas con su ITBIS).
- Gastos: «Nuevo gasto» pregunta qué comprobante se tiene — factura de
  proveedor (`/dashboard/gastos/registrar`), gasto menor e43, proveedor
  informal e41 o pago al exterior e47. La pantalla une los gastos registrados y
  los e43/e47 del mes, con resumen (gastado, ITBIS por adelantar, retenciones,
  por pagar), desglose por categoría y aviso de los e43/e47 sin emitir.

**Contabilidad** (`lib/compras/asiento-compra.ts`), al registrar:

| Debe | Haber |
|---|---|
| 1105 Inventario / cuenta de la categoría (6109–6118, 5101, 1201) — base + lo no recuperable repartido por línea | 2113 ITBIS retenido a terceros por pagar |
| 1104 ITBIS adelantado | 2114 ISR retenido a terceros por pagar |
| | 2101 Cuentas por pagar o caja/banco del método — el neto |

Cuentas por pagar muestra y cobra el **neto** (lo retenido se le paga a la
DGII) y al saldarse fija la fecha de pago del 606. El panorama contable lista
«Compras y gastos registrados» y «Anulaciones de compras».

Los comprobantes que emite la propia empresa (`gasto_doc`) siguen la misma
lógica: el gasto va a la cuenta de su categoría (Transporte y combustible →
6113, Alquileres → 6109, Servicios → 6112…; sin categoría, 6101) con todo su
ITBIS, porque ni el gasto menor ni el pago al exterior lo adelantan; las
retenciones guardadas en el comprobante van a 2113/2114 y el neto a caja/banco
o a Cuentas por pagar. Los e43/e47 se asientan desde el borrador (es su registro
operativo) y los e41 solo cuando ya se emitieron; antes todos iban a 6101 y los
e41 no se asentaban.

**Formulario de e41/e43/e47** (el de facturas, en modo gasto):

- Los e43 y e47 salen siempre **exentos**. La regla del tipo ya lo decía y la
  DGII los recibe así (el mapper manda `montoExento = montoTotal`), pero al
  abrir la pantalla con `?tipo=` o al agregar una línea esta traía el 18 %: el
  selector de impuesto salía en blanco y el gasto se guardaba inflado (un peaje
  de RD$300 quedaba en RD$354, con ese ITBIS en el asiento y en el 606).
- Retenciones predefinidas al día: honorarios y alquileres de personas físicas
  15 %, servicios técnicos 3 % (Ley 30-26) y pagos al exterior 27 %. Antes
  había 10 %, 10 % y no existían las otras dos. Salen de `tasasRetencion`, las
  mismas que sugiere el registro de compras.
- El estado de pago de los 41/43/47 descuenta lo retenido: al proveedor se le
  paga el neto y lo retenido va a la DGII. Antes un e47 pagado completo quedaba
  «Parcial» y la pantalla de gastos lo mostraba «Por pagar» por el total. La
  pantalla calcula el saldo con los pagos reales (total − retenido − pagado).

**606** (`/api/reportes/606`): compras y gastos registrados no anulados (sin
B02) más e41/e43/e47 emitidos, con tipo de bienes, servicios y bienes, ITBIS al
costo y por adelantar, retenciones solo con fecha de pago, tipo de retención
ISR y forma de pago. El crédito de ITBIS del panel usa lo registrado.

## Probado desde la UI (sandbox)

Compra a crédito con B01 (producto + flete) · aviso de NCF repetido · gasto de
honorarios a persona física con 100 % de ITBIS y 15 % de ISR retenidos
(asiento 6110/1104/2113/2114/1102 al centavo) · gasto con B02 (ITBIS al costo,
fuera del 606) · pantalla de gastos · pago en Cuentas por pagar · 606 con las
líneas esperadas · anulación y bloqueo de lo pagado · e43 con la aclaración ·
gasto menor e43 de peajes (RD$300, exento) asentado en 6113 contra caja · pago
al exterior e47 de RD$1,000 con 27 % de ISR: 6112 al debe, 2114 RD$270 y caja
RD$730 al haber, queda «Pagado» · selector de retenciones con 15 %, 3 % y 27 % ·
carga limpia sin errores de consola ni 5xx en compras, detalle, registrar,
gastos, e43, panorama, cuentas por pagar, libro diario y reportes.

Durante la prueba aparecieron dos errores reales:

- Al pasar `pagos_proveedores.monto_cents` a BIGINT el asiento del pago sumaba
  texto («asiento descuadrado»). Corregido, y un asiento que falla ya no hace
  creer que el pago no se guardó (el barrido lo crea después).
- Cuentas por pagar no quitaba de la lista lo que se acababa de pagar hasta
  recargar la página. Ahora vuelve a consultar al terminar el pago.
- Los dos del formulario de gastos descritos arriba (ITBIS del 18 % en e43/e47 y
  pagos al exterior que nunca quedaban pagados).

Revisión en producción, solo lectura: ningún e43/e47 vivo lleva ITBIS (hay 6
borradores e43 y 1 e47, sin ITBIS) y ningún gasto con retención quedó
«Parcial», así que no hace falta corregir datos. Sí hay **1 venta** con
retención pagada por el neto que figura «Parcial»: las ventas no se tocaron.

En desarrollo, `/dashboard/gastos` dio 2 veces en unas 45 cargas un error de
hidratación de la tabla (React esperaba el `<tbody>`). No se pudo repetir a
propósito; el marcado es válido y el mismo patrón (tabla MUI en componente de
servidor) lo usan los reportes y el panel de admin.

## Pendiente

- Aprobación comercial (ACECF) de los e-CF recibidos y la bandeja
  `ecf_documents_recibidos` unificada con la de ecf-api.
- Pago de retenciones (IR-17 e IT-1) como obligación, y proporcionalidad del
  ITBIS (art. 349) calculada, no solo a mano.
- La prueba con un e-CF recibido real necesita un contribuyente en ecf-api (en el
  sandbox no hay); el lector del XML tiene pruebas unitarias.
- Ventas con retención: decidir si se saldan con el neto como los gastos (hoy la
  cartera cuenta el total) y revisar las tasas de «Otras rentas» y
  «Dividendos», que siguen en 10 %.
- Confirmar en un build de producción que el error de hidratación de la tabla
  de gastos no aparece.
