# Changelog

Todos los cambios publicados en producción. Una entrada por cada push a main.
No se publican nombres de clientes, correos ni documentos: las notas se redactan
automáticamente (ver scripts/release-notes.mjs).

## v1.15.4 — 2026-08-05

### Arreglado

- **pdf**: las columnas de montos se encimaban en la factura

## v1.15.3 — 2026-08-05

### Arreglado

- **listados**: abrir el detalle desde cualquier punto de la fila

## v1.15.2 — 2026-08-05

### Arreglado

- **cotizaciones**: quitar la marca de agua BORRADOR del PDF

## v1.15.1 — 2026-08-05

### Arreglado

- **cotizaciones**: beneficiarios por línea + convertir siempre visible

## v1.15.0 — 2026-08-05

### Nuevo

- **configuracion**: términos y condiciones por defecto
- **cotizaciones**: enviar por correo desde la lista
  - El e-NCF solo se muestra cuando existe. Las facturas sin comprobante fiscal guardan un placeholder (BOR-XXXXXXXX) en esa misma columna, y se estaba imprimiendo como si fuera un número fiscal real.
  - El encabezado y el asunto dicen qué es el documento según su código: una nota de crédito no es una factura.

### Arreglado

- **cotizaciones**: borrar términos o notas no se guardaba

## v1.14.0 — 2026-08-05

### Nuevo

- **email**: los comprobantes salen a nombre de la institución

## v1.13.2 — 2026-08-05

### Arreglado

- **email**: generar el PDF en proceso en vez de pedirlo por HTTP

## v1.13.1 — 2026-08-05

### Arreglado

- **cotizaciones**: renumerar migración 0075 duplicada y no tragarse el error
  - Renumera la migración a 0078 (y su script) para que la colisión no vuelva a esconderla. El journal de drizzle solo llega a 0004; de ahí en adelante las migraciones se corren a mano, así que nada avisa de un archivo que se saltó.
  - El formulario lee el body con `res.text()` y parsea dentro de un try, cayendo al status HTTP cuando no hay JSON que parsear.

## v1.13.0 — 2026-08-04

### Nuevo

- **dgii**: notas internas sin e-NCF y quitar el badge de ambiente
- **dgii**: ocultar y bloquear comprobantes fiscales fuera de Producción
  - lib/ecf-api/ambiente.ts — getAmbienteTenant() con caché de 5 min por instancia. Falla cerrado: si ecf-api no responde, no se emite. Un comprobante emitido contra el ambiente equivocado no se puede des-emitir.
  - /api/ecf/emitir y /api/facturas/[id]/emitir-ecf — 403 si el tenant no está en Producción. También bloquea crear borradores de VENTA con tipo fiscal: solo existirían para emitirse después.
  - Excepción para el Set de Pruebas de habilitación, que corre en TesteCF por definición — sin ella ninguna empresa podría llegar a Producción. Se marca con `origen:'habilitacion'` y exige 'configuracion:gestionar'; NO se apoya en skipRangeValidation, que cualquier cliente puede poner.
  - useTiposDisponibles — esconde los tipos de venta fiscal fuera de Producción. Asume "no Producción" mientras carga.
  - POS y terminales POS tenían los <option> hardcodeados y su API aceptaba `z.string().max(10)` sin enum: un terminal con default '31' se lo heredaba a cada venta. Ahora enum + gate de ambiente.
  - Cotización→factura hardcodeaba '32'; fuera de Producción nace sin-ncf.

### Arreglado

- **dgii**: cerrar el gate de ambiente también en facturas recurrentes

## v1.12.0 — 2026-08-03

### Nuevo

- **pagos**: alerta de método de pago configurable por empresa + fix pantalla de éxito

## v1.11.2 — 2026-08-03

_1 commit(s) de mantenimiento no listados._

## v1.11.1 — 2026-08-03

### Arreglado

- **cxc**: mostrar en cuentas por cobrar los borradores con e-NCF real

## v1.11.0 — 2026-08-03

### Nuevo

- **ui**: confirmación antes de convertir cotización y generar mora
- **cotizaciones**: convertir a factura disponible desde el inicio
- **cotizaciones**: nueva cotización reusa el form de factura sin pago
  - page.tsx server component con gate cotizaciones:gestionar + perfil empresa
  - guarda ítems en shape rico ItemLinea; convertir/route lee ambos shapes
  - migración 0075: cols retenciones/comentario/pie_factura en cotizaciones

### Arreglado

- **ui**: el modal de confirmación abre tras cerrar el dropdown
- **cotizaciones**: detalle y PDF normalizan shape de ítems rico/viejo
- **cotizaciones**: editar reusa el form nuevo (arregla items NaN y crash)
- **cotizaciones**: Resumen vuelve al rail derecho (misma posición que factura)
- **facturas**: al anular, el pago no cuenta en ninguna vista
  - reportes: ventasPorMetodo y pagosPorUsuario (add join + estado<>ANULADO)
  - getPagosListado (add filtro estado)

## v1.10.1 — 2026-08-03

_1 commit(s) de mantenimiento no listados._

## v1.10.0 — 2026-08-01

### Nuevo

- **recurrentes**: permitir planes sin comprobante fiscal (sin-ncf)
  - Migración 0076: ensancha tipo_ecf a varchar(10). ecf_documents.tipo_ecf ya era varchar(10), el cuello estaba solo en el plan.
  - El generador emite encf vacío para sin-ncf en vez de BOR-sin-ncf-XXX, que mostraría un identificador con pinta de e-NCF en un documento que nunca va a tener uno. Mismo criterio que el alta manual.
  - Whitelist de tipoEcf en POST y PUT: un valor inválido ahora responde 422 en lugar de reventar como 500. La lista vive en lib/ecf/categorias.ts para no duplicarla entre las rutas y el formulario.
  - Opción "Sin NCF — factura interna" en el selector del formulario, que ya usan tanto el alta como la edición.

## v1.9.0 — 2026-07-30

### Nuevo

- **pagos**: permiso y toggle admin/owner para la alerta de método de pago
  - Permiso 'pagos:config-alerta' (owner+admin) en roles.ts + catálogo, visible en la matriz de permisos.
  - Columna teams.alerta_metodo_pago_activa (default true) + migración 0075.
  - Config: card "Alerta de método de pago" gateada por el permiso, guardado instantáneo vía endpoint dedicado /api/equipo/alerta-metodo-pago (gateado por userCan, aparte del perfil owner-only). GET perfil expone el flag.
  - POS y factura leen el flag (default ON): si está apagado, el cobro se finaliza sin pedir reconfirmación del método.
- **pagos**: alerta double-check del método de pago
  - ConfirmarMetodoPagoDialog: componente presentacional reutilizable que pone el método al frente; cada pantalla arma sus líneas.
  - POS (ModalCobro): confirmar() guarda el cobro pendiente y abre el double-check; cubre método simple, monedero y pago dividido.
  - Factura nueva: gate al inicio de emitir() cuando hay pago con monto>0; va antes de la traza anti-duplicados para no registrar submits fantasma.

### Cambios internos

- **pagos**: alerta de método de pago por permiso, sin toggle de empresa
  - Columna teams.alerta_metodo_pago_activa + migración 0075 + apply script.
  - Endpoint /api/equipo/alerta-metodo-pago y su lectura en el perfil.
  - Card "Alerta de método de pago" en Configuración de empresa.
  - Factura: usePermissions().can('pagos:alerta-metodo') (cubre nueva/editar/NC/ND).
  - POS: hasPermission('pagos:alerta-metodo') server-side, mismo prop threadeado.

## v1.8.1 — 2026-07-30

### Arreglado

- **auth**: el reset de contraseña fallaba con emails que tenían mayúsculas
  - Normaliza el email al escribirlo: schemas de signIn/signUp, invitación de equipo y alta de empresa desde el panel admin.
  - forgot-password compara con lower() para tolerar filas viejas.
  - assertSent() lanza cuando Resend devuelve error, para que el catch de la ruta lo registre en vez de perderlo.
  - Migración 0075: normaliza users e invitations, e índice único sobre lower(email) para que no vuelva a entrar sucio.

## v1.8.0 — 2026-07-30

### Nuevo

- **contabilidad**: anulación de e-NCF por rango ante DGII (ANECF)
  - Tabla `anulaciones_ncf` (migración 0074): tramo, estado, trackId, respuesta DGII y autor de cada envío. Solo los tramos ACEPTADOS cuentan como anulados.
  - `revisarTramo` inspecciona sin enviar y recorre por bloques de 1000, que es el tope de `consultarRango`. Sin el chunking un tramo de 5.000 se validaba solo en sus primeros 1.000 y el resto se anulaba sin revisar.
  - `anularTramo` revalida antes de enviar (el preview envejece), persiste el registro ANTES de llamar a DGII y lo marca ERROR con el payload crudo si falla, para no dejar envíos huérfanos.
  - Bloquean el envío: ACEPTADO, ACEPTADO_CONDICIONAL, EN_PROCESO, ANULADO, EN_DGII_SIN_REGISTRO y RESERVADO (hay un borrador usando el número). Cada bloqueo trae su explicación y links a la factura, la NC y la verificación DGII.
  - La consulta muestra los anulados como ANULADO_DGII. Si el número además tiene rastro local gana el estado local y la anulación se añade como nota.

## v1.7.0 — 2026-07-28

### Nuevo

- **reportes**: imprimir/guardar PDF de la vista además de Excel
  - print-button.tsx: botón client con window.print().
  - report-shell.tsx: .print-area envuelve el contenido; breadcrumb, botones y filtro marcados .no-print; el título/descripción entran en el PDF.
  - globals.css: print-color-adjust: exact para conservar los colores de chips de antigüedad, KPIs y barras en el PDF.

## v1.6.0 — 2026-07-27

### Nuevo

- **facturas**: fecha de emisión editable en sin-ncf para admin/owner
  - roles: permiso nuevo en el type, en owner+admin y en PERMISSION_CATALOG.
  - api/ecf/emitir: el schema acepta `fechaEmision`; el servidor solo la honra cuando el tipo es sin-ncf y el rol tiene el permiso (defensa en profundidad). Aplica al insert de borrador y al update. e-CF fiscal: la fecha la fija la DGII, nunca el usuario. Se usa T12:00:00 para evitar corrimiento UTC/RD.
  - CompactHeader: el campo Fecha pasa a input de calendario cuando el rol tiene permiso y el documento es sin-ncf; en cualquier otro caso queda de solo lectura.
  - Flujo de edición: BorradorInicial y la página de editar ahora incluyen fechaEmision, de modo que al reabrir un borrador se restaura la fecha guardada y no se pisa con la de hoy al re-guardar.

## v1.5.5 — 2026-07-23

### Arreglado

- **cron**: sincronizar padrón RNC semanalmente (domingos 4am)

## v1.5.4 — 2026-07-22

### Arreglado

- **pos**: propagar el e-NCF reservado en la venta con monedero

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
