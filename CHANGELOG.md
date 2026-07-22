# Changelog

Todos los cambios publicados en producción. Una entrada por cada push a main.
No se publican nombres de clientes, correos ni documentos: las notas se redactan
automáticamente (ver scripts/release-notes.mjs).

## v1.5.3 — 2026-07-22

### Arreglado

- **emision**: reintentar con el mismo e-NCF desde el formulario y el POS

## v1.5.2 — 2026-07-22

### Arreglado

- **cxc**: excluir de cuentas por cobrar los borradores que solo reservan e-NCF

## v1.5.1 — 2026-07-21

### Arreglado

- **emision**: reservar el e-NCF en un borrador cuando falla /api/ecf/emitir

## v1.5.0 — 2026-07-20

### Nuevo

- **contabilidad**: reescribir la consulta en lenguaje de contabilidad
- **contabilidad**: modulo de secuencias y consulta de e-NCF

## v1.4.4 — 2026-07-19

### Arreglado

- **emision**: permitir reuso del e-NCF aunque el fallo haya dejado emisionId

## v1.4.3 — 2026-07-19

### Arreglado

- **emision**: reservar e-NCF y verificar antes de darlo por fallido

## v1.4.2 — 2026-07-17

### Arreglado

- **admin**: serializar fechas a ISO en templates sql crudos

## v1.4.1 — 2026-07-17

### Arreglado

- **reportes**: filtro de fecha con navegación client-side

## v1.4.0 — 2026-07-17

### Nuevo

- **reportes**: contabilizar ventas sin-ncf y corregir borde de fechas
  - Reportes gerenciales (KPIs, tendencia, por-producto/cliente/tipo/usuario, ventas generales, cuentas por cobrar) ahora cuentan las ventas sin-ncf (tickets del POS sin comprobante fiscal) ademas de los e-CF emitidos a la DGII. Nuevo predicado pVentaValida en lib/reportes/shared.ts.
  - por-producto deja de leer la MV (stale hasta 6h) y calcula en vivo.
  - 606/607/609 filtran solo e-CF emitido a DGII (antes incluian borradores); ITBIS a pagar sigue solo-DGII. maestros y dashboard admin incluyen sin-ncf.
  - Fix TZ: pRango compara fecha_emision::date contra la fecha calendario RD para no clipar el primer dia del rango (fecha_emision es hora-pared naive).
  - Nuevo dashboard admin con visibilidad global (facturacion, modulos, top empresas, cartera, actividad).

## v1.3.1 — 2026-07-17

### Arreglado

- **pagos**: en produccion la pasarela solo puede apuntar a produccion

## v1.3.0 — 2026-07-17

### Nuevo

- **pagos**: links de pago con CardNet y Azul
  - lib/pagos: clientes CardNet (sesión + 3DS hosted) y Azul (Payment Page + AuthHash), config por empresa con secretos cifrados (AES-256-GCM).
  - Solo integraciones hosted: nunca tocamos la tarjeta (sin alcance PCI).
  - El resultado se verifica server-side (CardNet reconsulta la sesión; Azul valida la firma de respuesta); nunca se marca pagado por el redirect.
  - marcarLinkPagado es idempotente y a prueba de pérdida: persiste el cobro antes de tocar el ledger y reconcilia aparte, así un callback repetido o un fallo al registrar no duplica ni pierde el pago.
  - Cotización pagada no auto-emite e-CF: una falla en DGII perdería el cobro.
  - Azul queda oculto tras NEXT_PUBLIC_AZUL_ENABLED (falta verificar E2E con Auth1/Auth2 reales). El simulador no existe en producción.

### Arreglado

- **facturas**: quitar flechas del spinner en las líneas de la factura
- **auth**: la sesión se caía en dev y devolvía 500 sin cuerpo

### Documentación

- **novedades**: novedades del cliente para links de pago

## v1.2.0 — 2026-07-17

### Nuevo

- **novedades**: página de novedades para el cliente + novedad obligatoria por release
  - /dashboard/novedades muestra qué cambió en cada versión, en lenguaje de cliente. El contenido se escribe a mano en content/novedades.json — no puede derivarse de los commits porque son otra audiencia.
  - La versión del sidebar ahora enlaza ahí: ver el número y querer saber qué cambió es el mismo gesto, así que no se agrega otro item al menú.
  - El release FALLA si content/novedades.json no trae novedades pendientes. Sin eso la regla 'toda subida le explica al cliente qué cambió' dura tres semanas.
  - El autor no elige el número: escribe en 'pendiente' y el release le asigna la versión y la fecha. Al escribir todavía no se sabe si el push será patch o minor.
  - Las novedades pasan por el mismo redactor que el changelog: si traen un correo, un RNC o el nombre de un cliente, el release se cae.

## v1.1.0 — 2026-07-17

### Nuevo

- **caja**: guard de turno, límite configurable y detalle del cuadre
  - /api/clientes matchea también por `dependientes` (nombre, apellido o nombre completo). En colegios se busca al acudiente por el nombre del hijo, no por el suyo. Un solo endpoint alimenta los 3 buscadores.
  - Los dropdowns muestran el beneficiario que hizo match, para explicar por qué aparece un contacto cuyo nombre no se parece al término.
  - Antes solo se bloqueaba la emisión. Guardar borrador, emitir un borrador vía emitir-ecf, y cobrar (factura y cuenta por cobrar) pasaban sin turno, metiendo dinero que ningún cierre reclamaba.
  - lib/caja/guard.ts es la fuente única del bloqueo. Sin excepción por rol: owner y admin también abren su turno.
  - emitir-ecf además ata turnoCajaId: bloquear sin atar no arreglaba nada.
  - Fuera de alcance a propósito: el cron de recurrentes y el import masivo corren sin usuario, así que nunca tendrían turno.
  - caja_limite_horas / caja_gracia_horas entran en NULL. La migración no le cambia el comportamiento a nadie; se activa por empresa desde /admin/empresas/[id]. Un default con número habría bloqueado a 6 cajeros con turnos largos el día del deploy.
  - Contador en el header solo dentro de la ventana de aviso, y toasts una vez por hito. Pasado el límite hay gracia; pasada la gracia, no se factura hasta cerrar.
  - Cerrar caja no pasa por el guard: un turno bloqueado siempre puede cerrarse.
  - Aprobaciones mostraba 3 números; para saber qué pasó había que abrir la hoja de impresión en otra pestaña. Ahora el detalle va inline.
  - Totales por método marcando cuál entra a la gaveta: sólo el efectivo cuadra contra el conteo físico.
  - Facturado vs cobrado — destapa lo vendido a crédito, que el cuadre de efectivo no refleja porque nunca movió dinero.
  - Agregados + sólo excepciones (anulados y saldos), no el listado: un turno puede tener cientos de comprobantes.
  - Fix: un cierre exacto se pintaba "Faltante: RD$0.00" en rojo — faltaba el caso diferencia cero. Un rojo que miente enseña a ignorar el rojo.
