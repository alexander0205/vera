# Plan: bajar Administración Escolar y convertirlo en módulo propio

> Generado del análisis del PR #16 (feature/administracion-escolar, 2fe59df) contra la rama de módulos.

## Resumen

Plan en 11 fases para bajar la rama escolar (2fe59df, /tmp/vera-escolar) al destino (1b3c6e4, worktree stupefied-fermat-8e3852) y convertirla en el tercer módulo comercializable, con clave 'escolar'. Verifiqué en el destino las piezas del patrón: lib/config/modules.ts:9 (MODULES=['facturacion','pos']), lib/auth/modules.ts:29 (MODULE_PERMISSION), lib/auth/page-guard.ts:69 (requireModule), lib/auth/api-guard.ts:57 (requireModuleAndPermission — ya existe, no hay que escribirlo), components/pos-nav-rail.tsx, app/pos/layout.tsx:16 (overflow:hidden) vs app/cuenta/layout.tsx:15 (overflowY:auto), lib/db/migrations/0071_modulos.sql, lib/payments/modulos.ts:72 y proxy.ts:6,24. El orden es forzado por dependencias: primero el andamiaje de módulo (fase 1), luego el merge textual (fase 2), luego migraciones (fase 3), luego el movimiento de rutas y el rail (fases 4-5), luego los arreglos obligatorios (fases 6-8) y por último verificación (fases 9-11). Lo más riesgoso, y lo que NO se debe mergear sin arreglar, es sincronizarSaldosDesdeFacturas (lib/administracion-escolar/queries.ts:296-417): reparte factura.montoTotal entre los cargos en vez de aplicar lo cobrado contra el monto de cada cargo, y eso destruye deuda, la infla con ITBIS y la borra de forma irreversible al anular una factura — con 6 escuelas reales en producción. Segundo bloqueante: el POST de cargos y el de matrículas insertan estudianteId/matriculaId/conceptoId/cursoId sin validar pertenencia al team, y los GET hacen leftJoin sin eq(teamId), lo que produce una fuga real de nombres de menores entre colegios. Decisión de producto que atraviesa todo el plan: 'escolar' NO es standalone — depende de 'facturacion' (el cobro propio está deshabilitado a propósito en app/api/administracion-escolar/pagos/route.ts:46-59), así que se declara como dependencia dura en el catálogo y en el billing.

## Decisiones de diseño

### Clave del módulo = 'escolar' (no 'administracion-escolar' ni 'colegios'). MODULE_HOME='/escolar', subdominio escolar.*, permiso de acceso 'modulo:escolar'.

Las claves existentes son cortas y sirven de prefijo de host en lib/config/modules.ts:57 (moduleForHost hace hostname.startsWith('pos.')). 'escolar.' funciona; 'administracion-escolar.' es un subdominio impresentable. La ruta /escolar es corta y es lo que verá el usuario.

_Descartado:_ Usar 'administracion-escolar' como clave para que coincida con el prefijo de permisos. Descartada: obliga a un subdominio largo y a renombrar MODULE_HOME a algo que no se puede teclear.

### Los permisos granulares SIGUEN llamándose 'administracion-escolar:ver|gestionar|configurar|pagos'. Solo se AÑADE 'modulo:escolar'.

Renombrarlos toca las 39 rutas de app/api/administracion-escolar/*, los 4 bloques de ROLES en lib/config/roles.ts:127-189, el catálogo en :261-264 y obliga a una migración de datos sobre team_role_permissions en las 6 escuelas de producción. Cero beneficio funcional. La asimetría clave-de-módulo vs prefijo-de-permiso ya existe (modulo:pos vs caja:operar).

_Descartado:_ Renombrar todo a 'escolar:*' o a 'colegios:*' como pedía docs/inicio-proyecto-modulo-colegios.md. Descartada por coste/riesgo, no por gusto.

### 'escolar' declara DEPENDENCIA DURA de 'facturacion'. No se puede activar escolar sin facturacion, y desactivar facturacion desactiva escolar.

El cobro escolar propio está deshabilitado por regla de negocio (app/api/administracion-escolar/pagos/route.ts:46-59, 409 'no crear un sistema de cobro paralelo'). Sin facturación: no hay forma de saldar un cargo, la mensualidad automática (lib/administracion-escolar/facturacion-recurrente.ts) queda huérfana, la mora no existe, y las FKs cargos.ecf_document_id / matriculas.factura_recurrente_id apuntan a tablas de un módulo no contratado. En lib/payments/modulos.ts:72 ya existe el precedente de forzar 'facturacion' como base.

_Descartado:_ Reimplementar cobro dentro del módulo escolar para venderlo standalone. Descartada: contradice frontalmente la regla ya codificada y duplica el ledger. Si algún día se quiere, es un proyecto aparte, no parte de este merge.

### adminEscolarEstudiantes sigue siendo la fuente de verdad académica; dependientes sigue siendo la fuente de verdad de la PERSONA facturable/POS. El puente es adminEscolarEstudiantes.dependienteId, que pasa a tener índice y unique parcial.

Hay tres representaciones hoy (adminEscolarEstudiantes, dependientes, monederoEstudiante.dependienteId con unique en schema.ts:250). Fusionarlas es una migración de datos sobre producción con 6 tenants. El enlace ya se crea solo en el flujo correcto: app/api/administracion-escolar/estudiantes/[id]/tutores/route.ts (POST) crea/re-apunta el dependiente bajo el cliente del tutor pagador dentro de una transacción. Solo falta hacerlo obligatorio, indexado y único.

_Descartado:_ (a) Colapsar adminEscolarEstudiantes en dependientes: rompe historial de matrícula y el codigo AAAA-####. (b) Dejar dependienteId nullable y sin índice como hoy: deja el monedero POS sin join fiable, que es exactamente el problema.

### El layout del módulo se calca de app/cuenta/layout.tsx (overflowY:'auto'), NO de app/pos/layout.tsx (overflow:'hidden').

Las 8 pantallas escolares son <section className="p-6"> sin altura ni overflow propios (estudiantes:96, perfil:297, cargos:339, matriculas:162, pagos:95, configuracion:231, nuevo:136). Con overflow:'hidden' el perfil de 1689 líneas queda cortado sin scroll. Además overflowY:'auto' preserva el sticky top-4 de EstudianteFicha.tsx:85, que hoy se resuelve contra el <main> del dashboard.

_Descartado:_ Copiar app/pos/layout.tsx literalmente porque 'es el modelo a imitar'. El POS usa hidden porque es una grilla táctil de altura fija; escolar es contenido largo.

### En el conflicto de app/(dashboard)/dashboard/layout.tsx:102 se DESCARTA el lado de Darian (el NavGroup 'administracion-escolar') y se borran a mano las 5 entradas de HREF_PERMISSION que auto-mergearon.

El objetivo del merge es exactamente lo contrario de lo que hace ese hunk: escolar deja de ser un grupo del sidebar de Facturación. En su lugar se replica el patrón puedeIrPos (:604-607 y :915-936) con un link 'Administración Escolar' a moduleUrl('escolar').

_Descartado:_ Conservar el grupo del sidebar 'por si acaso' durante una transición. Descartada: deja dos caminos a las mismas pantallas y el gate del sidebar (por permiso) no coincide con el gate del módulo.

### components/cuentas-por-cobrar/PagoModal.tsx SE PORTA al destino, pero con el cuerpo MUI del destino, no con el Tailwind de Darian.

El destino ya reescribió ese modal a MUI dentro de app/(dashboard)/dashboard/cuentas-por-cobrar/page.tsx; Darian lo extrajo a componente. Las dos intenciones son buenas y compatibles: extraer + MUI. Sin ese archivo, _perfil-client.tsx:21 no compila y el perfil (la pantalla principal) muere.

_Descartado:_ Reescribir el cobro del perfil sobre components/pagos/PagoMetodos.tsx del destino. Es lo arquitectónicamente limpio a futuro, pero cambia la UX del cobro in-place y no cabe en este merge.

### admin_escolar_pagos se marca LEGACY explícitamente y su POST se borra; la tabla NO se dropea todavía.

Grep de insert(adminEscolarPagos) da cero en todo el repo. El POST responde 409 sin ningún guard (ni sesión). Pero la tabla puede tener filas históricas en alguna de las 6 escuelas y el GET alimenta /pagos. Borrar datos en producción sin verificar es peor que dejarla marcada.

_Descartado:_ Dropear tabla y ruta en el mismo merge. Descartada hasta comprobar SELECT count(*) en las 6 escuelas.

### admin_escolar_materias entra al merge pero su UI se oculta tras un flag; no se le construye nada nuevo.

Nada la referencia (schema.ts:1490 lo admite: 'aún no ligado a matrícula'). Es una tabla y dos rutas CRUD sin consumidor. Borrarla obliga a tocar la migración base de Darian; dejarla visible vende una funcionalidad que no existe.

_Descartado:_ Borrarla del schema y de 0079_administracion_escolar_tablas.sql. Descartada: rompe la idempotencia de la migración de Darian y hay que preguntarle si tiene la fase 2 a medias.

## Hallazgos que bloquean el merge

### CRITICO (8)

- **[multi-tenancy]** `/tmp/vera-escolar/app/api/administracion-escolar/cargos/route.ts`
  - Cadena completa de fuga entre empresas. El POST (líneas 50-88) valida SOLO periodoId contra el team (líneas 66-71) y luego inserta estudianteId, matriculaId y conceptoId tal como vienen del body (líneas 76-88), sin ninguna verificación de pertenencia. La DB no lo frena porque admin_escolar_cargos referencia los PK pelados, no (team_id, id) — ver /tmp/vera-escolar/lib/db/schema.ts:1609-1612. El GET (líneas 25-47) cierra la fuga: hace leftJoin a admin_escolar_estudiantes y admin_escolar_conceptos_pago SIN eq(teamId) (líneas 43-44), filtrando únicamente por adminEscolarCargos.teamId (línea 21). Por tanto la fila cruzada se lee de vuelta trayendo los campos 'estudiante' y 'estudianteApellidos' de la OTRA empresa. Efecto secundario: estadisticasEstudiantes (/tmp/vera-escolar/lib/administracion-escolar/queries.ts:261-270) suma esos cargos y contamina el balance y el conteo de morosos de la empresa atacante.
  - _Arreglo:_ Dos capas. (a) Inmediato en el route: antes del insert, resolver estudianteId, matriculaId y conceptoId con eq(teamId) igual que ya se hace con periodoId en las líneas 66-71, y además exigir que la matrícula pertenezca al estudiante y al período indicados; devolver 404 si algo no cuadra. (b) Defensa en profundidad: añadir eq(adminEscolarEstudiantes.teamId, teamId) y eq(adminEscolarConceptosPago.teamId, teamId) dentro de la condición ON de ambos leftJoin de las líneas 43-44 (drizzle acepta and(...) en el leftJoin, como ya hace este mismo repo en estudiantes/[id]/pagos/route.ts:37-40). (c) Estructural, para el merge: UNIQUE (team_id, id) en las tablas padre y FKs compuestas (team_id, estudiante_id) etc., para que Postgres rechace la referencia cruzada aunque la capa app falle.

- **[multi-tenancy]** `/tmp/vera-escolar/app/api/administracion-escolar/matriculas/route.ts`
  - Mismo patrón que en cargos, vector independiente. El POST (líneas 48-72) no valida estudianteId ni cursoId contra el team: solo periodoId se valida de forma indirecta dentro de conflictoMatriculaActivaPorPeriodo (/tmp/vera-escolar/lib/administracion-escolar/matricula-periodo.ts:27-35), y ese helper ni siquiera se invoca cuando el estado enviado no es 'activa' (línea 57), con lo que en ese camino NINGÚN id se valida. El insert de las líneas 63-72 escribe los ids crudos. El GET (líneas 24-45) hace tres leftJoin — estudiantes, periodos y cursos — SIN eq(teamId) (líneas 40-42), filtrando solo por adminEscolarMatriculas.teamId (línea 21). La incoherencia es evidente contra el PATCH hermano /tmp/vera-escolar/app/api/administracion-escolar/matriculas/[id]/route.ts:34-43, que SÍ valida período y curso contra el team: el autor conocía el patrón correcto y no lo aplicó en el POST.
  - _Arreglo:_ En el POST, replicar exactamente el bloque de validación del PATCH (matriculas/[id]/route.ts:34-43): resolver estudianteId y cursoId con eq(teamId) y responder 404 si no pertenecen, ANTES del insert, y hacerlo con independencia del estado enviado. Añadir además eq(...teamId, teamId) en las condiciones ON de los tres leftJoin de las líneas 40-42.

- **[correctitud]** `/tmp/vera-escolar/app/(dashboard)/dashboard/administracion-escolar/estudiantes/[id]/_perfil-client.tsx:21`
  - Importa `PagoModal` y el tipo `Cuenta` de '@/components/cuentas-por-cobrar/PagoModal'. En la rama destino ese módulo NO EXISTE: verifiqué que no hay directorio components/cuentas-por-cobrar y que `find -name 'PagoModal*'` no devuelve nada en todo el worktree. El perfil del estudiante — la pantalla de 1689 líneas, la principal del módulo — no compila al bajarla.
  - _Arreglo:_ Decidir explícitamente entre: (a) portar components/cuentas-por-cobrar/PagoModal.tsx desde /tmp/vera-escolar junto con el módulo, o (b) reescribir el flujo de cobro sobre lo que ya existe en el destino (components/pagos/PagoMetodos.tsx y components/pagos/CobrarLinkButton.tsx). La opción (b) es la coherente con la arquitectura de módulos, pero cambia la UX del cobro in-place; no la tomes por inercia. Si eliges (a), el modal entra como deuda técnica cross-módulo que habrá que resolver igual.

- **[correctitud]** `/tmp/vera-escolar/lib/administracion-escolar/`
  - El directorio lib/administracion-escolar/ (periodo-utils, estudiante-utils) no existe en la rama destino — verificado con ls sobre el worktree. Lo importan 5 ficheros: _perfil-client.tsx:17 (SEXOS, labelSexo, calcularEdad), _perfil-client.tsx:25 (mesesDelPeriodo), cargos/_page-client.tsx:18, estudiantes/nuevo/_nuevo-client.tsx:14 y CrearCargoEstudianteDialog.tsx:10.
  - _Arreglo:_ Incluir lib/administracion-escolar/ en el conjunto de ficheros a bajar. Es una dependencia obligatoria del módulo, no opcional: sin mesesDelPeriodo no funciona ni el selector de meses de cargos ni la tabla mensual del perfil.

- **[UX]** `/tmp/vera-escolar/app/(dashboard)/dashboard/administracion-escolar/estudiantes/_page-client.tsx:24,72,157-170`
  - El listado de estudiantes convierte cualquier fallo de servidor en un empty state MENTIROSO. El fetcher de la línea 24 es `fetch(url).then(r => r.json())` sin comprobar `r.ok`, así que un 500 que devuelve `{error: '...'}` resuelve como éxito. La línea 72 desestructura solo `{ data, isLoading }` de useSWR — nunca lee `error`. Resultado: `data.estudiantes ?? []` da [], `total` da 0, y el ternario de la línea 159 entra por la rama `total === 0` y pinta 'Aún no hay estudiantes registrados' (línea 163) con un botón 'Nuevo estudiante'. El usuario de un colegio con 800 alumnos ve que su base está vacía y no tiene botón de reintentar. Es la ÚNICA pantalla del módulo sin estado de error: pagos (:127), cargos (:389) y matrículas (:216) sí tienen `loadError` con botón 'Reintentar'.
  - _Arreglo:_ 1) En el fetcher (línea 24) lanzar si `!r.ok`: `const fetcher = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error((await r.json().catch(()=>({}))).error ?? 'Error cargando estudiantes'); return r.json(); }`. 2) Desestructurar `error` y `mutate` en la línea 72 y añadir una rama `error ?` ANTES de la comprobación de `total === 0`, replicando el bloque de pagos/_page-client.tsx:127-132 (icono + mensaje en text-red-600 + botón Reintentar que llame a `mutate()`). Sin el paso 1 el paso 2 no sirve, porque SWR nunca ve el fallo.

- **[dinero/redondeo]** `/tmp/vera-escolar/lib/administracion-escolar/queries.ts:374-408`
  - `sincronizarSaldosDesdeFacturas` FUERZA que la suma de saldos de los cargos de una factura sea igual a `factura.montoTotal`, en vez de derivar cada saldo del monto propio del cargo. El reparto `shares` (líneas 377-387) ignora `montoCentavos` como tope: si la factura vale menos que la suma de los cargos, la deuda excedente se DESTRUYE silenciosamente.
  - _Arreglo:_ No repartir `montoTotal`. Calcular `aplicado` = cobrado de la factura (pagos_recibidos + NC) y aplicarlo en cascada contra `c.montoCentavos` de cada cargo, con `saldo = max(0, montoCentavos - aplicadoAlCargo)`. Si `SUM(montoCentavos) != factura.montoTotal`, no ajustar saldos: marcar la vinculación como inconsistente y exponer la diferencia en la UI.

- **[dinero/redondeo]** `/tmp/vera-escolar/lib/administracion-escolar/queries.ts:381-397`
  - El reparto usa `f.montoTotal`, que INCLUYE ITBIS (`lib/ecf/types.ts:332`: montoTotal = gravado + exento + totalItbis), mientras el cargo se creó con monto SIN impuesto y el prefill facturó el precio sin impuesto (`prefill-factura/route.ts:132` manda `saldoCentavos/100` como `precioUnitarioItem`, y la tasa sale del producto en las líneas 119-122). La deuda escolar se infla por el ITBIS sin que exista ningún cobro.
  - _Arreglo:_ Separar base imponible de total: repartir `factura.montoTotal - factura.totalItbis` (o guardar en el cargo si su monto es tax-inclusive) y comparar siempre contra la misma base con la que se creó el cargo. Alternativamente, decidir que el cargo escolar es tax-inclusive y crearlo ya con ITBIS desde el inicio, no solo cuando lo crea el motor recurrente.

- **[correctitud]** `/tmp/vera-escolar/lib/administracion-escolar/queries.ts:399`
  - Anular la FACTURA borra la deuda escolar de forma permanente e irreversible. Si `estadoPago === 'ANULADA'` el cargo pasa a estado 'anulado' (que está fuera de ESTADOS_DEUDA, queries.ts:25) → desaparece de toda suma de deuda aunque el colegio nunca cobró. Además queda con `saldo` > 0 persistido (no se pone en 0, a diferencia de la anulación manual en `cargos/[id]/route.ts:73`), o sea estado y saldo se contradicen. Y no hay vuelta atrás: la línea 330 (`ne(estado,'anulado')`) excluye para siempre ese cargo del sync, el DELETE es no-op idempotente (`cargos/[id]/route.ts:63`) y re-emitir el mes desde el motor recurrente tampoco lo recupera (`facturacion-recurrente.ts:76-82` retorna temprano porque el cargo ya tiene OTRO ecfDocumentId).
  - _Arreglo:_ Ante factura ANULADA: devolver el cargo a 'pendiente'/'vencido' con `saldo = montoCentavos`, limpiar `ecfDocumentId` y permitir revinculación. Reservar el estado 'anulado' exclusivamente para la anulación manual del cargo (DELETE), y no excluir del sync los cargos anulados por factura.

### ALTO (14)

- **[permisos]** `/tmp/vera-escolar/app/api/administracion-escolar/estudiantes/route.ts`
  - 14 handlers GET del módulo se guardan solo con getTeamIdForUser() y no llaman requirePermission: estudiantes/route.ts:27, estudiantes/[id]/route.ts:13, estudiantes/[id]/cargos/route.ts:14, estudiantes/[id]/matriculas/route.ts:13, estudiantes/[id]/pagos/route.ts:18, estudiantes/[id]/tutores/route.ts:18, tutores/route.ts:9, matriculas/route.ts:17, cargos/route.ts:15, pagos/route.ts:13, periodos/route.ts:10, cursos/route.ts:9, materias/route.ts:9, conceptos/route.ts:11. getTeamIdForUser (/tmp/vera-escolar/lib/db/queries.ts:151-204) solo resuelve sesión + membresía del team activo: cualquier miembro autenticado, incluido un rol custom sin un solo permiso 'administracion-escolar:*', lee nombres de menores, fechas de nacimiento, sexo, tutores con teléfono/email/documento, deudas y cobros. IMPORTANTE PARA CALIBRAR: verifiqué que esto coincide con la convención del repo (clientes/route.ts:14-18 y productos/route.ts:32-36 usan el mismo par getUser+getTeamIdForUser sin permiso), así que NO es una desviación del autor. Lo que sí es específico y grave aquí: el permiso 'administracion-escolar:ver' EXISTE, está declarado en /tmp/vera-escolar/lib/config/roles.ts:64 y repartido por rol (líneas 128, 149, 169, 189), pero se aplica exclusivamente en el gate de páginas /tmp/vera-escolar/app/(dashboard)/dashboard/administracion-escolar/layout.tsx:10 y en el mapa de rutas de app/(dashboard)/dashboard/layout.tsx:140-143. En cero endpoints. El rol Auditor/lector, que por diseño solo debería VER, y cualquier rol custom sin permisos escolares, acceden idénticamente por API.
  - _Arreglo:_ Sustituir getTeamIdForUser() por requirePermission('administracion-escolar:ver') en los 14 GET; el helper ya devuelve teamId (lib/auth/api-guard.ts:56), así que el cambio es de dos líneas por archivo y no toca las queries. Esto es requisito para el port a módulo de primera clase: una vez que el gate visual sea el rail y el switcher, el layout deja de ser la única barrera y la API queda como única superficie real.

- **[permisos]** `/tmp/vera-escolar/lib/administracion-escolar/queries.ts`
  - Endpoints de solo lectura que MUTAN la contabilidad de deuda, sin permiso y sin control de concurrencia. sincronizarSaldosDesdeFacturas persiste cambios con UPDATE sobre admin_escolar_cargos en las líneas 412-416 (saldoCentavos, estado, updatedAt). Se dispara desde tres GET sin requirePermission: estudiantes/[id]/cargos/route.ts:18, estudiantes/[id]/route.ts:21 y, para TODO el team, desde listarEstudiantesEnriquecidos (queries.ts:82) que invoca el GET de estudiantes/route.ts:33. Además el algoritmo lee (líneas 317-348), calcula en JS (líneas 363-409) y escribe (412-416) sin transacción ni SELECT FOR UPDATE: dos peticiones concurrentes sobre la misma factura pueden pisarse. Contrasta con el cuidado de cargos/[id]/saldar-con-factura/route.ts:45-49, que sí usa transacción con .for('update').
  - _Arreglo:_ Separar lectura de escritura: que los GET solo lean, y mover la sincronización a un punto de escritura explícito (al registrar el pago, al vincular factura, o a un job) o exponerla como POST /api/administracion-escolar/sincronizar con requirePermission('administracion-escolar:pagos'). Si por plazos se mantiene en el GET, como mínimo exigir el permiso ':ver' y envolver el bloque 317-416 en una transacción con FOR UPDATE sobre los cargos de las facturas afectadas.

- **[multi-tenancy]** `/tmp/vera-escolar/lib/administracion-escolar/facturacion-recurrente.ts`
  - reflejarFacturaRecurrenteEnCargo localiza la matrícula por facturaRecurrenteId SIN filtrar por teamId (líneas 25-38: el where de la línea 37 es solo eq(adminEscolarMatriculas.facturaRecurrenteId, args.facturaRecurrenteId)) y a continuación usa el teamId de la fila encontrada como origen de confianza para insertar el cargo (línea 112). Nunca contrasta el team del documento facturado (args.documentoId) con el team de la matrícula. Es el único punto del módulo donde se escribe en admin_escolar_cargos sin un teamId autenticado de origen. Hoy el riesgo está acotado porque el único llamador es el motor de cobranza (lib/cobranza/recurrente.ts) sin request de usuario de por medio, y porque el unique index admin_escolar_matriculas_factura_recurrente_uniq (schema.ts:1582) hace que facturaRecurrenteId sea único; pero la función es exportada y no defiende su propia invariante.
  - _Arreglo:_ Pasar el teamId del documento facturado como argumento explícito desde lib/cobranza/recurrente.ts y añadirlo al where de la línea 37: and(eq(facturaRecurrenteId, ...), eq(adminEscolarMatriculas.teamId, args.teamId)). Si no coinciden, salir sin efecto y registrar el incidente en lugar de escribir.

- **[UX]** `/tmp/vera-escolar/components/administracion-escolar/EstudianteFicha.tsx:60-74`
  - El `Promise.all([...]).then(...)` de la ficha lateral no tiene `.catch()`. Si cualquiera de los dos fetch (/cargos, /tutores) falla, el `.then` nunca corre, `setLoading(false)` (línea 71) nunca se ejecuta y el bloque de totales (línea 123) se queda con el spinner girando indefinidamente. Además genera un unhandled promise rejection en consola. Los tres totales (Deuda/Pago/Pendiente) no aparecen nunca y no hay forma de reintentar.
  - _Arreglo:_ Añadir `.catch()` a la cadena que ponga `setLoading(false)` y un estado `error`, y renderizar en el bloque de la línea 122-133 un mensaje corto con reintento (la ficha es estrecha: basta un texto en text-red-600 y un botón ghost 'Reintentar' que re-dispare el efecto). Guardar el `cancel` también en la rama de error para no setear estado tras desmontar.

- **[UX]** `/tmp/vera-escolar/app/(dashboard)/dashboard/administracion-escolar/estudiantes/[id]/_perfil-client.tsx:207-225,281-286`
  - `cargar()` es un `try { ... } finally { setLoading(false) }` SIN `catch`. Ante un fallo de red, `estudiante` se queda en null, el `finally` apaga el loading, y el early-return de la línea 281 pinta 'Estudiante no encontrado.' — un mensaje FALSO: el estudiante existe, lo que falló es la red o el servidor. El usuario concluye que el alumno fue borrado. Además el error sube como unhandled rejection. Ninguno de los 4 fetch en paralelo (líneas 211-216) comprueba `r.ok` tampoco.
  - _Arreglo:_ Separar los dos casos: añadir `catch` que setee un estado `loadError` distinto de `notFound`, y en el render distinguir la rama de error (mensaje de conexión + botón 'Reintentar' que llame a `cargar()`) de la rama 404 real (que ya la detecta bien la línea 209 vía `!est.estudiante`). Comprobar `r.ok` en los 4 fetch de las líneas 211-216.

- **[UX]** `/tmp/vera-escolar/app/(dashboard)/dashboard/administracion-escolar/estudiantes/[id]/_perfil-client.tsx:724`
  - El botón 'Estado de cuenta' es `onClick={() => window.print()}` y produce una HOJA EN BLANCO. app/globals.css:283-286 declara `@media print { body * { visibility: hidden } }` y solo revuelve visible `.print-area, .print-area *` (líneas 287-290). Verifiqué que el módulo escolar no usa `.print-area` ni `.no-print` en ninguno de sus 23 ficheros. El único consumidor de esa clase en el repo es app/(print)/caja/imprimir/[id]/page.tsx:172. O sea: la funcionalidad estrella del perfil está rota hoy, en origen, no como consecuencia del merge.
  - _Arreglo:_ Corto plazo: marcar el contenedor imprimible del perfil con `print-area` y poner `no-print` en las barras de acciones, tabs y filtros. Medio plazo (lo correcto): un estado de cuenta no es un window.print() del DOM de gestión — hacer una ruta dedicada bajo app/(print)/ siguiendo el patrón que ya existe en caja/imprimir/[id], con su propio layout, cabecera del colegio, período y desglose. Decidirlo antes del merge, porque una ruta (print) queda FUERA del layout del módulo nuevo y eso simplifica el problema en vez de complicarlo.

- **[UX]** `/tmp/vera-escolar/components/ui/badge.tsx (destino) vs 29 usos en el módulo escolar`
  - El shim Badge del destino (components/ui/badge.tsx:29-43) renderiza un `<Chip>` de MUI y le aplica `sx` con `bgcolor`/`color` según `variant` (getChipSx, líneas 14-27). Los 29 Badges del módulo escolar codifican su significado SOLO con className de Tailwind (`bg-red-50 text-red-600`, `bg-teal-50 text-teal-700`, `bg-amber-50`, `bg-emerald-50`, `bg-blue-50`...). Como el `sx` de MUI se inyecta vía emotion con más especificidad que una utility de Tailwind, el color del sx gana y los badges quedan todos del mismo gris. Dos consecuencias: (a) EstadoCargoBadge (_perfil-client.tsx:1543-1548) deja de distinguir Pagado/Adelantado/Vencido/Parcial/Por vencer — cinco estados idénticos; (b) en estudiantes/_page-client.tsx:206-207 la deuda en rojo y 'Al día' en verde se vuelven indistinguibles. Además Chip renderiza `<div>`, no `<span>`, así que cualquier Badge dentro de un `<p>` pasaría a ser HTML inválido (hoy no ocurre: lo escaneé y hay 0 casos, pero es una mina para quien edite después). Detalle extra: ese shim destructura `...props` en la línea 29 y NUNCA lo propaga al Chip — hoy no rompe nada porque escolar solo pasa className/variant (verificado), pero cualquier onClick/title futuro se perderá en silencio.
  - _Arreglo:_ No dejar que el shim decida el color. Mapear los estados escolares a `variant` semánticos del Badge del destino (destructive para vencido, default para pagado, secondary para por vencer, outline para parcial/adelantado) y borrar las clases bg-*/text-*/border-* de los 29 usos, en vez de pelear la especificidad con `!important`. Si hacen falta más de los 6 variants existentes, extender getChipSx en el destino — es el sitio correcto, y de paso el color pasa a salir del tema MUI y deja de estar hardcodeado.

- **[UX]** `/tmp/vera-escolar/app/(dashboard)/dashboard/administracion-escolar/layout.tsx:9-12`
  - El layout del módulo son 12 líneas que solo hacen `await requirePermission('administracion-escolar:ver')` y devuelven `<>{children}</>`. No pinta nada: ni rail, ni cabecera, ni título de módulo, ni switcher, ni fondo. Toda la navegabilidad entre las 5 pantallas vive en el grupo del sidebar de Facturación (app/(dashboard)/dashboard/layout.tsx:74-85). Sacado de ahí para ser un módulo de primera clase, el usuario entra a /estudiantes y no tiene NINGUNA forma de llegar a Matrículas, Cargos, Pagos o Configuración. Tampoco hay landing: page.tsx:4 es un `redirect` a /estudiantes, así que un MODULE_HOME apuntaría a una ruta que solo redirige.
  - _Arreglo:_ Escribir el layout a imitación de app/cuenta/layout.tsx (NO de app/pos/layout.tsx, ver el hallazgo de overflow): `<Box sx={{display:'flex', height:'100vh', bgcolor:'#f9fafb'}}>` + un `<EscolarNavRail />` nuevo modelado sobre components/pos-nav-rail.tsx con las 5 entradas + `<Box sx={{flex:1, minWidth:0, height:'100%', overflowY:'auto'}}>{children}</Box>`. El `requirePermission` actual debe convertirse en `requireModule('escolar')` y hay que añadir el permiso `modulo:escolar` en lib/config/roles.ts, la entrada en lib/config/modules.ts y en components/module-switcher.tsx. Decidir también si page.tsx sigue redirigiendo o se convierte en un dashboard real del módulo — hoy no existe esa pantalla y es la que da sentido a un módulo de primera clase.

- **[UX]** `/tmp/vera-escolar/app/(dashboard)/dashboard/administracion-escolar/** (las 8 pantallas raíz)`
  - Ninguna pantalla gestiona su propio scroll ni altura: las 8 son `<section className="p-6 ...">` sin h-full ni overflow (estudiantes:96, nuevo:136, perfil:282 y :297, configuracion:231, cargos:339, matriculas:162, pagos:95). Dependen por completo de que un ancestro scrollee: en origen es `<main className="flex-1 overflow-y-auto">` en app/(dashboard)/dashboard/layout.tsx:902. El mapeo señala app/pos/layout.tsx como 'el modelo a imitar', y ese layout pone `overflow: 'hidden'` en el Box hijo (línea 16) porque el POS es una grilla táctil de altura fija. Copiarlo recorta las 8 pantallas escolares sin barra de scroll: el perfil de 1689 líneas quedaría inaccesible por debajo del fold.
  - _Arreglo:_ Copiar app/cuenta/layout.tsx:15 (`overflowY: 'auto'`), no app/pos/layout.tsx:16. Como bonus, esa elección mantiene funcionando el `sticky top-4` de EstudianteFicha.tsx:85: el sticky se resuelve contra el Box con overflowY:'auto', que es el mismo rol que hoy cumple el <main>. Si además se mete una cabecera de módulo DENTRO de ese Box scrolleable, hay que subir el `top-4` de la ficha al alto de esa cabecera o la ficha se pegará por debajo de ella.

- **[dinero/redondeo]** `/tmp/vera-escolar/lib/administracion-escolar/queries.ts:340-348`
  - El cobro de la factura se calcula sumando SOLO `pagosRecibidos`, ignorando las Notas de Crédito. El propio motor de facturación sí las descuenta (`lib/facturas/estado-pago.ts:53-63` + `lib/facturas/notas-credito.ts`, getNcAplicadoCts). Resultado: una NC parcial condona el saldo en la factura pero el cargo escolar sigue mostrando la deuda completa.
  - _Arreglo:_ En el paso 3 sumar también las NC aplicadas por factura (reutilizar `NC_APLICADO_SUBQUERY` / `getNcAplicadoCts`) para construir `restante`, exactamente igual que `calcularEstadoPago`.

- **[dinero/redondeo]** `/tmp/vera-escolar/lib/administracion-escolar/queries.ts:383-401`
  - Una factura con `montoTotal = 0` (borrador sin líneas; el default de la columna es 0, `lib/db/schema.ts:387`) produce shares en 0 para todos sus cargos, y como `saldo === 0` la rama de la línea 401 los marca 'pagado'. Vincular un borrador vacío salda la deuda.
  - _Arreglo:_ Guardar explícitamente: si `f.montoTotal <= 0`, no tocar los cargos (o dejarlos en 'pendiente' con su saldo original) y avisar en la UI. Además, no permitir vincular facturas en estado BORRADOR sin líneas.

- **[dinero/redondeo]** `/tmp/vera-escolar/lib/administracion-escolar/queries.ts:374`
  - La facturación consolidada de varios meses reparte proporcionalmente por `montoCentavos` (monto original) cuando lo que se facturó fue el `saldoCentavos` pendiente (`prefill-factura/route.ts:132` y `NuevaFacturaForm.tsx:407` guardan y facturan el SALDO). Los dos extremos usan bases distintas, así que el saldo por mes queda mal aunque el total cuadre.
  - _Arreglo:_ Repartir por el saldo pendiente al momento de vincular (o mejor: eliminar el reparto y aplicar el cobro en cascada contra el saldo real de cada cargo, ver hallazgo principal). Persistir en el cargo el monto efectivamente facturado si se decide facturar saldos parciales.

- **[multi-tenancy]** `/tmp/vera-escolar/app/api/administracion-escolar/cargos/route.ts:54-88`
  - El POST de cargos solo valida contra el team el `periodoId` (líneas 66-71). `estudianteId`, `matriculaId` y `conceptoId` se insertan sin verificar pertenencia: las FK son globales, así que se puede crear un cargo con TU teamId que apunta al estudiante/matrícula/concepto de OTRO tenant. El GET (línea 43) luego hace leftJoin con `adminEscolarEstudiantes` sin filtrar por team, de modo que el nombre del estudiante ajeno se renderiza en tu listado.
  - _Arreglo:_ Validar en el mismo request que estudianteId, matriculaId y conceptoId existan CON `teamId = auth.teamId` (y que la matrícula sea del estudiante indicado); devolver 404 si no. Aplicar lo mismo en `matriculas/route.ts:63-72` (estudianteId/periodoId/cursoId tampoco se validan) y en `cargos/generar/route.ts` para `conceptoId`.

- **[permisos]** `/tmp/vera-escolar/app/api/administracion-escolar/cargos/[id]/route.ts:20-25`
  - El PATCH vincula CUALQUIER factura del team a cualquier cargo: solo verifica que la factura exista y sea del team. No aplica el guard de tutor responsable que sí tiene la otra ruta de vinculación (`saldar-con-factura/route.ts:56-71`: exige que `factura.clientId === tutorResponsable.clientId`). El filtro por cliente vive solo en el cliente (VincularFacturaDialog.tsx:49). Combinado con el reparto del hallazgo principal, vincular la factura equivocada reescribe saldos de varios estudiantes a la vez. Además los GET de este módulo (`cargos/route.ts:14`, `pagos/route.ts:12`) solo comprueban sesión con `getTeamIdForUser`, sin `requirePermission('administracion-escolar:*')` como el resto de las rutas.
  - _Arreglo:_ Extraer el guard de tutor responsable de saldar-con-factura a un helper y aplicarlo también en el PATCH. Añadir `requirePermission('administracion-escolar:ver')` (o el permiso de lectura correspondiente) a los GET de cargos y pagos.

### MEDIO (15)

- **[permisos]** `/tmp/vera-escolar/app/api/administracion-escolar/pagos/route.ts`
  - El POST de la línea 54 no tiene NINGÚN guard: ni requirePermission ni getTeamIdForUser ni siquiera comprobación de sesión. Es un handler exportado y públicamente enrutado que responde a peticiones sin autenticar. Hoy es inofensivo porque su cuerpo entero es un 409 fijo indicando que el módulo ya no registra pagos propios, pero deja una firma sin guard que la próxima persona que quiera 'reactivar los pagos escolares' rellenará sin notar que no hay autenticación arriba. Contexto: la tabla admin_escolar_pagos que sirve su GET hermano (línea 12, también sin permiso) es código muerto — un grep de insert(adminEscolarPagos) en todo el repo da cero resultados.
  - _Arreglo:_ Decidir en el merge: o borrar la ruta y la tabla legacy por completo (opción preferible, elimina 4 FKs hacia facturación/users que amplían la superficie del merge sin aportar nada), o dejar el 409 pero anteponiendo requirePermission('administracion-escolar:pagos') para que la firma no quede sin guard.

- **[multi-tenancy]** `/tmp/vera-escolar/app/api/administracion-escolar/cargos/[id]/prefill-factura/route.ts`
  - El cargo se resuelve correctamente con eq(teamId) (línea 55), pero el leftJoin a adminEscolarConceptosPago (línea 53) y el encadenado a products (línea 54) no llevan filtro de team. Si el conceptoId del cargo es cruzado — cosa que el hallazgo crítico nº1 permite plantar — la respuesta devuelve productNombre, productTasa y productTipo (líneas 48-50) del catálogo de la otra empresa, que se emiten al cliente en el payload de la línea 129 y siguientes. Misma observación menor en el leftJoin a dependientes de la línea 74, aunque ahí el id proviene de un estudiante ya validado por team.
  - _Arreglo:_ Añadir eq(adminEscolarConceptosPago.teamId, teamId) y eq(products.teamId, teamId) en las condiciones ON de los leftJoin de las líneas 53-54. Se vuelve redundante una vez arreglado el nº1, pero es la defensa en profundidad correcta y cuesta dos líneas.

- **[permisos]** `/tmp/vera-escolar/lib/config/roles.ts`
  - No existe gate de módulo. Ningún endpoint escolar comprueba teams.modulosHabilitados ni equivalente — de hecho ese concepto no existe en esta rama: no hay permiso 'modulo:administracion-escolar' ni helper requireModule. El único gate es 'administracion-escolar:ver' en el layout de páginas. Agravante: la migración /tmp/vera-escolar/lib/db/migrations/0074_administracion_escolar_permisos.sql reparte los cuatro permisos escolares a TODOS los teams existentes mediante CROSS JOIN sobre team_roles, sin distinguir colegios de empresas normales; y lib/config/roles.ts:128,149,169,189 hace lo mismo para los teams nuevos vía seedSystemRoles. Es decir, toda empresa del sistema — incluidas las que jamás contratarán el módulo escolar — nace con permiso para consumir sus 25 endpoints.
  - _Arreglo:_ Parte obligatoria del port: (a) migración nueva que añada 'escolar' como valor válido de teams.modulos_habilitados y otorgue 'modulo:escolar' solo a los teams que corresponda, siguiendo el estilo del INSERT ... ON CONFLICT DO NOTHING de 0071_modulos.sql de la rama destino; (b) aplicar requireModule('escolar') a las 25 rutas, no solo al layout; (c) NO repartir 'administracion-escolar:*' por CROSS JOIN a todos los teams — condicionarlo a los que tengan el módulo activo.

- **[correctitud]** `/tmp/vera-escolar/app/api/administracion-escolar/estudiantes/[id]/route.ts`
  - Hard-delete sin guardas de negocio. El DELETE (líneas 76-86) borra físicamente al estudiante comprobando solo id + teamId, sin verificar matrículas, cargos vivos ni facturas vinculadas. Como admin_escolar_matriculas.estudianteId y admin_escolar_cargos.estudianteId son NOT NULL con FK sin ON DELETE (schema.ts:1564 y 1609 — solo estudiante_tutores tiene CASCADE, schema.ts:1547), Postgres lanza un error de FK crudo que ninguna capa captura: 500 al usuario. Y si el estudiante no tiene cargos, el borrado sí procede y se pierde el histórico sin rastro, porque no hay soft-delete más allá del campo 'estado'. Idéntico problema en /tmp/vera-escolar/app/api/administracion-escolar/tutores/[id]/route.ts:39-49, que además no comprueba si el tutor es responsablePago de algún estudiante ni si hay facturas emitidas a su cliente. Incoherente con la anulación blanda y bien guardada de cargos/[id]/route.ts:47-76.
  - _Arreglo:_ Antes de borrar, contar matrículas y cargos del estudiante; si hay alguno, responder 409 con un mensaje accionable ('el estudiante tiene N cargos; retíralo en lugar de eliminarlo'). Preferible convertirlo en baja lógica usando el campo estado ('retirado'), que ya existe. Mismo tratamiento para tutores, comprobando responsablePago y facturas del cliente vinculado.

- **[multi-tenancy]** `/tmp/vera-escolar/app/api/administracion-escolar/estudiantes/[id]/tutores/route.ts`
  - Dentro de la transacción del POST, el SELECT sobre dependientes de las líneas 99-100 filtra solo por eq(dependientes.id, est.dependienteId), sin eq(dependientes.teamId, teamId), para decidir si el dependiente es coherente con el cliente pagador. Rompe el patrón del resto del archivo, que sí valida estudiante (línea 65) y tutor (línea 70) contra el team, y del propio bloque siguiente (línea 106) que sí filtra por teamId. El impacto real es bajo porque dependienteId proviene de un estudiante ya validado, pero si ese campo quedó apuntando a un dependiente de otra empresa (lo permite el PATCH histórico o una carga manual), la comparación de la línea 101 decide sobre datos ajenos y puede saltarse la creación del dependiente correcto.
  - _Arreglo:_ Añadir eq(dependientes.teamId, teamId) al where de la línea 100, igual que en la línea 106.

- **[UX]** `/tmp/vera-escolar/app/(dashboard)/dashboard/administracion-escolar/estudiantes/_page-client.tsx:173`
  - El wrapper de la tabla de estudiantes usa `overflow-hidden` en vez de `overflow-x-auto`. Es la ÚNICA tabla del módulo que no puede scrollear horizontalmente: todas las demás usan overflow-x-auto (cargos:410, matriculas:239, pagos:144, TutoresPanel:273, perfil:1147 y :1635). Con 5 columnas dentro de una Card que a su vez ocupa lg:col-span-2 de una grid de 3, en viewport estrecho las columnas Tutor y Balance se recortan sin posibilidad de verlas. Empeora con un rail estrecho si la grid no se reajusta.
  - _Arreglo:_ Cambiar `overflow-hidden` por `overflow-x-auto` en la línea 173, igual que las otras 6 tablas del módulo. Si se quiere conservar el redondeo de esquinas que motivaba el overflow-hidden, usar `overflow-x-auto` sobre el mismo div (ya lleva rounded-lg border) — es exactamente lo que hacen cargos:410 y pagos:144.

- **[UX]** `/tmp/vera-escolar/components/administracion-escolar/*.tsx (los 7) + ~15 grids en pantallas`
  - Los 7 componentes de components/administracion-escolar/ tienen CERO prefijos responsive (medí sm/md/lg/xl en los 7: todos a 0), pese a que TutoresPanel son 533 líneas con tabla y formularios. Y hay ~15 `grid grid-cols-2` sin prefijo de breakpoint que se quedan a dos columnas incluso a 320px: cargos:458,519,555,647; matriculas:295,315; TutoresPanel:443,458; EditarMatriculaDialog:212; CrearCargoEstudianteDialog:173; nuevo:158,184; perfil:307,1008; EstudianteFicha:106. En móvil, dos Inputs o dos Selects por fila dentro de un Dialog quedan a ~130px cada uno: las etiquetas se parten y los Select truncan el valor.
  - _Arreglo:_ Convertir esos `grid-cols-2` en `grid-cols-1 sm:grid-cols-2` de forma sistemática (es un cambio mecánico y seguro). Prioriza los que están dentro de Dialog, que es donde el ancho ya viene limitado por el propio modal. Aprovecha el paso para meter los breakpoints que faltan en los 7 componentes.

- **[UX]** `/tmp/vera-escolar/app/(dashboard)/dashboard/administracion-escolar/estudiantes/_page-client.tsx:186-190 y estudiantes/[id]/_perfil-client.tsx:1223-1226`
  - Filas de tabla clicables sin ningún soporte de teclado. En el listado, `<tr onClick={() => setSelectedId(e.id)}>` (líneas 186-187) es el ÚNICO modo de abrir la ficha lateral de un estudiante: sin role, sin tabIndex, sin onKeyDown, un usuario de teclado o lector de pantalla no puede seleccionar a nadie. Lo mismo en las filas mensuales expandibles del perfil (`<tr onClick={onToggle}>`, 1223-1225): el detalle del mes es inalcanzable sin ratón. En 5.653 líneas del módulo hay 1 solo aria-label (_perfil-client.tsx:1372) y 2 onKeyDown, ambos para 'Enter guarda' en inputs (nuevo:261, EditarMatriculaDialog:253).
  - _Arreglo:_ En ambas filas: añadir `tabIndex={0}`, `role="button"` (o `aria-expanded` en la del perfil, que es un disclosure) y un `onKeyDown` que dispare con Enter y Espacio. En la fila del perfil, el `<ChevronRight>` de la línea 1229 debería ser un botón real con aria-expanded, que es más correcto que hacer clicable todo el `<tr>`. Nota: la celda de acciones ya hace bien el `stopPropagation` (línea 1245), pero el enlace a factura de la línea 1244 no, así que clicar la factura también togglea la fila.

- **[UX]** `/tmp/vera-escolar/app/(dashboard)/dashboard/administracion-escolar/estudiantes/[id]/_perfil-client.tsx:277-279 vs 281-286`
  - Salto de layout al terminar la carga del perfil. El early-return de loading (líneas 277-279) devuelve `<div className="flex justify-center py-24">` SIN el `p-6` que llevan tanto la rama de no-encontrado (línea 282, `<section className="p-6">`) como el render normal (línea 297, `<section className="p-6 space-y-5">`). El spinner se pega al borde del contenedor y, al resolver, todo el contenido salta 24px.
  - _Arreglo:_ Poner el early-return de loading dentro del mismo contenedor que las otras dos ramas: `<section className="p-6"><div className="flex justify-center py-24">…</div></section>`. Mejor aún, renderizar un esqueleto con la forma de la tarjeta de identidad para evitar el salto por completo — es la pantalla más pesada del módulo y siempre arranca en spinner.

- **[UX]** `/tmp/vera-escolar/app/(dashboard)/dashboard/administracion-escolar/** y components/administracion-escolar/** (175 ocurrencias)`
  - 175 literales `teal-<n>` repartidos por los 23 ficheros: `bg-teal-600 hover:bg-teal-700` en cada botón primario, `bg-teal-50/text-teal-700` en cada badge, `text-teal-600` en cada spinner. Ni un token de tema. En el destino el color primario se resuelve por MUI (`primary.main`), así que el módulo escolar sería el único que NO cambia de color si la empresa cambia de marca, y quedaría desalineado con Facturación y POS.
  - _Arreglo:_ Hacerlo con el merge, no después: es una sustitución mecánica pero toca 23 ficheros y crece cada día que pase. Para botones, migrar al Button del destino sin className de color (ya mapea a MUI y toma primary). Para badges, ver el hallazgo del shim Badge — los dos cambios son el mismo trabajo y conviene hacerlos en una sola pasada. Para spinners, un `color: 'primary.main'`. Ojo: teal-600 (#0d9488) es precisamente el color que el destino hardcodea en tabs.tsx (indicator backgroundColor '#0d9488'), así que visualmente el cambio será casi nulo — el beneficio es que deja de estar clavado.

- **[correctitud]** `/tmp/vera-escolar/app/api/administracion-escolar/pagos/route.ts:54-58`
  - La tabla `admin_escolar_pagos` está muerta: ningún camino del código inserta en ella (el POST devuelve 409 'deprecado' y no existe otro insert en app/, lib/ ni components/). Sin embargo la UI y las queries la siguen leyendo como si tuviera datos: el historial de Pagos del perfil, y `ultimoPagoFecha`/`ultimoPagoCentavos` del listado (`lib/administracion-escolar/queries.ts:195-213` y 236-237) que siempre son null.
  - _Arreglo:_ Decidir una de dos: (a) espejar cada `pagos_recibidos` de una factura vinculada como fila en `admin_escolar_pagos` (con pagoRecibidoId/ecfDocumentId), o (b) eliminar la tabla, la pestaña y las columnas derivadas, y leer el historial directamente de `pagos_recibidos` por las facturas vinculadas al estudiante.

- **[correctitud]** `/tmp/vera-escolar/lib/administracion-escolar/queries.ts:403`
  - 'vencido' solo se escribe dentro de `sincronizarSaldosDesdeFacturas`, es decir SOLO para cargos con factura vinculada. Un cargo vencido sin factura nunca cambia de estado, así que el contador 'Vencidos' de la página de cargos (`app/(dashboard)/dashboard/administracion-escolar/cargos/_page-client.tsx:190`, que filtra por `estado === 'vencido'`) da 0 permanentemente. El perfil sí compensa comparando fechas (`_perfil-client.tsx:1537`), de modo que las dos pantallas reportan realidades distintas del mismo cargo.
  - _Arreglo:_ Derivar 'vencido' de forma consistente (helper compartido que evalúe `saldo > 0 && fechaVencimiento < hoy`) y aplicarlo tanto a cargos con factura como sin ella, o computarlo siempre en lectura y no persistirlo.

- **[correctitud]** `/tmp/vera-escolar/app/api/administracion-escolar/cargos/route.ts:76-88`
  - El POST individual no tiene ninguna guarda de unicidad por (matrícula, concepto, mes, año) — y el diálogo 'Facturar varios meses' crea cargos precisamente en un bucle contra ese endpoint (`_perfil-client.tsx:957-970`). Repetir la operación duplica la mensualidad del mes y duplica la deuda. El generador masivo sí deduplica (`cargos/generar/route.ts:61-78`) pero por (periodo, concepto, mes) IGNORANDO `anio` (línea 70), y cuenta como existentes los cargos 'anulado', así que un mes anulado no se puede regenerar.
  - _Arreglo:_ Añadir índice único parcial sobre (matricula_id, concepto_id, mes, anio) para cargos no anulados, y responder 409 en el POST. En `generar`, incluir `anio` en la comparación y excluir los cargos en estado 'anulado' del set de existentes.

- **[dinero/redondeo]** `/tmp/vera-escolar/lib/administracion-escolar/facturacion-recurrente.ts:53-61`
  - `enlazar` pisa `montoCentavos` Y `saldoCentavos` con el total de la factura recurrente (que llega desde `lib/cobranza/recurrente.ts:196-201` como `montoCentavos: montoTotal`, o sea CON ITBIS), descartando lo ya abonado sobre ese cargo y cambiando la naturaleza del monto. Lo mismo en el insert de las líneas 119-120. Resultado: los cargos generados por el motor recurrente son tax-inclusive mientras los manuales son sin impuesto — dos unidades distintas sumadas en la misma deuda.
  - _Arreglo:_ No sobrescribir `montoCentavos` de un cargo preexistente; solo setear `ecfDocumentId` (y `fechaVencimiento` si estaba vacía) y dejar que el sync derive el saldo. Pasar la base sin ITBIS (`montoTotal - totalItbis`) para mantener una única unidad de monto en el módulo.

- **[rendimiento]** `/tmp/vera-escolar/lib/administracion-escolar/queries.ts:82`
  - `listarEstudiantesEnriquecidos` invoca `sincronizarSaldosDesdeFacturas(teamId)` SIN estudianteId, o sea recorre TODAS las facturas vinculadas y TODOS los cargos del colegio en cada carga del listado, y persiste con un UPDATE secuencial por cargo modificado fuera de transacción (queries.ts:412-416). Es una mutación disparada por un GET, sin atomicidad ni idempotencia frente a concurrencia.
  - _Arreglo:_ Limitar el sync a los ids de la página (ya se tienen en `ids`, línea 135) o moverlo a un job/on-write disparado al registrar cobro o vincular factura. Envolver los UPDATE en una transacción y agruparlos (un solo UPDATE ... FROM VALUES) en vez de un round-trip por cargo.

## Fases

### F0 · Preparación: rama de integración y captura del estado previo

**Objetivo:** Tener un punto de retorno y datos duros de producción antes de tocar nada.

**Pasos:**

- Crear rama de integración desde el destino: git checkout -b feature/modulo-escolar sobre 1b3c6e4 en el worktree stupefied-fermat-8e3852.
- Traer la rama escolar como remoto local: git remote add escolar /tmp/vera-escolar && git fetch escolar.
- Confirmar la merge-base: git merge-base HEAD escolar/<rama> debe dar 955efd5.
- Contra la DB de producción (solo SELECT, sin escribir): contar filas de admin_escolar_pagos por team_id, contar admin_escolar_estudiantes con dependiente_id IS NULL, y detectar duplicados de (matricula_id, concepto_id, mes, anio) entre cargos no anulados. Estos tres números deciden las fases 3, 6 y 8.
- Verificar qué migraciones 0005+ corrieron realmente en cada una de las 6 escuelas (el journal de drizzle está congelado en 0004; no hay tabla-ledger). Dejar el resultado escrito antes de renumerar.

**Archivos:** `/Users/alexanderferreras/Desktop/SolucionesDO/emitedo-v2/.claude/worktrees/stupefied-fermat-8e3852/lib/db/migrations/meta/_journal.json`

**Verificación:** git merge-base devuelve 955efd5 y existe un documento con los 3 conteos y el inventario de migraciones aplicadas por escuela.

**Riesgo:** BAJO en código, ALTO si se salta: sin saber qué corrió en cada escuela, la fase 3 se aplica a ciegas.

### F1 · Andamiaje del módulo 'escolar' en el destino, ANTES del merge

**Objetivo:** Que la clave 'escolar' exista y compile en el destino, para que el merge de la fase 2 tenga dónde aterrizar en vez de inventarlo a mitad de un conflicto.

**Pasos:**

- lib/config/modules.ts: MODULES = ['facturacion','pos','escolar'] (línea 9). Añadir entradas en MODULE_LABELS:12 ('Administración Escolar'), MODULE_DESCRIPTIONS:17 ('Estudiantes, matrículas, cargos y cobro escolar'), MODULE_ICONS:23 ('GraduationCap') y MODULE_HOME:29 ('/escolar').
- lib/config/modules.ts, moduleUrl():39 — hoy es un ternario de dos ramas. Reescribirlo como mapa: const ENV: Record<ModuleKey,string|undefined> = { pos: process.env.NEXT_PUBLIC_POS_URL, facturacion: process.env.NEXT_PUBLIC_FACTURACION_URL, escolar: process.env.NEXT_PUBLIC_ESCOLAR_URL }.
- lib/config/modules.ts, moduleForHost():57 — añadir el match de ESCOLAR_HOST y el prefijo 'escolar.'.
- lib/config/modules.ts: añadir MODULE_DEPENDENCIES: Record<ModuleKey, ModuleKey[]> = { facturacion: [], pos: [], escolar: ['facturacion'] } y un helper puro withDependencies(mods) que expanda el cierre. Es la pieza que sostiene la decisión de dependencia dura.
- lib/config/roles.ts: añadir 'modulo:escolar' al union Permission (junto a :64-65), al grupo 'Acceso a módulos' del PERMISSION_CATALOG (:264-265) con label 'Acceso al módulo Administración Escolar', y repartirlo a owner (:127), admin (:150) y user (:170). NO dárselo a 'cajero' (:203) ni a 'lector' salvo decisión explícita.
- lib/auth/modules.ts:29 — añadir escolar: 'modulo:escolar' a MODULE_PERMISSION. Sin esto no compila el Record.
- lib/auth/modules.ts, getTeamModules — aplicar withDependencies al resultado de sanitizeModules, para que un team con ['escolar'] pero sin 'facturacion' no exista nunca en runtime.
- lib/payments/modulos.ts:22 — añadir escolar: process.env.STRIPE_PRICE_MODULO_ESCOLAR ?? '' a MODULE_PRICE_IDS, y en la función de sync (~línea 72) expandir dependencias antes del Set, igual que hoy fuerza 'facturacion'. En desactivarModulo (~:137) añadir la regla inversa: desactivar 'facturacion' arrastra 'escolar'.
- components/module-switcher.tsx: añadir escolar: GraduationCap al mapa ICONS (~línea 30) e importar GraduationCap de lucide-react.
- proxy.ts:6 — añadir '/escolar' a protectedRoutes, y en el bloque de host (:24-31) el caso mod === 'escolar' → redirect a '/escolar'.

**Archivos:** `lib/config/modules.ts`, `lib/config/roles.ts`, `lib/auth/modules.ts`, `lib/payments/modulos.ts`, `components/module-switcher.tsx`, `proxy.ts`, `tests/unit/modules.test.ts`

**Verificación:** pnpm build compila sin errores de tipo (los Record<ModuleKey,...> obligan a que no falte ninguna entrada). Añadir casos a tests/unit/modules.test.ts: moduleForHost('escolar.zero.com.do')==='escolar', moduleUrl('escolar') cae a '/escolar' sin env, y withDependencies(['escolar']) devuelve ['facturacion','escolar'].

**Riesgo:** BAJO. Es aditivo y el compilador te obliga a completarlo. Único punto sutil: moduleUrl() hoy asume dos módulos y hay que reescribirlo, no parchearlo.

### F2 · Merge y resolución de los 10 archivos en conflicto

**Objetivo:** Fusionar la rama de Darian conservando su lógica de negocio y la arquitectura MUI + módulos del destino.

**Pasos:**

- git merge escolar/<rama>. 7 archivos conflictan; 3 auto-mergean (lib/db/schema.ts, facturas-recurrentes/nueva/page.tsx, NuevaFacturaRecurrenteForm.tsx) y aun así hay que revisarlos.
- lib/config/roles.ts — 1 hunk en el array del rol 'lector': dejar AMBAS líneas ('modulo:facturacion' del destino y 'administracion-escolar:ver' de escolar). El resto ya lo hizo la fase 1.
- lib/db/queries.ts — 1 hunk, firma de getCuentasPorCobrar: unir los 4 campos en una sola firma { clientId?: number; soloVencidas?: boolean; docId?: number; limit?: number; offset?: number }. El cuerpo ya auto-mergeó bien.
- app/(dashboard)/dashboard/layout.tsx — 2 hunks. Hunk 1 (import lucide, ~:13): dejar BookOpen del destino y GraduationCap de escolar. Hunk 2 (~:102): quedarse SOLO con el grupo 'contabilidad' del destino y DESCARTAR el NavGroup 'administracion-escolar'. Después, borrar a mano las 5 entradas de HREF_PERMISSION (~:139-144) que auto-mergearon. Añadir puedeIrEscolar debajo de puedeIrPos (:607) y un segundo bloque Link calcado de :915-936 con GraduationCap y moduleUrl('escolar').
- app/(dashboard)/dashboard/cuentas-por-cobrar/page.tsx — 2 hunks. Crear components/cuentas-por-cobrar/PagoModal.tsx con el CUERPO MUI del destino (Dialog/Alert/Chip/CircularProgress) exportando PagoModal y type Cuenta. En page.tsx: dejar el import de escolar al componente, conservar los imports MUI que el resto de la página sigue usando, borrar la interface Cuenta inline y el bloque PagoModal. Conservar intacto el efecto ?pagar= (ya auto-mergeó).
- app/(dashboard)/dashboard/facturas/nueva/NuevaFacturaForm.tsx — 1 hunk en la pantalla de éxito. Quedarse con el cierre MUI del destino (Chip size=small variant=outlined + los </Box>) y re-insertar debajo el bloque {origenCargos.length > 0 && (...)} de escolar traducido a MUI, ANTES del bloque 'nota en borrador'. Conservar saldarCargoConFactura(resultado.documentoId) y el router.push. Verificar que GraduationCap, Loader2 y CheckCircle sigan importados.
- app/(dashboard)/dashboard/facturas-recurrentes/[id]/page.tsx — 2 hunks. Hunk 1: aceptar el lado de escolar (generarPendientes). Hunk 2: estructura MUI del destino + el botón 'Generar pendientes (N)' traducido a <Button size="small" variant="outlined">. Reponer imports Zap/Loader2/Button si el rewrite los quitó.
- app/(dashboard)/dashboard/productos/_page-client.tsx — 1 hunk: unión literal, dejar el useEffect de ?nuevo=1 de escolar Y el async function abrirEdicion del destino. abrirNuevo es function declaration (hoisted), no hay problema de orden.
- Los 3 auto-mergeados: en NuevaFacturaRecurrenteForm.tsx convertir el banner Tailwind (~:563, el único className= que queda en un archivo 100% MUI) a <Alert severity="info"> y simplificar el ternario redundante de :211. En facturas-recurrentes/nueva/page.tsx pasar la sección de error a MUI y repuntar su link de escape a moduleUrl('escolar')+'/estudiantes'. En lib/db/schema.ts verificar que el bloque escolar (~1452) y modulosHabilitados coexisten.
- Copiar además, fuera del merge automático, los directorios que el destino no tiene: lib/administracion-escolar/ (queries.ts, facturacion-recurrente.ts, matricula-periodo.ts, periodo-utils.ts, estudiante-utils.ts) y components/administracion-escolar/ (7 archivos). Sin ellos no compila nada.

**Archivos:** `lib/config/roles.ts`, `lib/db/queries.ts`, `app/(dashboard)/dashboard/layout.tsx`, `app/(dashboard)/dashboard/cuentas-por-cobrar/page.tsx`, `components/cuentas-por-cobrar/PagoModal.tsx`, `app/(dashboard)/dashboard/facturas/nueva/NuevaFacturaForm.tsx`, `app/(dashboard)/dashboard/facturas-recurrentes/[id]/page.tsx`, `app/(dashboard)/dashboard/facturas-recurrentes/nueva/NuevaFacturaRecurrenteForm.tsx`, `app/(dashboard)/dashboard/productos/_page-client.tsx`, `lib/administracion-escolar/`, `components/administracion-escolar/`

**Verificación:** pnpm build pasa. grep -rn 'className=' sobre los 10 archivos resueltos no devuelve restos Tailwind en archivos MUI. grep -rn 'administracion-escolar' app/(dashboard)/dashboard/layout.tsx devuelve 0 (ya no hay grupo ni HREF_PERMISSION escolares ahí).

**Riesgo:** ALTO en layout.tsx (es donde hay que descartar trabajo ajeno, no unirlo) y en cuentas-por-cobrar (mover un componente mientras se resuelve un conflicto). El resto es mecánico.

### F3 · Renumerar migraciones 0070-0077 → 0074-0081 y añadir la 0082 del módulo

**Objetivo:** Eliminar el choque de 4 nombres y dejar la DB alineada con la arquitectura de módulos.

**Pasos:**

- Renombrar preservando el orden relativo (obligatorio: 0075 dropea un índice creado por 0071 y 0077 referencia su tabla): permisos→0074, tablas→0075, integracion_facturas→0076, tutor_imagen→0077, estudiante_sexo→0078, cargos_mismo_mes→0079, periodos_unicos→0080, facturacion_recurrente→0081. Los 8 son idempotentes (IF NOT EXISTS / NOT EXISTS) y ninguno se referencia por nombre desde código, así que renombrar es seguro.
- Editar 0078_administracion_escolar_permisos.sql: hoy reparte los 4 permisos a TODOS los teams por CROSS JOIN. Condicionar el INSERT a los teams cuyo modulos_habilitados contenga 'escolar', igual que 0071_modulos.sql condiciona por tr.key.
- Crear lib/db/migrations/0082_escolar_modulo.sql en el estilo de 0071_modulos.sql: (a) comentario de cabecera documentando que 'escolar' es valor válido de teams.modulos_habilitados y que implica 'facturacion'; (b) INSERT ... SELECT ... ON CONFLICT DO NOTHING de 'modulo:escolar' para los roles admin/user de los teams escolares; (c) UPDATE explícito y nominal de modulos_habilitados para los tenants que son colegios — NO un UPDATE masivo.
- Crear lib/db/migrations/0083_escolar_integridad.sql con los constraints que faltan (ver fase 6): unique parcial de cargos, índice+unique de dependiente_id, CHECKs de montos y mes, y los UNIQUE (team_id, id) + FKs compuestas de las tablas padre.
- Alinear lib/db/schema.ts con el SQL en los 3 índices en drift, o un pnpm db:generate los borrará: admin_escolar_matriculas_activa_uniq (unique parcial WHERE estado='activa', ausente en :1578-1583), admin_escolar_periodos_team_nombre_uniq (ausente en :1471-1473), y admin_escolar_matriculas_factura_recurrente_uniq (declarado NO parcial en :1582 pero creado PARCIAL en el SQL).
- Actualizar la referencia obsoleta de docs/plan-optimizacion-db.md:14 ('última: 0069_reportes_rollups.sql').

**Archivos:** `lib/db/migrations/0078_administracion_escolar_permisos.sql`, `lib/db/migrations/0079_administracion_escolar_tablas.sql`, `lib/db/migrations/0082_escolar_modulo.sql`, `lib/db/migrations/0083_escolar_integridad.sql`, `lib/db/schema.ts`, `docs/plan-optimizacion-db.md`

**Verificación:** pnpm db:generate sobre una DB limpia con las migraciones aplicadas no propone ningún DROP INDEX (prueba de que el drift se cerró). Aplicar 0074→0083 en orden sobre una DB vacía y comprobar que las 10 tablas quedan con todas las columnas que schema.ts espera (sexo, imagen, product_id, ecf_document_id, factura_recurrente_id).

**Riesgo:** MEDIO-ALTO operativo. El runner no explota (drizzle está congelado en 0004, todo se aplica a mano), pero NO hay tabla-ledger: con dos archivos llamados 0071 en el histórico, un psql -f con glob aplicaría cualquiera de los dos. Renumerar es justamente lo que corta ese riesgo, pero hay que hacerlo con el inventario de la fase 0 en la mano.

### F4 · Mover las pantallas a /escolar con layout y rail propios

**Objetivo:** Que el módulo tenga espacio propio y navegación propia, no un grupo prestado del sidebar de Facturación.

**Pasos:**

- git mv de app/(dashboard)/dashboard/administracion-escolar/* a app/escolar/* (16 archivos). Las subrutas quedan: /escolar/estudiantes, /escolar/estudiantes/nuevo, /escolar/estudiantes/[id], /escolar/matriculas, /escolar/cargos, /escolar/cobros (renombrando 'pagos', que hoy confunde), /escolar/configuracion.
- Crear app/escolar/layout.tsx calcado de app/cuenta/layout.tsx: <Box sx={{display:'flex', height:'100vh', bgcolor:'#f9fafb', color:'#111827'}}><EscolarNavRail /><Box sx={{flex:1, minWidth:0, height:'100%', overflowY:'auto'}}>{children}</Box></Box>. El gate pasa de requirePermission('administracion-escolar:ver') a await requireModule('escolar') seguido de await requirePermission('administracion-escolar:ver').
- Crear components/escolar-nav-rail.tsx calcado de components/pos-nav-rail.tsx (RAIL=68, OPEN=224, hover-expand CSS-only, bgcolor '#0f766e', badge 'Compartido'). Items del rail, en este orden: Inicio (/escolar), Estudiantes, Matrículas, Cargos y deudas, Cobros, Contactos (/escolar/contactos, marcado shared:true — misma tabla clients/dependientes que Facturación), Configuración. Al pie, el link 'Ir a Facturación' con moduleUrl('facturacion'), idéntico a pos-nav-rail.tsx:100-117.
- Convertir app/escolar/page.tsx: hoy es un redirect a /estudiantes. Un módulo de primera clase necesita landing. Mínimo viable: server component con las 4 métricas que ya calcula estadisticasEstudiantes (lib/administracion-escolar/queries.ts:255) + accesos directos. Si no da tiempo, dejar el redirect pero anotarlo como deuda visible — MODULE_HOME apuntando a una ruta que solo redirige es un olor.
- Introducir una constante de ruta base (ej. export const ESCOLAR_BASE = '/escolar' en lib/config/modules.ts o en lib/administracion-escolar/rutas.ts) y sustituir con ella los enlaces intra-módulo hardcodeados: estudiantes/_page-client.tsx:42, cargos/_page-client.tsx:403,405, matriculas/_page-client.tsx:232,234, EstudianteFicha.tsx:99,138.
- Reescribir los 13 enlaces cross-módulo para que pasen por moduleUrl('facturacion'), porque en producción escolar vive en otro host: _perfil-client.tsx:459 (clientes), :712-713 (facturas-recurrentes), :774,:802,:876,:877 (facturas/nueva?desdeCargo), :856,:1400,:1555,:1573 (facturas/[id]), configuracion/_page-client.tsx:469 (productos?nuevo=1), TutoresPanel.tsx:295 (clientes). Idem el /dashboard/cuentas-por-cobrar?pagar=N que genera el perfil.
- Añadir <ModuleSwitcher current="escolar" /> en la cabecera del módulo, como hace el dashboard en :1133.

**Archivos:** `app/escolar/layout.tsx`, `app/escolar/page.tsx`, `components/escolar-nav-rail.tsx`, `app/escolar/estudiantes/[id]/_perfil-client.tsx`, `components/administracion-escolar/EstudianteFicha.tsx`

**Verificación:** Navegar /escolar con sesión de un team con el módulo: el rail aparece, las 7 entradas llevan a pantallas vivas, el perfil de un estudiante scrollea completo (no se corta) y la ficha lateral sticky se queda pegada donde debe. Un team sin el módulo en /escolar cae a /sin-acceso. grep -rn "'/dashboard/" app/escolar devuelve 0 resultados (todo pasa por moduleUrl).

**Riesgo:** MEDIO. El riesgo real es el overflow del layout (copiar el de POS rompe el perfil) y los 13+7 enlaces hardcodeados: si se olvida uno, en producción con subdominios el usuario salta a un host donde esa ruta no existe.

### F5 · Gatear la API por módulo y cerrar la lectura sin permiso

**Objetivo:** Que el gate no sea solo visual. Ocultar el rail no cierra nada si las 39 rutas siguen abiertas.

**Pasos:**

- En las 25 rutas de app/api/administracion-escolar/*, sustituir requirePermission por requireModuleAndPermission('escolar', <permiso>) — ya existe en lib/auth/api-guard.ts:57, no hay que escribirlo.
- Sustituir getTeamIdForUser() por requireModuleAndPermission('escolar','administracion-escolar:ver') en los 14 GET que hoy no piden permiso: estudiantes/route.ts:27, estudiantes/[id]/route.ts:13, estudiantes/[id]/cargos/route.ts:14, estudiantes/[id]/matriculas/route.ts:13, estudiantes/[id]/pagos/route.ts:18, estudiantes/[id]/tutores/route.ts:18, tutores/route.ts:9, matriculas/route.ts:17, cargos/route.ts:15, pagos/route.ts:13, periodos/route.ts:10, cursos/route.ts:9, materias/route.ts:9, conceptos/route.ts:11. El helper ya devuelve teamId, así que las queries no cambian.
- Borrar el POST sin guard de app/api/administracion-escolar/pagos/route.ts:54 (hoy responde 409 a peticiones SIN AUTENTICAR) y marcar el GET hermano como lectura de histórico legacy con su permiso.
- En app/api/facturas-recurrentes/route.ts, el bloque contextoEscolar (~:66-198) debe exigir además el módulo escolar, no solo 'administracion-escolar:gestionar'.
- Extraer un helper parseIdParam que devuelva 400 ante no-enteros (patrón ya presente en cargos/[id]/prefill-factura/route.ts:33-36) y aplicarlo en las ~12 rutas que hacen parseInt(id) sin validar. Envolver los await req.json() en .catch(() => ({})).

**Archivos:** `app/api/administracion-escolar/`, `lib/auth/api-guard.ts`, `app/api/facturas-recurrentes/route.ts`

**Verificación:** Test e2e nuevo: un miembro cuyo rol NO tiene 'administracion-escolar:ver' recibe 403 en GET /api/administracion-escolar/estudiantes. Un team sin 'escolar' en modulos_habilitados recibe 403 con code MODULO_NO_DISPONIBLE en cualquiera de las 25 rutas. curl sin cookie a POST /api/administracion-escolar/pagos → 401 o 404, nunca 409.

**Riesgo:** MEDIO. Es repetitivo y mecánico, pero si se salta una ruta queda el agujero entero abierto. Hacerlo con un grep exhaustivo de 'getTeamIdForUser' dentro de app/api/administracion-escolar, que debe terminar en 0 resultados.

### F6 · BLOQUEANTE: reescribir sincronizarSaldosDesdeFacturas y cerrar el doble cobro

**Objetivo:** Que el dinero sea correcto. Es la fase que no se puede posponer: hay 6 escuelas con padres reales.

**Pasos:**

- Reescribir lib/administracion-escolar/queries.ts:296-417 con la regla saldo = max(0, montoCentavos - aplicadoAlCargo), aplicando en cascada por fechaVencimiento. NUNCA repartir factura.montoTotal. Si SUM(montoCentavos) de los cargos != lo facturado, no ajustar: marcar la vinculación como inconsistente y exponer la diferencia en la UI.
- Calcular 'aplicado' como pagos_recibidos + notas de crédito aplicadas, reutilizando NC_APLICADO_SUBQUERY/getNcAplicadoCts de lib/facturas/notas-credito.ts, igual que hace calcularEstadoPago en lib/facturas/estado-pago.ts:53-63. Hoy las NC se ignoran y el colegio le reclama al tutor dinero ya condonado.
- Unificar la base imponible: montoTotal incluye ITBIS (lib/ecf/types.ts:332) y el cargo se creó sin impuesto (prefill-factura/route.ts:132 factura saldoCentavos/100 y la tasa sale del producto). Decidir explícitamente que el cargo escolar es SIN ITBIS y comparar siempre contra montoTotal - totalItbis. Corregir en consecuencia lib/administracion-escolar/facturacion-recurrente.ts:53-61 y :119-120, que hoy pisan montoCentavos con el total CON impuesto y borran los abonos previos.
- Tratar factura ANULADA como REVERSIÓN, no como muerte del cargo (queries.ts:399): devolver el cargo a pendiente/vencido con saldo = montoCentavos, limpiar ecfDocumentId y permitir revincular. Reservar el estado 'anulado' para la anulación manual (DELETE de cargos/[id]/route.ts). Hoy anular una factura borra la deuda de forma irreversible.
- Guardar contra factura de monto 0 (queries.ts:383-401): si montoTotal <= 0, no tocar los cargos. Y no permitir vincular borradores sin líneas.
- Incluir 'USO' (tipoPago=4) junto a PAGADA/GRATUITA en pagadaTotal (queries.ts:390), coherente con lib/facturas/estado-pago-calc.ts:27-28.
- Sacar el sync de los GET: hoy estudiantes/[id]/cargos/route.ts:18, estudiantes/[id]/route.ts:21 y listarEstudiantesEnriquecidos (queries.ts:82, para TODO el team) mutan contabilidad desde una lectura, sin permiso y sin lock. Moverlo a los puntos de escritura (registrar pago, vincular factura) o a un POST /api/administracion-escolar/sincronizar con permiso ':pagos'. Si por plazos se mantiene en lectura, acotarlo a los ids de la página (ya están en queries.ts:135) y envolver 317-416 en transacción con FOR UPDATE.
- Índice único parcial en 0083: UNIQUE (matricula_id, concepto_id, mes, anio) WHERE estado <> 'anulado'. Tras 0079 la tabla de cargos no tiene NINGÚN unique y el diálogo 'Facturar varios meses' crea cargos en bucle (_perfil-client.tsx:957-970): un doble click duplica la mensualidad. El POST debe responder 409 ante el 23505.
- En cargos/generar/route.ts:61-78, incluir 'anio' en la deduplicación (hoy la ignora, línea 70) y excluir los cargos 'anulado' del set de existentes (hoy un mes anulado no se puede regenerar).
- Unificar el cálculo de 'vencido' en un helper compartido (saldo > 0 && fechaVencimiento < hoy) y usarlo tanto en el listado de cargos como en el perfil, que hoy reportan realidades distintas del mismo cargo (_page-client.tsx:190 vs _perfil-client.tsx:1537).

**Archivos:** `lib/administracion-escolar/queries.ts`, `lib/administracion-escolar/facturacion-recurrente.ts`, `app/api/administracion-escolar/cargos/route.ts`, `app/api/administracion-escolar/cargos/generar/route.ts`, `lib/db/migrations/0083_escolar_integridad.sql`, `tests/unit/escolar-saldos.test.ts`

**Verificación:** Suite unit nueva tests/unit/escolar-saldos.test.ts con los 6 escenarios de la auditoría: (1) segundo cargo vinculado a factura ya pagada no destruye deuda; (2) factura con ITBIS no infla el saldo; (3) factura ANULADA devuelve el cargo a pendiente con saldo íntegro; (4) NC parcial reduce el saldo; (5) factura de monto 0 no salda nada; (6) facturación consolidada de dos cargos con saldos distintos reparte correcto. Y un test de integración que corre la generación masiva dos veces y verifica que la segunda devuelve 409/omitido, no duplicado.

**Riesgo:** EL MÁS ALTO DE TODO EL PLAN. Se toca el cálculo de deuda de 6 escuelas con datos reales. Obligatorio: correr el sync nuevo en modo dry-run contra una copia de producción y comparar saldo por saldo contra el actual ANTES de desplegar. Las diferencias que aparezcan son deuda que hoy está mal, y hay que revisarlas una a una con el colegio, no aplicarlas en silencio.

### F7 · BLOQUEANTE: cerrar la fuga multi-tenant de escritura

**Objetivo:** Que un colegio no pueda leer los nombres de los menores de otro colegio.

**Pasos:**

- app/api/administracion-escolar/cargos/route.ts:76-88 — antes del insert, resolver estudianteId, matriculaId y conceptoId con eq(teamId) igual que ya se hace con periodoId en :66-71, y exigir que la matrícula sea del estudiante y del período indicados. 404 si algo no cuadra.
- app/api/administracion-escolar/matriculas/route.ts:48-72 — replicar el bloque de validación que YA existe en el PATCH hermano (matriculas/[id]/route.ts:34-43): validar estudianteId y cursoId contra el team, con independencia del estado enviado (hoy si el estado no es 'activa' no se valida absolutamente nada).
- app/api/administracion-escolar/cargos/generar/route.ts:63 — validar conceptoId contra el team.
- Defensa en profundidad: añadir eq(<tabla>.teamId, teamId) en las condiciones ON de los leftJoin que hoy no filtran — cargos/route.ts:43-44 (estudiantes, conceptos), matriculas/route.ts:40-42 (estudiantes, periodos, cursos), prefill-factura/route.ts:53-54 (conceptos, products), estudiantes/[id]/tutores/route.ts:100 (dependientes). Drizzle acepta and() en el leftJoin; el propio repo ya lo hace en estudiantes/[id]/pagos/route.ts:37-40.
- Estructural, en 0083: UNIQUE (team_id, id) en las tablas padre (estudiantes, matriculas, periodos, cursos, conceptos_pago) y FKs compuestas (team_id, estudiante_id) etc. en cargos y matriculas, para que Postgres rechace la referencia cruzada aunque la capa app falle.
- lib/administracion-escolar/facturacion-recurrente.ts:25-38 — pasar el teamId del documento facturado como argumento explícito desde lib/cobranza/recurrente.ts:196 y añadirlo al where de :37. Es el único punto donde se escribe un cargo sin teamId autenticado de origen; si no coinciden, salir sin efecto y registrar el incidente.
- Guardas de borrado: DELETE /estudiantes/[id] (estudiantes/[id]/route.ts:76-86) y DELETE /tutores/[id] (tutores/[id]/route.ts:39-49) hacen hard-delete sin comprobar nada. Contar matrículas/cargos (y responsablePago/facturas en tutores) y responder 409 accionable; preferiblemente convertirlo en baja lógica usando el campo estado ('retirado'), que ya existe.

**Archivos:** `app/api/administracion-escolar/cargos/route.ts`, `app/api/administracion-escolar/matriculas/route.ts`, `app/api/administracion-escolar/cargos/generar/route.ts`, `lib/administracion-escolar/facturacion-recurrente.ts`, `lib/cobranza/recurrente.ts`, `lib/db/migrations/0083_escolar_integridad.sql`

**Verificación:** Test e2e con dos teams: el team A intenta POST /api/administracion-escolar/cargos con estudianteId del team B → 404, y el mismo intento en matriculas → 404. Verificar además a nivel DB que un INSERT manual cruzado falla por la FK compuesta. Test de que DELETE sobre un estudiante con cargos devuelve 409, no 500.

**Riesgo:** ALTO por impacto (datos de menores), BAJO por complejidad: son ~10 líneas de validación por ruta y el patrón correcto ya existe en el repo (saldar-con-factura/route.ts:56-71 es el mejor guard del módulo).

### F8 · Entidades compartidas: unificar el estudiante escolar con dependientes y el monedero POS

**Objetivo:** Que deje de haber tres representaciones desconectadas de la misma persona.

**Pasos:**

- Regla: adminEscolarEstudiantes es la ficha académica; dependientes es la persona facturable y la que el POS conoce (monederoEstudiante.dependienteId, schema.ts:250 con unique). El puente único es adminEscolarEstudiantes.dependienteId.
- En 0083: CREATE INDEX sobre admin_escolar_estudiantes(dependiente_id) y UNIQUE parcial WHERE dependiente_id IS NOT NULL (un dependiente = un estudiante escolar). Hoy no tiene ni índice ni unique, así que el join con el monedero POS no es fiable.
- Hacer que el enlace se cree solo en el camino natural: el POST de estudiantes/[id]/tutores ya crea/re-apunta el dependiente bajo el cliente del tutor pagador dentro de una transacción. Extender esa misma lógica al alta de estudiante con tutor responsable, para que dependienteId deje de ser 'opcional en el schema pero obligatorio de facto para facturar'.
- Enganchar components/administracion-escolar/VincularDependienteDialog.tsx (201 líneas, hoy sin ningún importador) en el perfil del estudiante como salida manual para los casos que el automático no cubre. Antes de hacerlo, preguntar a Darian si el flujo quedó a medias o si lo abandonó a propósito — no borrar 201 líneas por inercia.
- Los tutores SÍ duplican clients (nombre, documento, telefono, email, direccion). Se mantiene la duplicación porque el schema la justifica con un caso real (chofer/cuidador que no es contacto fiscal, schema.ts:1533-1534), pero se añade en 0083 un unique parcial por (team_id, lower(documento)) WHERE documento IS NOT NULL para cortar los duplicados del mismo padre.
- Documentar en un comentario de cabecera de schema.ts la dirección del enlace: siempre admin_escolar → genérico, nunca al revés. Ninguna tabla genérica debe recibir FK hacia admin_escolar_*.
- Backfill: script tsx que, para las 6 escuelas, liste los estudiantes sin dependienteId cuyo tutor responsable sí tiene clientId, y proponga (sin aplicar) la creación del dependiente. Revisión humana antes de ejecutar.

**Archivos:** `lib/db/schema.ts`, `lib/db/migrations/0083_escolar_integridad.sql`, `app/api/administracion-escolar/estudiantes/[id]/tutores/route.ts`, `components/administracion-escolar/VincularDependienteDialog.tsx`, `lib/pos/monedero.ts`

**Verificación:** Query de control: 0 filas con dependiente_id duplicado. Un estudiante escolar con dependienteId aparece en el buscador del POS (lib/pos/monedero.ts:224-245 consulta dependientes). El conteo de estudiantes sin dependienteId de la fase 0 baja tras el backfill.

**Riesgo:** MEDIO. El unique sobre dependiente_id puede fallar al aplicarse si ya hay duplicados en producción — de ahí que la fase 0 los cuente primero. El unique de documento de tutores casi seguro falla en alguna escuela; aplicarlo tras limpiar.

### F9 · Alineación visual: MUI, tokens de color y estados de error

**Objetivo:** Que el tercer módulo no sea el único escrito en otro lenguaje visual, y que no mienta cuando falla.

**Pasos:**

- Corregir el empty state mentiroso del listado de estudiantes (estudiantes/_page-client.tsx:24,72,157-170): el fetcher no comprueba r.ok, SWR nunca ve el error, y un 500 se pinta como 'Aún no hay estudiantes registrados'. Un colegio con 800 alumnos cree que perdió la matrícula entera. Hacer que el fetcher lance si !r.ok, desestructurar error y mutate, y añadir una rama de error ANTES del check de total===0, replicando pagos/_page-client.tsx:127-132.
- Añadir .catch() al Promise.all de EstudianteFicha.tsx:60-74 (hoy un fallo deja el spinner girando para siempre) y catch a cargar() en _perfil-client.tsx:207-225, que hoy pinta 'Estudiante no encontrado' ante un fallo de red — mensaje falso.
- Badges: el shim del destino (components/ui/badge.tsx:29-43) renderiza un Chip MUI con sx propio, que gana en especificidad a las utilities Tailwind. Los 29 Badges escolares codifican su significado solo con className (bg-red-50, bg-teal-50...) y quedarían todos grises — EstadoCargoBadge (_perfil-client.tsx:1543-1548) dejaría de distinguir 5 estados. Mapear a los variant semánticos del Badge del destino y borrar las clases de color; extender getChipSx si faltan variantes.
- Sustituir las 175 ocurrencias literales de teal-<n> por el primario del tema. Visualmente el cambio es casi nulo (teal-600 = #0d9488 es el color que el destino ya hardcodea en tabs.tsx), el beneficio es que deja de estar clavado. Hacerlo en la misma pasada que los badges: es el mismo trabajo.
- Corregir 'Estado de cuenta' (_perfil-client.tsx:724): hoy imprime una HOJA EN BLANCO, porque app/globals.css:283-286 oculta todo salvo .print-area y el módulo escolar no usa esa clase ni una vez. Corto plazo: marcar el contenedor imprimible con print-area y las barras con no-print. Correcto: una ruta dedicada bajo app/(print)/ siguiendo app/(print)/caja/imprimir/[id]/page.tsx — y así queda fuera del layout del módulo, lo que simplifica el problema.
- Unificar los 5 StatCard duplicados (estudiantes:256, configuracion:504, cargos:707, matriculas:345, pagos:186) y los EmptyState/SimpleTable duplicados en un único componente en components/administracion-escolar/. Hacerlo ANTES de migrar a MUI convierte 5 migraciones en 1.
- Cambiar overflow-hidden por overflow-x-auto en estudiantes/_page-client.tsx:173 (única tabla del módulo que no puede scrollear en horizontal).
- Convertir los ~15 grid-cols-2 sin breakpoint en grid-cols-1 sm:grid-cols-2, priorizando los que están dentro de Dialog (cargos:458,519,555,647; TutoresPanel:443,458; EditarMatriculaDialog:212; CrearCargoEstudianteDialog:173).
- Accesibilidad mínima: las filas clicables de estudiantes/_page-client.tsx:186-190 y _perfil-client.tsx:1223-1226 son el único modo de abrir la ficha y el detalle mensual, y no tienen tabIndex, role ni onKeyDown. En 5.653 líneas hay 1 solo aria-label.
- Borrar components/administracion-escolar/EstadoVacioModulo.tsx o, mejor, usarlo de verdad al unificar los empty states.
- NOTA correctiva al mapeo recibido: <TabsList variant="line"> (_perfil-client.tsx:420) SÍ funciona en el destino — components/ui/tabs.tsx:43 declara la variante y :46 la pone por defecto. No hay nada que arreglar ahí.

**Archivos:** `app/escolar/estudiantes/_page-client.tsx`, `app/escolar/estudiantes/[id]/_perfil-client.tsx`, `components/administracion-escolar/EstudianteFicha.tsx`, `components/ui/badge.tsx`, `app/globals.css`

**Verificación:** tests/ui-audit.test.ts (falla ante cualquier error de consola) pasa con las rutas escolares añadidas. Inspección visual de las capturas en test-results/ui-audit: badges de estado distinguibles, sin desbordes horizontales, sin spinners colgados. Prueba manual a 375px de los diálogos de cargos y de alta de tutor.

**Riesgo:** BAJO-MEDIO. Mucho volumen mecánico. El único punto con criterio real es decidir si el estado de cuenta se arregla con print-area o se hace bien como ruta (print).

### F10 · Rendimiento y limpieza

**Objetivo:** Que el módulo aguante un colegio de 600 alumnos.

**Pasos:**

- cargos/_page-client.tsx:138-144 carga 5 catálogos completos de golpe, incluido /estudiantes SIN límite (la tabla entera del colegio) solo para poblar selects. Paginar o usar búsqueda con debounce.
- matriculas, cargos y pagos traen la colección entera y filtran en memoria; solo estudiantes pagina (PAGE_SIZE=25). Unificar en SWR con paginación de servidor, como estudiantes/_page-client.tsx:72-80.
- Agrupar los UPDATE del sync (queries.ts:412-416, hoy un round-trip por cargo) en una sola sentencia dentro de transacción.
- cargos/route.ts:14-47 (GET global) nunca sincroniza, a diferencia del GET por estudiante: las dos pantallas muestran estados distintos del mismo cargo. Se resuelve solo si la fase 6 saca el sync de las lecturas.
- Corregir el orderBy invertido de estudiantes/[id]/tutores/route.ts:43: ordena ASC sobre responsablePago, y en Postgres false va antes que true, así que el tutor pagador — el contacto fiscal — queda SIEMPRE el último. Cambiar a desc().
- Renombrar la métrica 'Morosos' (queries.ts:261-270, estudiantes/_page-client.tsx:115) o corregirla: hoy cuenta cualquier cargo en ESTADOS_DEUDA, incluidos los no vencidos y los estudiantes retirados, así que al generar las mensualidades del año el 100% del colegio aparece moroso al día siguiente.

**Archivos:** `app/escolar/cargos/_page-client.tsx`, `lib/administracion-escolar/queries.ts`, `app/api/administracion-escolar/estudiantes/[id]/tutores/route.ts`

**Verificación:** Cargar /escolar/estudiantes y /escolar/cargos en un dataset sembrado de 600 estudiantes × 10 meses: sin timeouts, y el panel de red no muestra una respuesta con la tabla completa de estudiantes.

**Riesgo:** BAJO.

### F11 · Verificación: unit, e2e y auditoría visual

**Objetivo:** Cerrar con evidencia, no con impresión.

**Pasos:**

- Unit (pnpm test, vitest): ampliar tests/unit/modules.test.ts con 'escolar' en moduleForHost/moduleUrl/sanitizeModules y con withDependencies. Ampliar tests/unit/payments-modulos.test.ts para que activar 'escolar' arrastre 'facturacion' y desactivar 'facturacion' arrastre 'escolar'. Crear tests/unit/escolar-saldos.test.ts con los 6 escenarios de dinero de la fase 6 — es el test más importante del merge.
- E2E (pnpm test:e2e, Playwright): crear tests/modulos-escolar.test.ts calcado de tests/modulos-pos.test.ts: (1) /escolar sin sesión redirige a sign-in; (2) empresa nueva sin el módulo → /escolar cae a /sin-acceso; (3) con el módulo activo, el rail aparece y se navega a las 5 pantallas; (4) 403 con code MODULO_NO_DISPONIBLE en la API para un team sin el módulo; (5) 403 en GET /api/administracion-escolar/estudiantes para un rol sin ':ver'; (6) aislamiento: team A no puede crear un cargo con estudianteId de team B.
- Auditoría visual (tests/ui-audit.test.ts): añadir al array de rutas (~línea 52) las entradas ['/escolar','13-escolar-inicio'], ['/escolar/estudiantes','14-escolar-estudiantes'], ['/escolar/estudiantes/nuevo','15-escolar-nuevo'], ['/escolar/matriculas','16-escolar-matriculas'], ['/escolar/cargos','17-escolar-cargos'], ['/escolar/cobros','18-escolar-cobros'], ['/escolar/configuracion','19-escolar-config']. El test hace expect(errores).toEqual([]) sobre los errores de consola, así que cualquier import roto o hidratación fallida lo tumba.
- PROBLEMA A RESOLVER EN ESTA FASE: el ui-audit activa POS con page.request.post('/api/equipo/perfil', {posHabilitado:true}) (línea ~44), aprovechando la columna legacy. Para 'escolar' no existe columna equivalente y activarModulo pasa por Stripe. Hay que exponer una vía de activación para tests (endpoint de perfil que acepte modulos, o un helper de seed) antes de poder capturar las pantallas escolares. Sin eso, el ui-audit capturaría 7 pantallas de /sin-acceso.
- Revisión manual de las capturas en test-results/ui-audit/: badges con color semántico, perfil scrolleable completo, sin desbordes horizontales, ficha lateral pegada donde debe.
- Antes de desplegar: correr el sync nuevo en dry-run contra una copia de producción y revisar con cada colegio las diferencias de saldo que aparezcan.

**Archivos:** `tests/ui-audit.test.ts`, `tests/modulos-escolar.test.ts`, `tests/unit/modules.test.ts`, `tests/unit/payments-modulos.test.ts`, `tests/unit/escolar-saldos.test.ts`

**Verificación:** pnpm test, pnpm test:e2e y el ui-audit en verde, más el informe de diff de saldos revisado y firmado.

**Riesgo:** MEDIO: el ui-audit está bloqueado hasta que exista una forma de activar el módulo escolar en un team de prueba.

## Preguntas abiertas

- ¿Cuáles de los 6 tenants de producción reciben el módulo 'escolar'? La migración 0082 debe nombrarlos uno a uno; un UPDATE masivo se lo daría también a las empresas que no son colegios.
- ¿Existe price de Stripe para el módulo escolar (STRIPE_PRICE_MODULO_ESCOLAR)? Sin él, activarModulo de lib/payments/modulos.ts no puede activarlo y el único camino es modulosOverride desde el panel admin. Afecta también al e2e y al ui-audit.
- ¿Cómo activa el ui-audit el módulo escolar en el team de prueba? Para POS usa page.request.post('/api/equipo/perfil',{posHabilitado:true}) apoyándose en la columna legacy; para escolar no hay equivalente. Hace falta decidir: endpoint de perfil que acepte modulos, helper de seed, o modulosOverride.
- VincularDependienteDialog.tsx (201 líneas, cero importadores): ¿es un flujo que Darian dejó a medias y hay que enganchar, o lo abandonó? No borrarlo sin preguntarle.
- admin_escolar_materias: catálogo con dos rutas CRUD y ningún consumidor (schema.ts:1490 admite que no está ligado a matrícula). ¿Entra oculto, entra visible, o se pospone? Depende de si hay una fase 2 planeada.
- admin_escolar_pagos: ¿tiene filas en alguna de las 6 escuelas? Si no, se dropea con la tabla y la pestaña; si sí, se queda como histórico de solo lectura y hay que decidir si se espejan los pagos_recibidos hacia ella o se lee el historial directo del ledger.
- ¿El nombre visible del módulo es 'Administración Escolar' o 'Colegios'? docs/inicio-proyecto-modulo-colegios.md pide 'Colegios' bajo /dashboard/colegios con permisos colegios:*; lo entregado es 'Administración Escolar'. Si se renombra, hay que hacerlo AHORA (fase 1), no después de mover 16 archivos.
- ¿El rol 'user' (Vendedor/secretaria) debe recibir 'modulo:escolar'? Hoy tiene administracion-escolar:ver+gestionar+pagos pero no configurar. El rol 'cajero' explícitamente NO debe recibirlo.
- ¿La landing /escolar es un dashboard real o sigue siendo un redirect a /estudiantes? Un MODULE_HOME que solo redirige es aceptable como MVP pero desentona con 'módulo de primera clase'.
- ¿Se acepta que Facturación siga importando código escolar (lib/cobranza/recurrente.ts:15 → lib/administracion-escolar/facturacion-recurrente.ts, y app/api/facturas-recurrentes/route.ts escribiendo adminEscolarMatriculas)? Resolverlo con inversión de dependencia (registry de hooks post-emisión) es lo correcto, pero es un refactor propio que no cabe en este merge. Decidir si se acepta como deuda declarada.
- ¿Cuántas diferencias produce el sync reescrito contra los saldos actuales de producción? El dry-run de la fase 6 es la condición de despliegue: cada diferencia es deuda que hoy está mal calculada y hay que revisarla con el colegio, no aplicarla en silencio.