# Contabilidad — de la cartera al motor contable y sus reportes

> **Base de este PR: `feature/administracion-escolar`, no `main`.**
> Esta rama sale de escolar, que todavía no está en `main`. Con esta base el diff
> son los 29 commits de contabilidad; contra `main` serían 100 mezclados con
> escolar. Cuando escolar se merguee, GitHub reapunta este PR a `main` solo.
>
> ⚠️ **Escolar debe mergearse con "Create a merge commit"** (lo que ya hace el
> repo), no con squash. Un squash reescribe los SHA de escolar, el merge-base no
> se mueve y este PR queda con conflictos en cada archivo que escolar tocó.

El plan `docs/plan-contabilidad-vera.md` completo hasta donde se acordó llegar:
los 6 pasos, con el Paso 6 limitado a los **tres reportes contables** (libro
diario, mayor general y balance de comprobación). Quedan fuera a propósito el
estado de resultados, los reportes de cartera —que salieron casi enteros en el
Paso 1— y las exportaciones CSV/PDF.

**Ninguna factura existente cambia de comportamiento, y el motor de facturación
no se toca.** Los asientos se generan desde un botón, leyendo facturas y pagos
que ya existen — no hay ningún gancho en el flujo de emisión. Todo el módulo es
aditivo: cinco migraciones (`0082`–`0086`), cuatro que solo crean tablas nuevas y
una que añade dos columnas a una tabla propia. **El Paso 6 no necesitó ninguna**:
un reporte no guarda nada, solo lee los asientos.

**70 archivos, +10835 / −243.**

---

# Paso 1 — Cartera y trazabilidad de cobros

- Permisos propios `contabilidad:ver` / `:gestionar` / `:configurar`. Antes el
  grupo Contabilidad no tenía permiso propio: cualquiera con acceso al dashboard
  veía Secuencias y Consulta de e-NCF.
- **Saldo calculado en SQL** (CTE), con filtros, orden y paginación en servidor.
- Antigüedad de saldos por cubetas (por vencer / 1-30 / 31-60 / 61-90 / 90+),
  clicables para filtrar.
- Panel de detalle que *explica* el saldo: total, pagado, notas de crédito, mora,
  más el historial de movimientos.
- Gestión de cobro: contactos, notas internas y promesas de pago (migración `0082`).
- Exportar a Excel respetando los filtros activos.
- Recordatorios de pago por correo **en dos pasos**: previsualiza primero, solo
  envía tras confirmación explícita.
- Tira de promesas sobre la antigüedad: cuántas pendientes, cuánto comprometido,
  cuántas incumplidas.

## El arreglo central

`getCuentasPorCobrar` calculaba el saldo **en JS después del fetch**, así que el
`LIMIT` recortaba antes de descartar las filas con saldo 0. Con más de ~2000
documentos abiertos **la cartera se truncaba en silencio** y los totales salían
incompletos, sin ningún aviso en pantalla.

Ahora el saldo, el vencimiento y los días vencidos se calculan en SQL y el filtro
`saldo > 0` corre **antes** del `LIMIT`. Los totales salen de una agregación sobre
el mismo CTE, así que cubren toda la cartera filtrada y no la página visible.

## Cambios que tocan producción — requieren tu decisión

### 1. El reporte de antigüedad va a mostrar cifras más bajas

`getAgingCxC` tenía su propia consulta del saldo, distinta de la de la pantalla de
cuentas por cobrar. Las dos le daban **números diferentes al mismo usuario para lo
mismo**. Tres causas:

1. **No restaba las notas de crédito** → inflaba la cartera.
2. Otra definición de cobrable (solo e-CF aceptados) → dejaba fuera borradores con
   cobro en curso que la pantalla sí muestra.
3. Contaba las ND de mora como filas propias en vez de agruparlas en su factura
   padre → el conteo de facturas pendientes salía alto.

Ahora delega en `getCuentasPorCobrar`: una sola definición de saldo y de cobrable.

**Impacto medido (team 9): de RD$78,295 a RD$77,245** — RD$1,050 menos (RD$550 son
notas de crédito que la consulta vieja ignoraba; el resto, las otras dos causas).
Verificado después del cambio: ambas pantallas dan **RD$77,245 / 67 filas**,
diferencia RD$0.00.

Afecta `/dashboard/reportes/cuentas-por-cobrar` y
`/api/reportes/export?report=cuentas-por-cobrar`.

**Decisión tuya:** el número anterior estaba mal, pero si alguien concilió contra
él va a notar la baja. Revertir es aislado — una sola función en
`lib/reportes/queries.ts`.

### 2. Fix de zona horaria en el cálculo de "hoy"

"Hoy" se calculaba con `new Date().toISOString()`, o sea UTC. Producción corre en
UTC y RD es UTC−4, así que **entre las 20:00 y las 00:00 hora RD el sistema creía
que ya era mañana**. Afectaba 5 puntos; el grave era `lib/cobranza/recargo.ts`, que
generaba la nota de débito por mora un día antes de tiempo — **le cobraba de más al
cliente**.

Corregido con `hoyRD()` / `fechaRD()` en `lib/utils/format.ts`, con 13 tests
(`npm run test:unit`, runner nuevo con Node `--test` vía `tsx`, sin dependencia
nueva).

**Lo único que quedó abierto en todo el PR:** confirmar si el bug llegó a
dispararse. Depende de si hay documentos con `fecha_limite_pago` puesta — sin fecha
límite no hay vencimiento y el bug nunca salta. En dev casi ninguno la tiene, pero
eso no dice nada de producción, y no tenemos ese acceso.

Consulta de **solo lectura** para salir de dudas:

```sql
SELECT count(*) AS total,
       count(fecha_limite_pago) FILTER (WHERE fecha_limite_pago <> '') AS con_fecha_limite
FROM ecf_documents
WHERE estado_pago IN ('PENDIENTE','PARCIAL');
```

- `= 0` → el bug nunca disparó, el fix es preventivo.
- `> 0` → revisar si alguna ND de mora se emitió un día antes, porque eso es dinero
  cobrado de más a un cliente real.

## Decisiones de implementación que conviene conocer

**Promesas vencidas: sin cron.** `evaluarPromesasVencidas` se engancha al GET de la
gestión de una cuenta — corre al abrir el panel. Es idempotente (solo toca las que
siguen en `pendiente`), dos UPDATE indexados por team. *Compromiso:* una promesa
que nadie abre nunca se marca. Hoy no importa porque ese estado solo se consume en
esa pantalla; el día que se quiera un aviso automático hay que moverlo a cron. El
punto de enganche está aislado en una sola llamada.

**Vista "agrupar por cliente": techo de 500 filas.** Agrupar solo la página visible
daría grupos partidos, así que pide 500 de una vez y oculta la paginación. Si se
excede, sale aviso con cifras exactas — no se corta en silencio.

**Migración `0082_cobranza_seguimiento.sql`:** crea dos tablas nuevas
(`cobranza_eventos`, `cobranza_seguimiento`). **No toca ninguna tabla existente.**

## Envío de correos — verificado de punta a punta

Se probó el envío real contra un correo propio del equipo (puesto en un documento
sembrado, enviado a ese único destinatario, **dato revertido después**). Resultado:
1 enviado, 0 fallidos, evento `contacto`/`correo` en el historial con usuario y
fecha RD.

Guardas:

- **Dos pasos.** Sin `confirmar: true` solo previsualiza; no sale ningún correo.
- **Tope de 50 por lote**, cortado en la UI y en la API.
- **Permiso `facturas:crear`**, no el de solo lectura: escribirle a un cliente es
  una acción hacia afuera.
- **El destinatario no es configurable.** Sale de `email_comprador` de las facturas
  seleccionadas; no hay forma de redirigirlo desde la petición.
- Cada envío deja evento de gestión y entrada de auditoría.

---

# Paso 2 — Catálogo de cuentas contables

El mapa contable de cada empresa: las cuentas donde después se van a clasificar
los movimientos. **Aquí todavía no hay movimientos** — los asientos llegan en el
Paso 4. Este paso solo define el destino.

Migración `0083_contabilidad_catalogo_cuentas.sql`: una tabla
(`contabilidad_cuentas`), 14 columnas, 5 índices, 4 CHECK. **No toca ninguna
tabla existente**, y no agrega columnas a `products` ni a `ecf_documents` — la
relación con las entidades genéricas se resuelve en el Paso 3 y apunta hacia la
cuenta, no al revés.

Los 4 subpasos del plan:

| # | Qué pedía | Cómo quedó |
|---|---|---|
| 1 | Estructura del catálogo | `codigo`, `nombre`, `tipo`, `naturaleza`, `cuenta_padre_id`, `activa`, más `imputable` y `es_base` |
| 2 | Catálogo base | 27 cuentas, numeración estándar RD, 3 niveles. Cubre las 8 que exige el plan |
| 3 | Personalización | Crear, renombrar, mover de padre, invertir naturaleza, desactivar |
| 4 | Proteger cuentas usadas | Sin borrado con hijas ni movimientos; código y tipo inmutables con movimientos |

## Numeración

Estándar dominicano, que es con el que van a comparar los contadores locales:
**1** Activo · **2** Pasivo · **3** Patrimonio · **4** Ingresos · **5** Costos ·
**6** Gastos. Tres niveles: clase (`1`) → grupo (`11`) → cuenta imputable (`1101`).
Solo el tercer nivel recibe asientos; los dos primeros agrupan y su saldo es la
suma de sus hijas.

## Dos decisiones de diseño que conviene no revertir sin leer el porqué

**`naturaleza` se guarda por cuenta, no se deriva de `tipo`.** Las cuentas de
contrapartida invierten la naturaleza de su clase: `4103 Descuentos y devoluciones
sobre ventas` es de tipo ingreso y naturaleza **deudora**, porque resta.
Derivarla de la clase las haría irrepresentables, y sin ella las ventas netas
saldrían infladas. La UI las marca "(invertida)".

**`imputable` es un flag explícito, no "no tiene hijos".** Si se derivara,
colgarle una hija a una cuenta que ya tiene movimientos la volvería no-imputable
de golpe y dejaría asientos colgando de una cuenta que "no acepta asientos". Con
el flag, ese caso se detecta y se bloquea con mensaje en vez de corromperse en
silencio.

## Siembra del catálogo base: perezosa

El catálogo base se crea **en el primer render de la pantalla**, no en la
migración ni al crear el team. Un team que nunca use contabilidad no gana 27
cuentas que no pidió, y no hay que migrar datos de los teams existentes.

Es idempotente y **no sobrescribe**: si el usuario renombró `1101` a "Caja
chica", esa fila se queda como está. El catálogo es suyo desde que lo toca.

## Protecciones

- **No se borra una cuenta con movimientos ni con hijas.** Solo se desactiva:
  los reportes de periodos anteriores tienen que seguir cuadrando.
- **Código y tipo son inmutables una vez que hay movimientos.** El nombre no.
  El código es la referencia con la que se concilia contra papeles externos.
- **Una cuenta que acepta movimientos no puede tener hijas**, y viceversa: su
  saldo sería el propio *más* el de las hijas y no cuadraría con ninguno.
- **Sin ciclos en la jerarquía.** Se valida con un CTE recursivo; el CHECK de la
  tabla solo ataja el autopadre.
- Las cuentas del catálogo base no se pueden borrar desde la UI, solo desactivar.

## La pieza que mira al futuro

`tieneMovimientos()` consulta `contabilidad_asiento_lineas`, **que no existe
hasta el Paso 4**. Usa `to_regclass` para preguntar si la tabla existe: devuelve
`false` mientras no exista y **empieza a proteger sola en cuanto aparezca**, sin
que haya que acordarse de volver a ese archivo. Cuando se cree esa tabla, la
columna debe llamarse `cuenta_id` y tener `team_id`, o hay que ajustar la consulta.

---

# Paso 3 — Cuentas automáticas por empresa

Le dice al sistema **qué cuenta usar para cada cosa**, para que el Paso 4 pueda
generar asientos sin preguntar en cada factura. Sigue sin generarse ningún
asiento.

Migración `0084_contabilidad_config_cuentas.sql`: tres tablas, una por subpaso
del plan. **No toca ninguna tabla existente.** Todas las FK apuntan hacia
`contabilidad_cuentas`, `products` y `categorias`, nunca al revés.

| # | Qué pedía | Cómo quedó |
|---|---|---|
| 1 | Configuración general | 5 cuentas: por cobrar, ITBIS, ingresos, descuentos, mora |
| 2 | Cuentas por método de pago | 8 claves configurables + las 2 pasarelas aparte |
| 3 | Por producto/servicio/categoría | Sin configurar: `products.tipo` decide. Overrides para excepciones |
| 4 | Validar configuración incompleta | Lista de huecos concretos + interruptor que se niega a encender |

## El hallazgo que conviene revisar con calma

**Un cobro por CardNet/Azul se guarda en `pagos_recibidos` con
`metodo = 'tarjeta'`**, idéntico a una tarjeta pasada en el mostrador — ver
`lib/pagos/links.ts`, que llama a `registrarPago({ metodo: 'tarjeta' })`. El
campo `pagos_recibidos.cuenta` guarda 'Azul'/'CardNet', pero es **texto libre
editable por el usuario**, así que no sirve de discriminador. Lo único fiable es
que exista una fila en `payment_links` apuntando a ese pago.

Importa porque el dinero de una pasarela **no entra al banco ese día**: liquida
después y retiene comisión. Mapear ambos al mismo sitio infla el banco con plata
que todavía no ha llegado — que es justo lo que el plan advertía en el subpaso 2.

Por eso las claves `pasarela_cardnet` / `pasarela_azul` existen aparte de
`tarjeta`, y **`claveContableDePago()`** hace la traducción mirando el vínculo del
link. **El Paso 4 debe usar esa función y nunca el `metodo` crudo.**

## Decisiones de implementación

- **Solo se exigen los métodos que el team usa de verdad**, mirando su historial
  de `pagos_recibidos`. Pedirle a una panadería que configure "Link de pago Azul"
  cuando nunca cobró en línea es ruido, y el ruido hace que la gente ignore la
  validación entera.
- **`saldo_favor` y `nota_credito` no llevan cuenta de cobro.** No son entrada de
  efectivo: son la aplicación de un crédito previo, y su asiento va contra
  descuentos en el Paso 5. La API rechaza configurárselas.
- **La cuenta de comisión solo aplica a pasarelas.** En efectivo no hay comisión.
- **La configuración solo acepta cuentas imputables y activas.** Apuntar a una de
  agrupación produciría asientos sobre una cuenta que no los recibe.
- **`activa` arranca apagado y no se puede encender con huecos.** Asientos
  descuadrados son peores que no tener asientos.
- **Bien → `4101`, servicio → `4104` sin configurar nada**, usando `products.tipo`
  que ya existía. Los overrides son solo para excepciones.

## Cuentas nuevas en el catálogo base

El Paso 3 necesitaba tres que el Paso 2 no tenía: `1106 Cobros por liquidar`
(puente de pasarela), `4104 Ingresos por servicios` y `6102 Comisiones por cobro
electrónico`. Además `4101` pasó a llamarse "Ingresos por venta de mercancía".

La siembra automática **no las reparte a los teams ya sembrados** (se planta en
cuanto existe una cuenta), así que se agrega el botón **"Restaurar cuentas base"**
en el catálogo. Es explícito a propósito: si alguien borró una cuenta base porque
no la usa, no se la devolvemos a sus espaldas en cada render.

## Tres funciones sin llamador, a propósito

`resolverCuentaIngreso()`, `resolverCuentaCobro()` y `claveContableDePago()` no
se llaman desde ningún sitio todavía: son la puerta de entrada del Paso 4, y no
hay nada que resolver hasta que existan los asientos. **Están verificadas por
script**, no dadas por buenas — los 4 niveles de la cadena de resolución, con
datos temporales creados y borrados.

---

# Paso 4 — Asientos de facturas y pagos

Aquí el módulo **deja de describir y empieza a registrar**. Migración
`0085_contabilidad_asientos.sql`: encabezado + líneas.

Los nombres `contabilidad_asiento_lineas` / `team_id` / `cuenta_id` no son
arbitrarios: `tieneMovimientos()` del Paso 2 ya los consultaba con `to_regclass`,
así que **la protección de borrado del catálogo se activó sola** al crear la
tabla.

| # | Qué pedía | Cómo quedó |
|---|---|---|
| 1 | Tablas de asientos | Encabezado + líneas, con CHECK de que un apunte es debe **o** haber |
| 2 | Asiento de factura | Debe CxC / Haber ingresos (repartidos) / Haber ITBIS |
| 3 | Asiento de pago | Debe cuenta del método / Haber CxC |
| 4 | Asegurar cuadre | Validación debe==haber **antes** del insert, en la transacción |
| 5 | Relacionar con origen | `origen_tipo` + `origen_id`, con índice único |
| 6 | Una sola fuente monetaria | El cargo escolar no genera asiento; lo genera la factura |

## Las trampas del repo que había que esquivar

**1. `lineas_json` está en PESOS y el encabezado en CENTAVOS.** Está dicho en
`lib/reportes/shared.ts`, pero es fácil de pasar por alto: sumar líneas para el
asiento habría dado un error de ×100.

**2. Las líneas de factura no llevan id de producto**, solo `referencia` (SKU) o
el nombre — el rollup de reportes también agrupa así. O sea que
`resolverCuentaIngreso(teamId, productoId)` del Paso 3 **no se puede alimentar
directo desde una línea**. El reparto mapea por SKU contra `products.referencia`,
que **no es único por team**: de ahí el `DISTINCT ON ... ORDER BY p.id`, para que
el reparto no cambie entre ejecuciones. Sin SKU o sin coincidencia → cuenta de
ingresos general.

**3. Las líneas no tienen por qué sumar el ingreso del encabezado.** Se ancla en
el encabezado —la cifra facturada al cliente y la que tiene la DGII— y las líneas
solo deciden el reparto; la diferencia de redondeo va al grupo mayor. Probado con
líneas que sumaban RD$99.99 contra un encabezado que exigía RD$100.01: ajuste de
RD$0.02, cuadre exacto.

**4. Las columnas `bigint` llegan a JS como STRING.** `0 + "701" + "0"` da
`"07010"`, no 701: una suma de importes se vuelve concatenación y no se nota
hasta ver un total absurdo. Lo detectó el script de prueba, que marcaba
descuadre mientras el cuadre en SQL daba cero — los datos estaban bien, el que
mentía era el JavaScript. Contenido en `aNumero()`, el único punto por donde los
montos salen de la base.

## Decisiones que conviene revisar

**La generación no se engancha al flujo de emisión.** Meterle una escritura
contable al motor de facturación significa que un fallo del módulo contable
podría tumbar una emisión a la DGII: eso cambia un problema grave por uno peor.
Es un botón explícito en el libro diario.

*Compromiso conocido, el mismo patrón que las promesas del Paso 1:* **lo que
nadie barre no se asienta.** El punto de enganche está aislado en
`generarAsientosPendientes()`, así que mudarlo a un cron es un cambio chico
cuando se decida.

**Se factura contra Cuentas por cobrar incluso al contado.** El pago genera su
propio asiento (debe caja / haber CxC), así que la cuenta se abre y se cierra.
Registrar la venta directo contra caja perdería la trazabilidad de qué se cobró
y cuándo.

**Idempotencia por índice único `(team_id, origen_tipo, origen_id)`** más
`ON CONFLICT DO NOTHING`. Reintentar no duplica — el error más caro que podría
cometer este módulo. Si dos procesos asientan a la vez, uno gana y el otro se
entera sin romper nada.

**Los documentos con retenciones se saltan**, con el motivo visible en pantalla.
Cambian la forma del asiento y son del Paso 5. Generar uno "casi bien" para un
libro contable real es peor que no generarlo: nadie vería que está mal hasta la
declaración.

**Tope de 200 orígenes por barrido**, con aviso de que quedan más. El primer uso
en una empresa con historial no debe tardar minutos.

---

# Paso 5 — Notas, anulaciones, mora, retenciones y saldos a favor

Cubre los cinco casos que el Paso 4 saltaba a propósito, cada uno con su motivo
visible en pantalla. Migración `0086_contabilidad_casos_especiales.sql`: **no
crea tablas**, añade dos columnas a `contabilidad_config` y dos cuentas al
catálogo base.

| # | Qué pedía | Cómo quedó |
|---|---|---|
| 1 | Notas de crédito | Debe descuentos + Debe ITBIS / Haber CxC (+ Haber saldo a favor) |
| 2 | Notas de débito y mora | La mora acredita `4102`, no la cuenta de ventas |
| 3 | Anulaciones | Asiento reverso; el original se conserva |
| 4 | Retenciones | El débito se parte: CxC (total − retenido) + `1107` |
| 5 | Saldos a favor | `2104` se acredita al generarlos, se debita al aplicarlos |

## Un defecto del Paso 4 que salió aquí

**Una nota de débito por mora acreditaba "Ingresos por ventas".** Su tipo e-CF es
`33`, que está en `TIPOS_VENTA`, así que `generarAsientoFactura` la trataba como
una venta más y el reparto por línea caía a la cuenta de ingresos general. El
recargo por atraso se mezclaba con las ventas y **distorsionaba el margen del
negocio**.

Corregido: si `mora_origen_id` no es nulo, el ingreso va entero a la cuenta de
mora sin repartir por líneas. En dev no había ningún asiento de mora generado, así
que no hay nada que corregir hacia atrás — pero conviene tenerlo presente si
alguna base ya barrió con la versión anterior.

## Dos cuentas nuevas, y la clase importa

**`2104 Saldos a favor de clientes` es PASIVO.** Cuando una nota de crédito supera
lo que el cliente debía, ese exceso no es "menos deuda": es dinero que la empresa
le debe a él. Restarlo de la cartera la dejaría en negativo y el balance mal.

**`1107 Retenciones por cobrar` es ACTIVO.** Lo que el comprador retiene no entra
al banco, pero deja un crédito fiscal. La venta fue por el total, así que el
ingreso no cambia; lo que se parte es el débito.

Ambas se reponen en catálogos ya sembrados con **"Restaurar cuentas base"**.

## Decisiones de implementación

**Un documento anulado no borra su asiento.** Se crea uno reverso con debe y haber
intercambiados. Un libro contable no se reescribe: la anulación es un hecho
posterior con su propia fecha, y las dos operaciones quedan visibles. El índice
único impide reversar dos veces. Se busca el original por
`origen_tipo IN ('factura','nota')`, porque una nota de crédito anulada también
hay que reversarla.

**Una NC con `codigo_modificacion = 2` ("corrige texto") no genera asiento.** No
mueve dinero, solo enmienda datos del documento original.

**El crédito generado se capa al total de la nota**, por si el dato viniera
inconsistente: nunca debe crear más pasivo que el importe de la propia nota.

**El barrido ya no excluye `saldo_favor` ni `nota_credito`.** Desde este paso
tienen asiento propio contra `2104`. Sin eso, el saldo a favor crecería para
siempre y nunca se vería consumido en el balance.

**Bug de este paso, encontrado y corregido después (`d2b1492`):** el PATCH de
`/api/contabilidad/config` no reenviaba los dos campos nuevos
(`cuentaSaldosFavorId`, `cuentaRetencionesId`) — la UI los mandaba, la ruta los
descartaba y respondía 200 sin guardar, porque `guardarConfig` trata `undefined`
como "no tocar". Salió al configurar un team completo desde la pantalla: la
verificación original configuró por script directo a la librería, así que el
camino UI→API de esos dos campos nunca se había ejercitado.

**Las anulaciones solo se barren si el documento ya tenía asiento** (`JOIN`, no
`LEFT JOIN`): uno anulado antes de que nadie barriera no tiene nada que reversar.

---

# Paso 6 — Reportes contables

Convierte los asientos en los tres informes con los que un contador trabaja de
verdad. **Sin migración**: todo sale de las tablas del Paso 4.

| # | Qué pedía | Cómo quedó |
|---|---|---|
| 1 | Libro diario con filtros por fecha, origen y cuenta | Los tres filtros, más la paginación que faltaba |
| 2 | Mayor general | Movimientos por cuenta con saldo inicial, débitos, créditos y saldo final |
| 3 | Balance de comprobación | Todas las cuentas con movimientos + validación de cuadre |

## Dos defectos que ya estaban y salieron al abrir el archivo

**1. El filtro por origen del libro diario llevaba roto desde el Paso 5.** La API
solo aceptaba `factura|pago`; cuando el Paso 5 añadió los orígenes `nota` y
`anulacion`, la whitelist se quedó atrás y filtrar por esos dos **se ignoraba en
silencio, devolviendo el libro entero** como si no hubiera filtro. Nadie lo
notó porque no había UI para ese parámetro. Ahora la lista sale de la constante
`ORIGENES`, que es lo que dejó que se desincronizara.

**2. La paginación del libro era inalcanzable.** `listarAsientos` aceptaba
`limit`/`offset` desde el Paso 4, pero la pantalla pedía 50 fijos y pintaba lo
que llegara: **a partir del asiento 51 el resto no se podía ver**, sin aviso. Es
la misma clase de pieza huérfana que el barrido del Paso 1 encontró tres veces.

## La regla del signo, que es donde se equivoca todo el mundo

El saldo de una cuenta depende de su **`naturaleza`**, leída de la columna:
deudora = `debe − haber`, acreedora = `haber − debe`. **Nunca deducida del
`tipo`**, porque las cuentas de contrapartida la invierten: `4103 Descuentos` es
de tipo ingreso y naturaleza deudora, así que deducirla del tipo le daría el
signo cambiado **justo a esa**, que es de las que más se miran al revisar el
margen. Está aislada en `saldoSegunNaturaleza()`, un solo sitio donde
equivocarse.

**Donde NO se aplica:** las columnas "saldo deudor" y "saldo acreedor" del
balance son aritmética pura (`debe − haber`, gana el positivo) y no miran la
naturaleza. Por eso el balance **cuadra siempre que cuadren los asientos**. Ahí
la naturaleza sirve para otra cosa: para saber en qué columna se *esperaba* que
cayera la cuenta y marcar la que cae en la contraria.

## Decisiones de implementación

**Ninguno de los dos reportes nuevos tiene ruta de API.** El filtrado va por la
URL y lo resuelve el servidor, así que una API sin consumidor sería exactamente
la pieza huérfana que este módulo ya produjo tres veces. Cuando llegue la
exportación traerá la suya, con su llamador. Las dos pantallas **sí** se
registraron en el sidebar con `contabilidad:ver` — sin eso existirían pero no
habría camino desde la aplicación.

**Los filtros viven en la URL, no en estado del cliente.** Filtra y pagina el
servidor: traer miles de asientos al navegador para filtrarlos ahí es el mismo
bug que se arregló en la cartera del Paso 1. De paso, una vista de un trimestre
concreto se puede compartir o guardar.

**El filtro por cuenta usa `EXISTS` sobre las líneas, no un `JOIN`.** Con `JOIN`,
un asiento que toca la misma cuenta en dos apuntes saldría duplicado en la lista
y contado dos veces en el total.

**El saldo inicial del mayor es el arrastre de todo lo anterior al `desde`.** Sin
él, el saldo final de un mes suelto no significa nada. Sin `desde` es cero, y se
dice en pantalla para que nadie lo lea como "empezó en cero".

**El mayor está paginado (25 por página), con los totales del tramo completo.**
Al principio tenía un tope de 500 movimientos con aviso; tras la revisión se
cambió a paginación real (ver "Ajuste de rendimiento", abajo). Los totales y el
saldo final se calculan en SQL sobre TODO el tramo filtrado, no sobre la página
— un total recortado presentado como total es peor que no darlo — y cada página
arranca con una fila de "saldo acumulado de las páginas anteriores" para que la
columna de saldo empalme exacta.

**El balance solo lista cuentas con movimientos.** Un balance con 30 filas en
cero esconde las 4 que importan.

**Las fechas se validan antes de llegar al `::date` de Postgres**, comprobando
formato **y** existencia en el calendario. Una cadena rara ahí no devuelve vacío:
lanza excepción y tumba la página con un 500. Había tres copias de esa validación
en el repo; se unificó en `fechaValidaISO()`.

**`fmtDOP` pasó a poner el signo delante del símbolo** (`-RD$44.64` en vez de
`RD$-44.64`). Estos son los primeros reportes que muestran importes negativos.

## Un hallazgo con los datos reales, que no es un fallo del reporte

El balance marca **`1103 Cuentas por cobrar` con saldo invertido**: es una cuenta
deudora pero quedó acreedora. La causa es que hay **más cobros asentados que
facturas asentadas** — o sea el compromiso conocido del Paso 4 (*"lo que nadie
barre no se asienta"*) hecho visible por primera vez. En una base donde se barra
a tiempo no debería aparecer, y el aviso está justamente para eso.

---

# Ajuste de rendimiento posterior a la revisión (`85156aa`)

Alex pidió aplicar al módulo el patrón de `perf/db-optimization` (rama que ya
está en `main` y por tanto en esta: SWR global, `React.cache` de sesión e
índices `0070` activos aquí). Lo que faltaba era propio del módulo:

- **Libro diario: 25 asientos por página en vez de 50.** Menos filas por
  consulta y por render; mismo tamaño que la cartera del Paso 1.
- **Mayor general: paginación real** en lugar del tope de 500 con aviso. Los
  totales, el conteo y el arrastre de cada página se calculan en SQL —el
  arrastre con el MISMO `ORDER BY` de la lista, para que el saldo corriente
  empalme exacto entre páginas— y las tres consultas van en paralelo. De paso
  desapareció un defecto: con más de 500 movimientos los totales se sumaban en
  JS sobre lo traído y salían recortados; ahora son siempre del tramo completo.
- **Cartera y balance no necesitaron nada** (la cartera ya era el molde del
  patrón; el balance es un agregado sin lista larga), y **Secuencias no se
  toca** porque es página de `main`.
- **Sin cache nuevo**: los reportes son server-rendered, una consulta por
  navegación; cachear contabilidad arriesga servir números viejos por ahorro
  marginal.

Verificado contra un equipo con 471 asientos (mayor de `1103` con 470
movimientos, 19 páginas): totales idénticos en todas las páginas, empalme
exacto del saldo entre páginas, el acumulado de la última fila coincide con el
agregado SQL, página fuera de rango cae a la última real y los parámetros
basura responden 200.

---

# Cómo probarlo

## Paso 1 — cartera

```bash
npx tsx scripts/seed-cartera-escenarios.ts 9   # idempotente; --limpiar para borrar
```

Abrir `/dashboard/cuentas-por-cobrar`. Todo lleva prefijo `SEEDCXC`, no se mezcla
con datos reales.

| Caso | Qué demuestra |
|---|---|
| `SEEDCXC-CONMORA` | Mora que ignora una ND anulada |
| `SEEDCXC-CONNCID` | Nota de crédito restando del saldo |
| `SEEDCXC-VENC100` | Cubeta +90 días |
| `SEEDCXC-SALDADAMORA` | Factura saldada que sigue en cartera solo por su mora |

Vale la pena comprobar que **los totales de arriba no cambian al pasar de página**
— es el arreglo central.

## Paso 2 — catálogo

Abrir `/dashboard/contabilidad/cuentas`. No hay que sembrar nada: el catálogo base
se crea solo en el primer render.

- Colapsar `1 Activo` recoge el bloque completo.
- Columna "Movimientos": **Agrupa** vs **Acepta**.
- `4103` sale marcada **"(invertida)"** — es el caso de contrapartida.
- Crear `6102 Alquiler de local` bajo `61 Gastos operacionales`.
- Intentar romperlo: código `1101` duplicado → 409; desactivar `11 Activo
  corriente` → 409 por hijas activas; el desplegable de cuenta padre lista solo
  las 12 que agrupan.

## Paso 3 — configuración

Abrir `/dashboard/contabilidad/configuracion`.

- Con la configuración incompleta sale la lista de huecos, cada uno con **qué
  falta y qué se rompe sin ello**, y el botón de encender está bloqueado.
- La sección de formas de cobro solo marca "lo usas y falta" en los métodos que
  este equipo **ha usado de verdad**.
- **Link de pago — CardNet/Azul** tienen una segunda columna para la cuenta de
  comisión que los demás métodos no tienen.
- Intentar ponerle cuenta a "Saldo a favor" → explica por qué no lleva.
- Elegir una cuenta de agrupación (`11 Activo corriente`) → 409 con el motivo.
- Completar todo y encender → el estado pasa a "completa" y el botón a "Apagar".
- En el catálogo, **"Restaurar cuentas base"** agrega las que falten sin duplicar
  ni tocar las existentes.

## Paso 4 — libro diario

Abrir `/dashboard/contabilidad/libro-diario`.

- **Clic en cualquier fila** despliega los apuntes con su fila de totales. Debe y
  Haber siempre iguales.
- Un asiento de factura con ITBIS tiene 3 apuntes; uno de cobro, 2.
- **"Generar asientos pendientes"** barre lo que falte y explica en lenguaje
  llano qué se saltó y por qué.
- Apagar la contabilidad en la configuración y volver a pulsar generar → no
  genera nada y lo dice.

## Paso 5 — casos especiales

- La configuración tiene ahora **7 cuentas generales** en vez de 5.
- En un catálogo sembrado antes de este paso, **"Restaurar cuentas base"** añade
  `2104` y `1107`.
- Emitir una nota de crédito o anular una factura y volver a barrer: aparecen con
  badge propio — ámbar para notas, rojo para anulaciones.
- Abrir el asiento de una anulación: debe y haber salen invertidos respecto al
  original, y el original sigue en el libro.

## Paso 6 — los tres reportes

**Libro diario** (`/dashboard/contabilidad/libro-diario`):

- Filtrar por origen **Anulación** o **Nota de crédito**: antes de este PR
  devolvían el libro entero.
- El contador de arriba y el importe son de **todo lo filtrado**, no de la
  página.
- Cambiar un filtro estando en la página 2 vuelve a la 1 sola.

**Mayor general** (`/dashboard/contabilidad/mayor`):

- Elegir `1103 Cuentas por cobrar`: la columna Saldo se acumula de arriba abajo.
- Elegir `4101 Ingresos por ventas`, que es **acreedora**: ahí los créditos
  *suman*, al revés que en la anterior. Es la regla del signo en pantalla.
- Poner una fecha en **Desde**: aparece una primera fila "Saldo anterior a…" con
  el arrastre, y el saldo sigue desde ahí.
- En una cuenta con más de 25 movimientos: pasar a la página 2 y comprobar que
  la fila "Saldo acumulado de las páginas anteriores" **coincide con el saldo de
  la última fila de la página 1**, y que los totales de arriba no cambian.

**Balance de comprobación** (`/dashboard/contabilidad/balance`):

- Arriba dice si cuadra, en verde o en rojo. Las dos columnas de saldo dan lo
  mismo.
- Las cuentas con saldo del lado contrario al esperado salen marcadas **"saldo
  invertido"**, con el aviso explicando que no es necesariamente un error.
- Pulsar cualquier cuenta abre su mayor conservando el periodo.

# Verificación

**Paso 1**

- 13 tests de la lógica de fecha RD (hoy son 13 de los 24 que corre
  `npm run test:unit`; los otros 11 son del Paso 6)
- `npx tsx scripts/validar-cartera.ts 9` → 37/37
- Navegador: paginación sin solape, totales estables entre páginas, orden,
  búsqueda con debounce, panel de detalle, gestión de cobro.
- Envío real de recordatorio, punta a punta (ver arriba).

**Paso 2**

- Estructura confirmada contra la DB: 14 columnas, 5 índices, 4 CHECK.
- 6 guardas probadas contra la API real: código duplicado, hija de cuenta
  imputable, tipo inválido, código vacío, desactivar padre con hijas activas,
  volver imputable una cuenta con hijas.
- 3 casos de ciclo: directo, largo (dos niveles) y autopadre. Los tres rechazados.
- Alta completa desde el **formulario de la UI**, no solo por API.

**Paso 3**

- **Cadena de resolución, los 4 niveles**, con datos temporales creados y
  borrados: producto → `4102`, categoría → `4104`, tipo bien → `4101`, sin
  producto → la general. Al quitar el override de producto vuelve al de
  categoría. Limpieza confirmada en 0.
- Guardas contra la API real: activar con huecos → 409 con los 9 huecos
  listados; cuenta de agrupación → 409; comisión en método no-pasarela → 409;
  cuenta para `saldo_favor` → 409.
- Flujo completo: 5 generales + 4 métodos + pasarela con puente y comisión →
  `completa: true` → encender → la UI muestra "encendida".
- `restaurar-base` insertó exactamente las 3 que faltaban. Cero códigos
  duplicados en la base.

**Paso 4**

Los datos reales del dev tenían ITBIS 0 y una sola línea, así que **el ITBIS y el
reparto no se ejercitaban con ellos**. Se montaron 4 casos con documentos
temporales, creados y borrados (restos: 0):

- ITBIS > 0 → 3 apuntes, ITBIS exacto contra el encabezado.
- Dos líneas bien/servicio → `4101` y `4104` separados, cuadre exacto.
- Redondeo → ajuste al grupo mayor, débito == `monto_total` al centavo.
- Línea sin SKU → cuenta de ingresos general.

Además:

- **Idempotencia**: segundo barrido crea 0; reintentar una factura ya asentada
  devuelve `ya-tiene-asiento`.
- **Cotejo global en SQL**: 0 asientos descuadrados, 0 facturas cuyo asiento no
  cuadre con su `monto_total`.
- Barrido con la contabilidad apagada → no genera nada, motivo explicado.
- Botón desde la UI: generó 1 y saltó 1, con el aviso *"Se saltaron: 1 porque
  tienen retenciones (se tratan en el siguiente paso)"*.
- Un id de asiento inexistente devuelve vacío, sin filtrar datos de otro team.

**Paso 5**

Los datos del dev **no tienen ni una sola** nota de crédito, mora, retención ni
anulación asentable, así que sin datos sintéticos nada de este paso estaría
probado. Siete casos con documentos temporales creados y borrados (restos: 0):

| Caso | Resultado |
|---|---|
| Mora | Acredita `4102`, no ventas ✓ |
| NC sin saldo a favor | Reduce CxC por el total ✓ |
| NC con saldo a favor (800 de 2000) | CxC 1200 + `2104` 800 ✓ |
| Retenciones (1800 de 11800) | CxC 10000 + `1107` 1800 ✓ |
| Anulación | CxC pasa a haber; original conservado; reversar dos veces rechazado ✓ |
| Aplicación de saldo a favor | Debita `2104`, cancela CxC ✓ |
| NC código 2 | No genera asiento ✓ |

Los siete cuadran. En el navegador: los 7 campos de configuración, los 4 badges
del libro con colores distintos, y el detalle del reverso con debe y haber
invertidos.

**Paso 6**

**11 tests unitarios nuevos** (`tests/unit/contabilidad-saldos.test.ts`), y no
son de adorno: **la trampa de este paso no se puede ver con los datos del dev**,
porque ninguna cuenta de esa base tiene la naturaleza invertida respecto a su
clase. El test demuestra que deducirla del tipo da `-3000` donde lo correcto es
`3000` — el signo exactamente al revés, y solo en esa clase de cuenta.

En el navegador, contra un team con 12 asientos:

| Prueba | Resultado |
|---|---|
| Cuadre del balance | Debe 74.40 + 27.00 + 56.76 = **RD$158.16** = haber 101.40 + 56.76 |
| Saldos del balance | Deudor RD$101.40 = acreedor RD$101.40 |
| Cotejo con el libro diario | Los RD$158.16 coinciden con el total del libro |
| Filtros del libro | Factura → 3 · RD$56.76; cobro → 9 · RD$101.40. **Suman exactamente el total**, partición limpia |
| El bug del filtro | `origenTipo=anulacion` → 0 filas. Antes del arreglo devolvía las 12 |
| Filtro por cuenta | `1103` → 12 asientos en **12 filas**: el `EXISTS` no duplica |
| Mayor de una cuenta deudora | Saldo corriente correcto en los 12 pasos, final −RD$44.64 |
| Mayor de una cuenta acreedora | Los créditos suman: 17.60 → 34.76 → 56.76. Signo opuesto, como debe |
| Cotejo entre reportes | El −44.64 del mayor es el mismo 44.64 acreedor del balance |
| Saldo inicial con periodo | Arrastre correcto; débitos = créditos en el tramo → el saldo final vuelve al inicial |
| Aislamiento entre teams | Las cuentas de otro equipo dan "esa cuenta no existe", sin filtrar datos |
| Paginación | Sin solape entre páginas; los totales de arriba no cambian al pasar de página |
| Parámetros basura (`cuentaId=abc`, `-1`, `desde=basura`, `2026-02-31`, `';DROP TABLE x;--`, `pagina=999`) | Todos responden 200 y se ignoran como "sin filtro" |
| Sidebar | Las dos entradas nuevas aparecen bajo Contabilidad |

`npm run test:unit` → **24/24** (13 del fix de fecha + 11 nuevos).

Typecheck limpio en los seis. Sin errores de consola ni warnings de React.

# Lo que NO se pudo verificar

- **`fecha_limite_pago` en producción** (ver Paso 1). Necesita acceso a la base
  de producción; la consulta de solo lectura está más arriba.
- **La trampa del `4103` no se pudo ver en pantalla**, solo por test unitario:
  ninguna cuenta del dev tiene la naturaleza invertida respecto a su clase.
- Los reportes del Paso 6 **no se vieron con asientos de nota, mora, retención ni
  anulación** — el team de pruebas no tiene ninguno. Sí con facturas y cobros.
- El tope de 500 movimientos del mayor no se alcanzó con datos reales.
