# Changelog

Todos los cambios publicados en producción. Una entrada por cada push a main.
No se publican nombres de clientes, correos ni documentos: las notas se redactan
automáticamente (ver scripts/release-notes.mjs).

## v1.20.1 — 2026-08-12

### Otros

- Update support email in habilitation flow

## v1.20.0 — 2026-08-11

### Nuevo

- **caja**: metodo y direccion en movimientos de caja
- **productos**: editar variantes y form compartido crear/editar
- **pos**: vender variantes en el POS (Opcion B, por almacen)
  - El catalogo POS muestra productos con variantes usando la SUMA del stock de sus variantes EN EL ALMACEN de la terminal (product_variant_almacen_stock), y aparecen solo si tienen stock de variante asignado en ese almacen.
  - Al tocar un producto con variantes se abre el selector, que consulta el stock por el almacen de la terminal; cada variante es su propia linea (clave compuesta). El cobro manda variantId -> el descuento baja el stock de la variante en ese almacen.
  - Carrito, descuentos y ediciones operan por linea (lineKey).
- **inventario**: Opcion B — stock de variante por almacen
  - Nueva tabla product_variant_almacen_stock (variante x almacen) = fuente de verdad del stock de variantes; product_variants.stock_actual y products.stock_actual quedan como sumas denormalizadas. Migracion 0086.
  - Al crear un producto con variantes se siembra el stock inicial de cada una en el almacen por defecto del equipo.
  - descontarInventario/restaurarInventario: para ventas de variante el stock por-almacen se ajusta en product_variant_almacen_stock (no en product_almacen_stock, que es solo para productos sin variantes).
  - GET /api/productos/[id]/variants acepta ?almacenId= y devuelve el stock de la variante en ese almacen (sin el, stock global). Acepta pos:vender ademas de productos:ver.
  - El selector de variante en la factura pasa el almacen seleccionado.
- **productos**: variantes tambien en el popup de Productos y servicios
  - Se extrae la UI de variantes a un componente compartido VariantesEditor (components/productos) para no duplicar logica.
  - ModalNuevoProducto (Nueva factura) ahora usa el componente compartido.
  - El popup de Productos y servicios muestra el editor de variantes al CREAR un bien (al editar no, gestionar variantes existentes necesita UI aparte). Con variantes activas se oculta el bloque de stock manual y el backend fuerza controlaInventario y stock = suma de variantes.
- **pos**: vender variantes de producto en el punto de venta
  - Catalogo POS incluye productos con variantes (antes se excluian por no tener fila en product_almacen_stock). Su stock en la grilla es el GLOBAL (suma de variantes), no el del almacen: las variantes usan stock global en este MVP.
  - Al tocar un producto con variantes se abre el selector de variante; cada variante es su propia linea del carrito (clave compuesta producto+variante).
  - El cobro manda variantId por linea -> el descuento pega al stock de la variante.
  - Descuentos globales y ediciones de qty/precio ahora operan por linea (lineKey) en vez de por id de producto, para soportar varias variantes del mismo producto.
  - El endpoint de variantes acepta pos:vender ademas de productos:ver.
- **facturacion**: abrir caja desde factura + variantes de producto
  - Al guardar/emitir sin turno de caja abierto, el backend ya respondia 409 CAJA_SIN_TURNO (solo si la empresa usa el modulo de caja). El form ahora intercepta ese codigo y abre ModalAbrirCaja para abrir el turno sin salir de la factura; al abrir con exito reintenta el guardado. CAJA_TURNO_VENCIDO no entra al modal (hay que cerrar, no abrir).
  - Schema: products.variant_atributos (ejes por producto), tabla product_variants (una fila por combinacion, stock global propio) e inventory_movements.variant_id. Migracion 0085.
  - Crear producto: ModalNuevoProducto permite definir ejes (Talla/Color...) y generar combinaciones con stock/precio por variante.
  - Vender en factura: al elegir un producto con variantes se abre ModalSeleccionarVariante; la linea guarda variantId y el descuento pega al stock de la variante (con ajuste paralelo del stock global del producto).
  - descontarInventario y restaurarInventario ahora son variant-aware y simetricos.
  - Nuevo endpoint GET /api/productos/[id]/variants para el selector.

### Arreglado

- **inventario**: variante inexistente, guard server-side y stock que no deriva
- **dashboard**: usar 100dvh en el layout para evitar hueco al final en movil

### Otros

- Revert "feat(pos): vender variantes de producto en el punto de venta"

_1 commit(s) de mantenimiento no listados._

## v1.19.1 — 2026-08-11

### Arreglado

- **build**: apuntar el trace de sharp a los directorios reales del store
- miniaturas rotas en prod, permisos faltantes y correos en el repo

## v1.19.0 — 2026-08-11

### Nuevo

- **habilitacion**: renombrar wizard, nav condicional por ambiente, alertas por email
  - Renombra "Habilitación e-CF" a "Activar facturación electrónica" en el wizard mientras está pendiente; dentro de Configuración vuelve a "Habilitación e-CF" una vez el team llega a Producción.
  - El link vive arriba del nav (fuera de Configuración) mientras el ambiente DGII no sea Producción, y se mueve a Configuración una vez lo es. Fuente rápida: teams.habilitacion_completado_at (mismo fetch que el resto del nav, sin round-trip extra). Nuevo GET /api/habilitacion/ambiente-actual lee el ambiente real en ecf-api en paralelo y auto-sana ese flag para teams que llegaron a producción antes de que existiera.
  - Arregla el modal de intro apareciendo con progreso ya guardado: ahora se decide junto con la carga real del estado, no solo por localStorage.
  - Arregla navegación a fases anteriores tras completar el wizard (quedaba pegada a la pantalla de resumen) y la línea conectora del stepper (desalineada del centro del círculo, ahora también unificada entre desktop y mobile).
  - Alerta por email (Resend) como complemento de la alerta de Slack cuando el Set de Pruebas falla — 3 destinatarios por default, configurable via HABILITACION_ALERT_EMAIL (coma-separado).
- **habilitacion**: reconstruir el wizard de Habilitación e-CF a 15 pasos
  - Postulación: quita el sub-paso de espera de validación DGII, persiste el sub-paso exacto (no solo la fase) para retomar tras recargar.
  - Pruebas de Datos e-CF: reemplaza la simulación anterior por el flujo real de Set de Pruebas (subir Excel, sub-pasos de espera/éxito/error sin desglosar detalle, descarga solo XML).
  - Pruebas Simulación e-CF (nuevo): genera los 29 e-CF sintéticos vía ecf-api, con las mismas pantallas de espera/éxito/error.
  - Pruebas de Simulación Representación Impresa, Validación Representación Impresa, URL Servicios Prueba, Inicio/Recepción de pruebas (e-CF y Aprobación Comercial), Verificación Estatus (nuevos, portados de sus equivalentes en /admin).
  - Declaración Jurada: reemplaza la firma/envío simulados por firma real (firmarXml) + descarga funcional + confirmación de envío manual.
  - Cambia el ambiente TesteCF→CerteCF al completar Postulación y CerteCF→Producción al completar la Declaración Jurada.
  - Corrige URLs de referencia para reflejar el dominio actual en vez del cacheado por ecf-api.
- **habilitacion**: endpoints team-scoped para Set de Pruebas y Simulación
  - ambiente: cambia TesteCF/CerteCF/Produccion del contribuyente propio.
  - contexto: datos del team + codigoPublico + webhookBaseUrl (reconstruida contra el dominio actual de ECF_API_URL, no el cacheado por ecf-api).
  - set-pruebas/*: subir Excel, estado/casos, re-emitir, borrar, descargas (ZIP <250K solo XML, paquete completo con filtro opcional pdfOnly).
  - simulacion/*: iniciar/reiniciar/consultar la Simulación e-CF (29 casos sintéticos, sin Excel).
  - emisiones/[id]/pdf: proxy de descarga con verificación de dueño.
  - ownership.ts: verifica que un runId pertenezca al team antes de dejarlo operar sobre él — necesario porque ecf-api no acota estos endpoints por team.
- **habilitacion**: alertar por Slack cuando el Set de Pruebas falla

### Arreglado

- **habilitacion**: cerrar tres huecos de autorización

_2 commit(s) de mantenimiento no listados._

## v1.18.1 — 2026-08-07

### Arreglado

- **comprobantes**: sharp tumbaba /api/pagos/adjuntos en producción
  - sharp pasa a carga perezosa con fallo tolerado. Si el binario no está, el comprobante se guarda igual: se pierde la miniatura (la galería usa el original) y el borrado de EXIF. Un módulo nativo no debe poder tumbar un endpoint que no lo necesita.
  - pnpm.supportedArchitectures instala también los binarios de linux-x64, que es lo que corre en Vercel.

## v1.18.0 — 2026-08-07

### Nuevo

- **pagos**: adjuntar comprobantes de pago (S3 privado)
  - Bucket S3 privado (BPA total, SSE-AES256, ACLs desactivadas, solo TLS), un usuario IAM por entorno scopeado a su prefijo y sin ListBucket.
  - El binario NUNCA sale por una URL de S3: se sirve por /api/pagos/adjuntos/[id], que valida sesión y empresa antes de leer. Sin presigned URLs (son un token bearer en el query string) y sin presigned PUT (se saltaría la validación de tipo y tamaño).
  - Miniatura de 300px generada del binario ya guardado: la galería baja 5 KB en vez del original. ETag + 304 resueltos contra Postgres, sin tocar S3.
  - Las imágenes se reescriben sin EXIF: una foto de comprobante trae el GPS de la casa del cliente.
  - pago_adjuntos cuelga del DOCUMENTO, no de la fila del ledger: el detalle de factura borra y reinserta el pago completo, y el cobro con mora se parte en varias filas. pago_recibido_id queda ON DELETE SET NULL.
  - Índice único (team, doc, sha256) + advisory lock por documento: sin eso, subidas simultáneas duplicaban filas y se saltaban el tope de 5.
  - teams.metodos_exige_comprobante: métodos que obligan a adjuntar. Se valida en las tres puertas de registro manual de cobros. No aplica al POS ni al cobro al emitir: trabaría la caja de mostrador.
  - Permiso nuevo pagos:adjunto-eliminar, solo owner y admin.
  - Facturas y Cuentas por cobrar: código corto con el completo en el tooltip, cliente más angosto, y la columna de acciones fija al borde derecho para que no se pierda al desplazar en pantallas chicas.

## v1.17.0 — 2026-08-07

### Nuevo

- **permisos**: controlar quién puede cambiar precios al facturar
  - precio, descuento e ITBIS de cada línea quedan en solo lectura;
  - no se pueden abrir líneas libres — hay que elegir del catálogo, porque si no la restricción se esquiva creando un producto al vuelo;
  - en el punto de venta se apagan el precio manual y el descuento global.

## v1.16.0 — 2026-08-07

### Nuevo

- **cobranza**: unificar la tabla de mora y limpiar los listados
- **cobranza**: simplificar tarjeta expandible de factura y reubicar mora en el detalle
  - Se elimina el titulo redundante, la barra de progreso y los tiles Subtotal/ITBIS/Total (ya son columnas del listado).
  - Tabla "Pendientes" cuadrada, con bordes definidos y predominio de grises (como pidio Alex): una fila por documento cobrable (capital de la factura si no esta saldado + cada nota de debito por mora impaga) y "Total pendiente". Indentada para arrancar bajo la columna "Codigo", con padding comodo.
  - Estado "Sin pendientes" cuando no falta nada por cobrar.
  - La info general de mora (aviso "capital saldado, mora pendiente" + mora aplicada + proxima mora automatica) se mueve a una tarjeta "Mora" bajo "Datos del comprador", descargando el sidebar.
  - Las notas de debito por mora pasan a su propia tarjeta en el sidebar, justo debajo de "Notas asociadas".
  - Se elimina la seccion Mora recargada del sidebar (fusionaba ambas cosas).
  - Se quita la tarjeta CTA duplicada "Crear nota" del sidebar; crear NC/ND queda solo en el menu de acciones (3 puntos) del encabezado.
- **cobranza**: mora en PDF (factura<->ND) + facturas generadas expandibles
  - PDF: caja "Recargo por mora" con referencia a la factura de origen (en la ND) y seccion "Recargos por mora" (tabla + pendiente) en la factura padre.
  - API pdf/factura/[id]: query moraOrigen (ND -> factura padre) / moras (factura -> NDs).
  - API facturas: devuelve moraNotas[], moraAplicada, moraPendiente, pagado (Number).
  - Recurrentes: expandir plan carga sus facturas generadas via nuevo endpoint api/facturas-recurrentes/[id]/generadas (esencial + mora por factura).
- **cobranza**: jerarquia factura-mora, estado "Mora pendiente" y resumen de pago
  - Cuentas por cobrar: la factura ya no desaparece cuando su capital esta pagado pero le queda una ND de mora sin saldar (getCuentasPorCobrar amplia el WHERE con OR EXISTS mora pendiente). Antes esa factura y su nota quedaban invisibles.
  - DataTable: soporte generico de filas hijas expandibles (renderExpanded / rowExpandable) con chevron.
  - AR: cada factura expande sus ND de mora (codigo, estado, saldo, link); badge "Mora pendiente" cuando el capital esta pago; resumen del pago recien registrado (recibido / a factura / a mora / queda pendiente).
  - Detalle de factura: cada ND de mora muestra estado (Pendiente/Parcial/ Pagada) y saldo; banner "capital pago, mora sigue pendiente".
  - Listado de facturas: badge "Mora pendiente" en vez de "Pagada" cuando el capital esta saldado pero hay mora impaga (nuevo campo moraPendiente).
- **mora**: seed demo con perfil fijo (gracia, tope, max periodos)
- **config**: dias personalizados en la periodicidad de la mora
- **config**: rediseno intuitivo de "Recargo por mora" (mockup de Alex)
  - Toggle "Activado" con estado visible.
  - Secciones numeradas: 1 Cuanto cobrar, 2 Cuando empezar, 3 Poner limites (opcional).
  - Panel "Asi funciona (ejemplo)" dinamico: arma un ejemplo paso a paso sobre una factura de RD$10,000 con la config actual (fechas, montos).
  - Franja "Resumen de tu configuracion" (recargo, inicia, se repite, limites).
  - Limites: los campos tope y maximo pasan a dropdowns con presets y opcion "Sin limite" (reemplaza el toggle de limites anterior, siguiendo el mockup).
- **factura**: mostrar el vencimiento en el detalle (Resumen)
- **factura**: restaurar Plazo de vencimiento + campo de fecha read-only
  - DetallesSection: reintroduce el input de dias (setDiasParaPago) y agrega el input date read-only atado a fechaLimitePago; el pill de abajo queda solo con la nota de mora (la fecha ya se ve en el campo).
  - NuevaFacturaForm: vuelve a pasar setDiasParaPago y restaura el mensaje de validacion de credito.
- **mora**: checkbox "No volver a mostrar" en el aviso de contado sin pago
- **mora**: seccion "Mora" en el detalle con lo aplicado y la proxima
  - Mora aplicada hasta ahora: total + cantidad de notas.
  - Proxima mora automatica: fecha e importe, o "Sin cargos programados" cuando no hay periodicidad o ya se cobro el unico periodo.
  - Lista de las notas de debito por mora emitidas.
- **mora**: mora siempre sobre el saldo de la factura (quitar mora sobre mora)
  - Config: se quita el toggle "Mora sobre mora (base compuesta)". La periodicidad se mantiene (cada cuanto se cobra). recargo_mora_compuesta se guarda siempre en false; la columna queda dormida por si el caso compuesto se revalida a futuro con contabilidad.
  - El motor ya calculaba simple con compuesta=false; sin cambios de logica.
- **mora**: limites de mora (tope + max cobros) detras de un toggle
- **mora**: interfaz de recargo por mora mas clara e intuitiva
  - Periodicidad: chips de acceso rapido (Una sola vez, Cada 15/30/60 dias) ademas del campo en dias, con una etiqueta viva que traduce el valor ("Se repite cada 30 dias (mensual) mientras siga vencida").
  - Menos jerga: se quita "cron/UTC" y "basis points" de los textos de ayuda.
- **mora**: mostrar la proxima mora automatica en el detalle de la factura
  - nota-debito-mora.ts: nueva `previsualizarMoraDeFactura` (read-only) que reusa `calcularMora`, asi que el monto coincide con lo que cobraria el cron. Distingue: inactiva, no_aplica (sin saldo/vencimiento/tope/etc.) y pendiente (fecha + monto). Para facturas aun no vencidas proyecta el primer periodo tras la gracia.
  - GET /api/facturas/[id]/nota-debito-mora: devuelve ese preview.
  - Detalle: tarjeta "Proxima mora automatica" con fecha e importe, junto a la accion manual y las notas de mora existentes.
- **mora**: plazo desde config central + aviso al guardar contado sin pago
  - Se quita el campo editable "Plazo de vencimiento" de Nueva factura y de Factura recurrente. El vencimiento se toma del plazo de pago por defecto de la empresa (Configuracion). Al elegir credito se muestra de forma informativa el plazo ("Credito a N dias · vence el DD/MM/YYYY") y la mora.
  - El mensaje de validacion de credito ahora apunta a la configuracion en vez de a un campo que ya no existe.
  - Al guardar una factura de venta marcada "de contado" que queda sin pago, con mora configurada, se muestra un pop-up: permite cambiar a credito o continuar de contado. Mismo aviso en Factura recurrente (plan de contado).
- **mora**: eliminar personalizacion de mora por factura y por plan
  - schema.ts: quita las 8 columnas override (mora_porcentaje, mora_dias_gracia, mora_modo, mora_monto_cents) de ecf_documents y facturas_recurrentes. Se conservan mora_periodo, los indices del cobro periodico y las columnas de mora del team.
  - migracion 0078: deja de crear mora_modo/mora_monto_cents (no estaba desplegada aun); mantiene mora_periodo + indices + columnas de team.
  - migracion 0079 (nueva): DROP ... IF EXISTS de las 8 columnas override, idempotente en prod (solo tenia porcentaje/gracia) y en ramas donde 0078 alcanzo a crear modo/monto.
  - nota-debito-mora.ts: la config de mora viene solo del team.
  - recurrente.ts: deja de propagar los 4 campos de override a la factura.
  - recargo.ts: quita el select de moraDiasGracia (nunca se usaba; la gracia la decide calcularMora).
  - API POST/PUT de facturas-recurrentes: sin validacion ni escritura de los overrides.
  - Form recurrente + editar: elimina la seccion "Personalizar mora para este plan"; el resumen de mora usa solo la config de la empresa.
- **mora**: overrides de recargo por plan recurrente
  - API POST/PUT /api/facturas-recurrentes: aceptan y validan moraModo/moraMontoCents/moraPorcentaje/moraDiasGracia.
  - recurrente.ts: propaga moraModo y moraMontoCents a la factura generada (antes solo porcentaje y gracia); nota-debito-mora.ts ya los lee como override por factura, con prioridad sobre el team.
  - Form recurrente: seccion "Personalizar mora para este plan" (solo credito + empresa con mora activa), con toggle + modo + monto/% + gracia, y la pildora refleja la config efectiva via describirMora.
  - editar/page.tsx: carga los 6 campos de mora de la empresa (con narrowing de recargoMoraModo) y los 4 overrides del plan.
- **mora**: config completa, aviso en recurrentes y fix base compuesta
  - Config: selector modo fijo/porcentaje, monto fijo, periodicidad, base compuesta, tope y máx períodos, gracia revivida (ya no se hardcodea a 0) y vista previa en vivo con describirMora.
  - Aviso de mora en el form de facturas recurrentes; el page ahora carga los 6 campos nuevos y estrecha recargoMoraModo a la unión.
  - Fix: el subquery de `pagado` en nota-debito-mora.ts interpolaba ${ecfDocuments.id}, que Drizzle rinde sin calificar ("id"); como pagos_recibidos tambien tiene columna id, casaba pr.ecf_document_id = pr.id -> SUM siempre 0 -> toda mora contaba impaga y la base compuesta sobrecobraba moras ya pagadas. Ahora LEFT JOIN + GROUP BY.
  - scripts: apply-migration-0078 (aplica+verifica en information_schema) y test-mora-engine (6 escenarios contra DB, 15/15).
- **mora**: monto fijo, cobro periódico, base compuesta y topes
  - Modo: porcentaje (bps) o monto fijo en centavos. Un colegio cobra "RD$500 por pago tardío" y una empresa de servicios cobra un %; forzar a uno al lenguaje del otro produce configuraciones absurdas.
  - Periodicidad en días: 0 = una sola vez (lo de hoy), 30 = mensual.
  - Base compuesta: el cargo del período N incluye las moras impagas anteriores. Es la "mora sobre mora" del caso del colegio. Si pagó la mora previa, no se capitaliza.
  - Topes: % máximo de mora acumulada sobre el documento y máximo de períodos. Sin ellos una deuda al 10% mensual compuesto se vuelve impagable en un año.

### Arreglado

- **migraciones**: renumerar las de mora a 0080/0081
- **mora**: proyectar la proxima mora en facturas ya vencidas
- **factura**: evitar desborde del control de condicion de pago

_1 commit(s) de mantenimiento no listados._

## v1.15.5 — 2026-08-07

### Arreglado

- **pdf**: el pie de la DGII tapaba las líneas y partía la tirilla

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
