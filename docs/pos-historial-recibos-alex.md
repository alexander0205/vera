# POS — Historial de recibos (Fase 1 + 2)

Resumen para Alex: qué se construyó y qué decisiones fiscales se tomaron, por si
quiere cambiar algo. Rama `v2`. Commits `50e6fb9a` (Fase 1) y `dda4844e` (Fase 2).

## Qué se hizo

Nueva pantalla **`/pos/historial`**: tarjetas rectangulares clickeables con lo
cobrado en el turno de caja abierto. Cada tarjeta muestra nº de orden, hora,
cajero, total, cliente/mesa, tipo de orden y método(s) de pago. Debajo, un
tablero filtra por **método** (efectivo/tarjeta/transferencia/cuenta-estudiante/
crédito) y por **tipo de orden** (comer aquí/para llevar/delivery/mostrador).

Al tocar una tarjeta se abre el recibo (drawer) con botón **Ver/imprimir**
(reusa `/pos-ticket/[id]`) y, para admin/owner, acciones **Eliminar** y
**Unsettle**.

- **Tipo de orden**: se elige al cobrar. Con mesa (comanda) ofrece "Comer aquí";
  sin mesa ofrece "Mostrador". Nueva columna `ecf_documents.tipo_orden` (mig 0109).
- **Eliminar**: anula el recibo, revierte el cobro y restaura inventario.
- **Unsettle**: además reabre la comanda de la mesa para volver a cobrarla.

## Decisiones fiscales (para revisar si se quiere cambiar)

1. **Nº de orden = `ecf_documents.codigo`** (el counter por empresa que ya existía).
   No se creó numeración nueva. La tarjeta cae al `encf` si no hay código.

2. **`tipo_orden` es dato operativo, NO fiscal.** No entra al XML de la DGII ni al
   e-CF; solo clasifica el recibo para el historial. Columna nullable.

3. **El historial muestra "todo lo cobrado" del turno**, incluidos los tickets
   `sin-ncf` (demo) y borradores — no solo los e-CF fiscales.

4. **Anulación interna (sin-ncf / borrador / rechazado):** marca `ANULADO`,
   borra las filas de `pagos_recibidos` y restaura inventario. La **reversa de
   caja es automática** porque el cuadre del turno ya excluye los ANULADOS — no
   se toca el efectivo esperado a mano.

5. **e-CF fiscal YA ACEPTADO por la DGII: no se anula desde el POS.** La reversa
   formal es una **Nota de Crédito (tipo 34)**. El POS no la emite solo: redirige
   al formulario de NC existente (`/dashboard/notas-credito/nueva?padreId=…`)
   pre-enlazado a la venta, para que se revise y emita ahí. (Decisión tomada:
   handoff al form, no auto-emisión desde el POS.)

6. **Permiso `pos:anular`**: solo owner/admin por defecto. El cajero raso (rol
   `cajero` / `user`) NO puede anular ni reabrir sin ese permiso.

7. **No se borra la fila**: una venta anulada queda en el historial con badge
   "Anulado" (traza), no desaparece.

## Pendiente / no probado en dev

- **Unsettle** y el **handoff a Nota de Crédito** están implementados y con tipos
  correctos, pero no se pudieron probar en vivo en dev: el terminal de prueba no
  está en modo mesas, y no hay e-CF fiscal (todo es `sin-ncf` porque la
  `ECF_API_KEY` del sandbox da 401). Verificar cuando haya un entorno con DGII.
- La Fase 1 (ver + filtrar) y el **Eliminar** de Fase 2 sí se verificaron
  end-to-end en el navegador con datos reales.
