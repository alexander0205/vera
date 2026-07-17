# Changelog

Todos los cambios publicados en producción. Una entrada por cada push a main.
No se publican nombres de clientes, correos ni documentos: las notas se redactan
automáticamente (ver scripts/release-notes.mjs).

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


