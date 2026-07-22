# Seguimiento — Módulo de contabilidad

> **Para quien retome esto (humano o IA).** Estado real de la ejecución del plan
> `docs/plan-contabilidad-vera.md` en la rama `feature/contabilidad-asientos-reportes`.
> Última actualización: **2026-07-21**.
>
> Mantener este archivo al día es parte del trabajo: al terminar una etapa, marcarla
> aquí con el commit y lo que quedó sin verificar.

## Contexto de arranque

- **Rama:** `feature/contabilidad-asientos-reportes`, sale de
  `feature/administracion-escolar` (que ya contiene todo `main` — verificado con
  `git merge-base --is-ancestor main HEAD`).
- **Plan que se sigue:** `docs/plan-contabilidad-vera.md` (el plan 1). Existe
  también `docs/mini-plan-contabilidad-asientos-reportes.md`, que propone saltar
  directo a asientos; **Alex decidió seguir el plan 1**, o sea empezar por el
  Paso 1 (cartera) y no por asientos.
- **DB:** branch de Neon propia de contabilidad — `ep-bold-pine-anhzpklp` / `neondb`.
  Antes apuntaba a la de escolar (`ep-long-recipe-anb8mm9z`).
- **Migraciones:** la última ocupada es `0081`. **El primer número libre es `0082`.**
- **Protocolo de DB:** avisar host + nombre de DB y **esperar confirmación
  explícita** antes de correr cualquier script contra Neon, incluso de solo lectura.

### Topología de la rama — leer antes de planear el merge

Esta rama **no sale de `main`, sale de `feature/administracion-escolar`**, y
escolar **todavía no está en `main`**. Los números:

```
HEAD vs main:      142 commits
  de escolar:      124
  de contabilidad:  18
```

**Consecuencia:** hoy no se puede subir contabilidad a `main` sin arrastrar los
124 commits de escolar. A nivel de git están pegadas.

No era la intención de Darian — pidió que contabilidad se desarrollara *pensando
en que* escolar estuviera, no *con escolar dentro*. Una sesión anterior lo tomó
como comodidad y lo documentó como decisión sin confirmarlo.

**El acoplamiento de código es casi cero:** de los 33 archivos que toca
contabilidad, el único que roza escolar es `lib/administracion-escolar/origen-factura.ts`,
creado por contabilidad misma, y ya degrada solo si las tablas no existen (`42P01`).

**Darian decidió (2026-07-20): opción A.** La rama se queda como está; escolar
entra a `main` primero y contabilidad va detrás. **No intentar extraer los 18
commits de contabilidad a una rama limpia sobre `main`** — se descartó.

Consecuencia a tener presente: **contabilidad no puede desplegarse antes que
escolar.** Si el merge de escolar se atrasa mucho, esto se reabre.

### Decisiones ya tomadas (no reabrir sin preguntar)

1. **Colisión de nombre "Contabilidad"** → *convivir*. El módulo fiscal que llegó
   de main (Secuencias, Consulta de e-NCF) se queda donde está; el motor contable
   se agrega como hijos del mismo grupo. No se renombra nada de main.
2. **Permisos** → creados `contabilidad:ver` / `:gestionar` / `:configurar`.
3. **Orden de trabajo** → plan 1, empezando por Paso 1 (cartera), no por asientos.
4. **Hotfix de fecha UTC** → Alex no respondió; se mergeó dentro de esta rama.
   La rama `hotfix/vencimiento-fecha-utc` se conserva **intacta sobre main** por
   si decide desplegarlo aparte. Si lo pide: `git checkout hotfix/vencimiento-fecha-utc`
   y push; ya está lista, 3 commits.

---

## Etapas del Paso 1 (cartera)

| # | Qué | Estado | Commit |
|---|---|---|---|
| 0 | Documentar lógica de saldo + permisos `contabilidad:*` | ✅ Hecho | `93cd76c` |
| — | Merge del fix de fecha RD | ✅ Hecho | `95ed505` |
| 1 | Saldo a SQL, filtros/orden/paginación server-side, totales sobre toda la cartera | ✅ Hecho | `8ea7410` + `9c0e597` |
| 2 | Antigüedad de saldos (1-30/31-60/61-90/90+), "por vencer", métricas | ✅ Hecho | `c95bb4b` |
| 3 | Panel lateral de detalle + timeline con datos ya existentes | ✅ Hecho | `f2a151c` |
| 4 | Seguimiento de cobranza + promesas de pago + notas internas → **migración 0082** | ✅ Hecho (migración aplicada) | `8f7ec81` |
| 5 | Recordatorios individual/masivo + exportar cartera | ✅ Hecho (UI cableada 2026-07-20) | `c35d354` + pendiente commit |
| 6 | Validar casos reales + trazabilidad | ✅ Hecho | `f008345` |

> ⚠️ **Lección: "hecho" significa que el usuario puede usarlo.** Las etapas 4 y 5
> se dieron por terminadas con el backend escrito y sin conectar. El barrido del
> 2026-07-20 encontró **tres piezas huérfanas**: el endpoint de recordatorios
> (sin ninguna UI — la funcionalidad era inalcanzable desde la aplicación),
> `evaluarPromesasVencidas` (sin caller: las promesas vencidas no se marcaban
> nunca) y `getMetricasPromesas` (sin caller). Las tres quedaron conectadas.
> **Antes de marcar una etapa, verificar que haya un camino desde la UI.**

**El Paso 1 del plan está completo.** Lo siguiente es el Paso 2 (catálogo de
cuentas contables), que es donde arranca el motor contable de verdad.

Después del Paso 1 vienen los Pasos 2-6 del plan (catálogo de cuentas, cuentas
automáticas, asientos, notas/anulaciones/mora/retenciones, reportes contables).
**Nada de eso está empezado.** No existe ninguna tabla de asientos ni catálogo
de cuentas en el schema.

---

## Lo hecho, en detalle

### Etapa 0 — `93cd76c`

- `contabilidad:ver` / `:gestionar` / `:configurar` en `lib/config/roles.ts`.
  **Van en 3 sitios**: el tipo `Permission`, el array `ROLES` y `PERMISSION_CATALOG`.
  Si falta en el catálogo, el owner no lo recibe y el sidebar lo oculta — es un
  bug recurrente en este repo.
  - owner/admin: los 3. Vendedor y Auditor: solo `:ver`.
- Gate del sidebar en `HREF_PERMISSION` (`app/(dashboard)/dashboard/layout.tsx`).
  El grupo Contabilidad llegó de main **sin permiso propio**: cualquiera con
  acceso al dashboard veía Secuencias y Consulta de e-NCF.
- Las páginas y la API de contabilidad pasaron de `reportes:ver` a
  `contabilidad:ver`, para que el nav y el guard no se contradigan.
- `docs/contabilidad-paso1-logica-saldo.md` — subpasos 1-2 del plan: fórmula de
  saldo, reglas de inclusión y limitaciones conocidas.

### Fix de fecha RD — `95ed505` (merge de `hotfix/vencimiento-fecha-utc`)

Bug: "hoy" se calculaba con `new Date().toISOString()` (UTC). Producción corre en
UTC y RD es UTC−4, así que **entre las 20:00 y las 00:00 hora RD el sistema creía
que ya era mañana**. 5 puntos afectados; el grave era `lib/cobranza/recargo.ts`,
que generaba la nota de débito por mora un día antes (cobra dinero al cliente).

- `hoyRD()` y `fechaRD(d)` en `lib/utils/format.ts`.
- 13 tests unitarios en `tests/unit/fecha-rd.test.ts`. **Runner nuevo**:
  `npm run test:unit` (Node `--test` nativo vía `npx tsx`, sin dependencia nueva).
  El repo solo tenía e2e de Playwright, que necesita server + browser.
  `playwright.config.ts` ignora `tests/unit/`.
- **Matiz importante que hay que decirle a Alex:** `fecha_limite_pago` está en
  NULL en prácticamente todos los documentos de la DB revisada. Sin fecha límite
  no hay vencimiento, así que el bug **puede no haber disparado nunca en
  producción**. No se pudo confirmar contra la base de producción.

### Etapa 1 — `8ea7410`

El problema: `getCuentasPorCobrar` calculaba el saldo **en JS después del fetch**,
así que el `LIMIT` recortaba antes de descartar las filas con saldo 0 → con más de
2000 documentos abiertos la cartera se truncaba en silencio y los totales salían
incompletos, sin aviso en la UI.

- `getCuentasPorCobrar` pasa a un **CTE**: `saldo`, `vencida` y `dias_vencido` se
  calculan en SQL y el filtro `saldo > 0` corre **antes** del `LIMIT`.
- Los totales salen de una consulta agregada sobre **el mismo CTE**, así que
  cubren toda la cartera filtrada y no la página.
- Filtros `search` / `tipoDoc` / `estado` y 4 órdenes por whitelist
  (`reciente` | `antiguo` | `monto` | `vencimiento`), todo server-side.
- La ruta `/api/cuentas-por-cobrar` ya reenvía `limit`/`offset` (los ignoraba pese
  a que la query los aceptaba) y valida cada parámetro contra whitelist.
- El listado dejó de filtrar en memoria. Paginación con `DataTable` (`PAGE_SIZE=25`)
  y debounce de 300ms en la búsqueda.
- El deep-link `?pagar=<docId>` ahora consulta `/api/cuentas-por-cobrar/[docId]`,
  porque con la lista paginada la factura puede no venir en la página cargada.

**`hoy` lo resuelve Postgres** con `now() AT TIME ZONE 'America/Santo_Domingo'`.
Por eso esta query no depende del `hoyRD()` de JS.

---

### Etapa 2 — `c95bb4b`

Cubetas de antigüedad (`porVencer`, `d1a30`, `d31a60`, `d61a90`, `d90mas`) como
tarjetas clicables que filtran la lista.

- Se calculan **dentro del CTE de cartera**, no reusando `getAgingCxC`.
- El filtro de cubeta vive en un CTE aparte (`filtrada`) para que el desglose se
  siga calculando sobre `cartera` completa: al elegir una cubeta las demás
  conservan su monto. Los stats de arriba sí reflejan la cubeta activa.

> ✅ **RESUELTO (2026-07-20).** `getAgingCxC` tenía consulta propia: no restaba
> las notas de crédito, usaba otra definición de cobrable (solo e-CF aceptados) y
> contaba las ND de mora como filas propias. Medido antes: **RD$78,295 contra
> RD$77,245** en cuentas por cobrar.
>
> **Corrección del dato viejo:** este doc afirmaba que los RD$1,050 correspondían
> "exacto a las tres NC sembradas (300+250+500)". **Es falso.** Cotejado tras el
> arreglo, las NC aplicadas suman **RD$550** — dos de las tres, porque la tercera
> es una variante sin efecto monetario. El resto de la brecha venía de las otras
> dos causas. La coincidencia con 1,050 era casualidad.
>
> Ahora `getAgingCxC` delega en `getCuentasPorCobrar`. Verificado en el team 9:
> ambas dan **RD$77,245 y 67 filas**, diferencia RD$0.00, y las cubetas suman al
> total.

### Etapas 3-6 — `f2a151c`, `8f7ec81`, `c35d354`, `f008345`

- **Etapa 3** — Panel lateral con el desglose que *explica* el saldo (total,
  pagado, NC, mora) y el historial de movimientos. `lib/cobranza/detalle.ts` no
  recalcula el saldo: usa las mismas condiciones del CTE de cartera, si
  divergieran el desglose no cuadraría con el total mostrado arriba.
- **Etapa 4** — Migración **0082 aplicada**: `cobranza_eventos` (log de
  contactos, notas y promesas) + `cobranza_seguimiento` (estado: responsable y
  próxima acción). El estado de una promesa se persiste, no se deriva: si mañana
  el cliente paga, la promesa incumplida de ayer sigue habiendo sido incumplida.
  `evaluarPromesasVencidas` marca cumplidas **antes** que incumplidas.
- **Etapa 5** — Export a Excel con los filtros de la pantalla y ruta propia
  (`/api/cuentas-por-cobrar/export`), más recordatorios por correo en **dos
  pasos**: sin `confirmar: true` solo previsualiza. Tope de 50 por lote.
- **Etapa 6** — Origen escolar en el detalle (consulta del lado escolar, no de
  cobranza) y `scripts/validar-cartera.ts` con 37 comprobaciones.

> ✅ **RESUELTO (2026-07-20).** La branch de Neon de contabilidad se creó desde un
> estado anterior a las migraciones escolares 0074-0081, así que no tenía ninguna
> tabla `admin_escolar_*` y el módulo escolar estaba inoperativo en esa base.
> Aplicadas las 8 en orden con los `scripts/apply-migration-00XX.ts` versionados;
> las 10 tablas existen y las 2 de cobranza (0082) quedaron intactas.

> ⚠️ **El envío real de recordatorios nunca se probó.** Llamaría a Resend y
> saldría hacia afuera. Solo se validó la previsualización y las guardas.

## Trampas encontradas (no volver a tropezar)

1. **`fecha_limite_pago` es `varchar(10)`, no `date`.** `''::date` lanza excepción
   en Postgres. En el CTE se normaliza una sola vez con
   `NULLIF(d.fecha_limite_pago, '')::date AS fecha_limite_date` y todo lo demás
   compara contra eso.

2. **`ecf_documents_mora_activa_unica_idx`**: índice único parcial sobre
   `mora_origen_id` donde `estado <> 'ANULADO'`. **Solo puede haber UNA nota de
   débito de mora activa por factura.** Las anuladas sí pueden convivir. En la
   práctica `moraNotas` trae 0 o 1 elemento, nunca una lista larga.

3. **`date + $1` falla con `operator is not unique`** si el parámetro va sin tipo.
   Hay que castear: `+ ${dias}::int`.

4. **Subqueries correlacionadas en Drizzle**: usar el nombre literal de la tabla
   (`ecf_documents.id`) y no `${ecfDocuments.id}`, porque Drizzle lo trata como
   parámetro. Hubo un bug real por esto (todas las filas devolvían el mismo SUM).
   En el CTE nuevo se usa el alias `d`, que es equivalente y seguro.

5. **`git add -A` es peligroso en este repo.** `.codex_tmp/` tiene ~6639 archivos
   (1.09M líneas). Está ignorado en esta rama, **pero no en main**. Siempre
   revisar `git status` antes de commitear.

6. **Numeración de migraciones**: esta rama ya chocó dos veces con main
   (2026-07-08 y 2026-07-20). Asumir que va a pasar otra vez. Al renombrar, ir en
   orden **descendente** y mover también `scripts/apply-migration-XXXX.ts`,
   actualizando la ruta del `.sql` y el mensaje de log **dentro** del script.

---

## Datos de prueba en la DB

Script versionado: **`scripts/seed-cartera-escenarios.ts`**.

```bash
npx tsx scripts/seed-cartera-escenarios.ts 9            # siembra (idempotente)
npx tsx scripts/seed-cartera-escenarios.ts 9 --limpiar  # solo borra
```

Sembrado actualmente en **team 9** (`COLEGIO ANDRES BELLO`, 31 docs) y en
**team 11** (`Distribuidora García SRL`, 29 docs). Todo lleva el prefijo
**`SEEDCXC`** en `encf` y `codigo`, así que no se mezcla con los datos reales.

Cubre: al día, vence hoy, vencidas a 1/45/75/100 días (una por cubeta de
antigüedad), sin fecha, pago parcial, ND de mora (activa + anulada + ya cobrada),
factura saldada que sólo arrastra mora, las **5 variantes de nota de crédito**
(por `origen_documento_id`, por `ncf_modificado`, código 2 "corrige texto",
anulada, modelo nuevo con `credito_generado_cents`, y NC mayor que el saldo), y
anuladas/rechazadas/pagadas.

**Ojo:** uno de los documentos tiene `encf = 'E310000099001'` (renombrado a
propósito para probar el vínculo por `ncf_modificado`), por eso la limpieza busca
también por `codigo`.

**Por qué el team 9:** el usuario de auto-login solo pertenece a los teams 2, 7,
9 y 10. Sembrar en el 11 dejaba los escenarios invisibles desde la UI.

## Cómo se verificó la Etapa 1

- 12 casos sintéticos con `VALUES` dentro de un `SELECT` (sin escribir nada), para
  la lógica de las expresiones del CTE.
- 33 asserts contra los datos sembrados: vencimientos exactos, mora, las 5
  variantes de NC, exclusiones, totales, filtros, orden y paginación. 33/33.
- Typecheck limpio; `npm run test:unit` 13/13.

**En el navegador** (team 9, 50 cuentas): paginación 1-25 / 26-50 sin solape,
totales de toda la cartera intactos al cambiar de página, orden por saldo
descendente, búsqueda con debounce (5 teclas → 1 consulta), agrupar por cliente
pidiendo 500 filas y ocultando la paginación. Sin errores de consola.

Abrir el navegador encontró **dos bugs que los tests no podían ver** (`9c0e597`),
ambos en bordes que la query por sí sola no cubre:

1. La columna Emisión mostraba `28 00:00:00/06/2026`. `db.execute` crudo **no
   parsea `timestamp` a `Date`** como sí hace el select tipado de drizzle:
   devuelve el string de pg separado por espacio, y `fmtFechaCorta` parte por la
   `T` de ISO. Se resolvió entregándola formateada con `to_char` desde SQL.
2. Cambiar un filtro estando en la página 2 disparaba **dos** consultas, porque
   el reset de página vivía en un `useEffect` aparte. Se movió al mismo handler.

**Sigue sin verificarse en navegador:** los escenarios de vencidas y mora. El
usuario de auto-login solo pertenece a los teams 2, 7, 9 y 10, y los datos
sembrados están en el **team 11**. En la UI solo se pudo ver cartera al día.
Los screenshots del panel agotan el tiempo de espera; la verificación fue por
texto y traza de red.

---

## Pendientes abiertos

> **Palabra clave para retomar en otra sesión: `RETOMAR-CONTABILIDAD`.**
> Con eso, leer este archivo entero antes de tocar nada.

### A. Bloquean o esperan a alguien

- [x] **Hotfix de fecha UTC** → **Darian decidió (2026-07-20): se queda dentro de
      esta rama, no se despliega aparte.** La rama `hotfix/vencimiento-fecha-utc`
      queda como respaldo pero no se sube.
- [ ] **Nada se ha pusheado.** **Darian decidió: se pushea cuando toda la fase 1
      esté sólida**, no antes.
- [x] **`getAgingCxC` corregido** (2026-07-20). Delega en `getCuentasPorCobrar`,
      así que hay una sola definición de saldo y de cobrable. El detalle y el
      impacto (RD$78,295 → RD$77,245 en el team 9) quedaron documentados en
      `docs/notas-pr-contabilidad-paso1.md` para que Alex lo vea al revisar el PR.
      Si más adelante lo quiere distinto, revertir es aislado: una sola función.

### B. Entorno

- [x] **Migraciones escolares 0074-0081 aplicadas** a la branch de Neon de
      contabilidad (2026-07-20, con confirmación de Darian). Las 10 tablas
      `admin_escolar_*` existen; las 2 de cobranza intactas. Base y código
      alineados.
- [x] **`fecha_limite_pago` en producción** → Darian no tiene acceso a esa parte.
      Movido a las notas del PR como consideración para Alex, con la consulta de
      solo lectura ya escrita.

### C. Verificación que falta

- [x] **Envío real de recordatorio probado** (2026-07-20, con confirmación
      explícita de Darian). Se puso su correo en `SEEDCXC-VENC45`, se envió a ese
      único destinatario y se revirtió el dato después. Resultado: 1 enviado, 0
      fallidos; Resend aceptó; el evento `contacto`/`correo` quedó en el historial
      de gestión con usuario y fecha RD. **El correo de Darian ya NO está en la
      base** (revertido a `cartera1@ejemplo.invalid`).
- [x] **"Agrupar por cliente" validado con el usuario** (2026-07-20): 500 alcanza
      para el volumen actual. El aviso de truncado ya existe y muestra cifras
      exactas. Sin trabajo pendiente.

### D. Piezas huérfanas encontradas en el barrido (2026-07-20)

- [x] **UI de recordatorios construida.** `components/cuentas-por-cobrar/RecordatoriosModal.tsx`
      + acción por fila (menú de 3 puntos) y acción masiva sobre la selección.
      Refleja el contrato de dos pasos: previsualiza, y solo envía tras
      confirmación explícita. El tope de 50 se corta en la UI con aviso en vez de
      dejar que la API rechace el lote entero.
- [x] **`evaluarPromesasVencidas` enganchado** — **sin cron**, al GET de
      `/api/cuentas-por-cobrar/[docId]/gestion`. Verificado en vivo: una promesa
      con fecha pasada pasó sola de `pendiente` a `incumplida`. El compromiso (una
      promesa que nadie abre no se marca) y cuándo haría falta el cron están en
      las notas del PR.
- [x] **`getMetricasPromesas` conectada.** Se devuelve en `/api/cuentas-por-cobrar`
      y se muestra como tira sobre la antigüedad. **No sigue el filtro activo** —
      es del team completo, porque una promesa incumplida no deja de serlo porque
      el usuario mire otra cubeta. Solo aparece si hay promesas: un team que nunca
      registró una no gana nada con una tarjeta en cero permanente.

### E. Entregable — briefing para Alex

- [x] **HECHO (2026-07-20): `docs/briefing-contabilidad-paso1.md`.** Cubre qué es
      y qué NO es el módulo, la fórmula del saldo, por qué se bajó a SQL, el bug
      de zona horaria, el guion de prueba en la UI, las tres decisiones que le
      tocan a Alex y cómo se verificó.

El esqueleto original que se usó de guía:

  **1. Guion de prueba en la UI** (`/dashboard/cuentas-por-cobrar`, team 9, con
  `npx tsx scripts/seed-cartera-escenarios.ts 9` corrido):
  - Las 4 tarjetas de arriba y las 5 cubetas de antigüedad; comprobar que las
    cubetas suman el total.
  - Clic en una cubeta filtra; segundo clic lo quita; las demás cubetas
    conservan su monto (a propósito).
  - Paginación: los totales de arriba son de **toda** la cartera, no de la
    página. Es el arreglo central de la Etapa 1.
  - Filtros y orden; búsqueda con debounce.
  - Panel de detalle (icono de panel en cada fila): el desglose *explica* el
    saldo — total, pagado, notas de crédito, saldo de factura, mora.
  - Gestión de cobro: registrar contacto, nota y promesa; cerrar la promesa;
    fijar próxima acción.
  - Exportar: el archivo respeta los filtros activos y trae toda la cartera.
  - Casos sembrados que valen la pena enseñar: `SEEDCXC-CONMORA` (mora que
    ignora una ND anulada), `SEEDCXC-CONNCID` (nota de crédito restando),
    `SEEDCXC-VENC100` (cubeta +90), `SEEDCXC-SALDADAMORA` (factura saldada que
    sigue en cartera solo por su mora).

  **2. Qué debe entender Darian para defenderlo**, en lenguaje llano:
  - Qué es la fórmula del saldo y por qué `saldoFactura` y `saldo` son dos cosas
    distintas (mora aparte).
  - Por qué el saldo se bajó a SQL: antes el `LIMIT` cortaba antes de descartar
    las filas sin saldo, y con más de 2000 documentos abiertos la cartera se
    truncaba en silencio.
  - Qué NO hace este módulo: **no genera asientos contables todavía**. El Paso 1
    es cartera; el motor contable arranca en el Paso 2.
  - Los dos hallazgos que le tocan a Alex decidir: el bug de fecha UTC y la
    discrepancia de `getAgingCxC`.
  - Que la migración 0082 ya está aplicada en la branch de contabilidad, y que
    crea dos tablas nuevas sin tocar ninguna existente.

## Paso 2 — Catálogo de cuentas · ✅ HECHO (2026-07-21)

**Migración `0083_contabilidad_catalogo_cuentas.sql` aplicada** a
`ep-bold-pine-anhzpklp` / `neondb` con confirmación de Darian. Una tabla
(`contabilidad_cuentas`), 14 columnas, 5 índices, 4 CHECK. No toca ninguna tabla
existente; las 2 de cobranza quedaron intactas.

Los 4 subpasos del plan quedaron cubiertos:

| # | Qué pedía el plan | Cómo quedó |
|---|---|---|
| 1 | Estructura del catálogo | `codigo`, `nombre`, `tipo`, `naturaleza`, `cuenta_padre_id`, `activa`, más `imputable` y `es_base` |
| 2 | Catálogo base | 27 cuentas, numeración estándar RD, 3 niveles. Cubre las 8 que exige el plan |
| 3 | Personalización | Crear, renombrar, mover de padre, invertir naturaleza, desactivar |
| 4 | Proteger cuentas usadas | Sin borrado con hijas ni movimientos; código y tipo inmutables con movimientos |

### Decisiones de diseño (no reabrir sin motivo)

- **`naturaleza` se guarda, no se deriva de `tipo`.** Las cuentas de
  contrapartida invierten la naturaleza de su clase: `4103 Descuentos y
  devoluciones sobre ventas` es de tipo ingreso y naturaleza **deudora** porque
  resta. Derivarla haría imposible representarlas. La UI las marca "(invertida)".
- **`imputable` es un flag explícito, no "no tiene hijos".** Si se derivara,
  colgarle una hija a una cuenta con movimientos la volvería no-imputable de
  golpe y dejaría asientos huérfanos. Con el flag, ese caso se bloquea con
  mensaje en vez de corromperse en silencio.
- **Siembra perezosa.** El catálogo base se crea en el primer render de
  `/dashboard/contabilidad/cuentas`, no en la migración ni al crear el team. Un
  team que nunca use contabilidad no gana 27 cuentas que no pidió. Es
  idempotente y **no sobrescribe**: si el usuario renombró `1101`, se queda.
- **Numeración estándar RD** (1 Activo · 2 Pasivo · 3 Patrimonio · 4 Ingresos ·
  5 Costos · 6 Gastos), decidida por Darian. Es con la que van a comparar los
  contadores locales.
- **Las cuentas base no se borran desde la UI**, solo se desactivan. Borrar queda
  para las que crea el usuario (`es_base = false`).

### La pieza que mira al futuro

`tieneMovimientos()` en `lib/contabilidad/cuentas.ts` consulta
`contabilidad_asiento_lineas`, **que no existe hasta el Paso 4**. Usa
`to_regclass` para preguntar si la tabla existe: devuelve `false` mientras no
exista y **empieza a proteger sola en cuanto aparezca**, sin que haya que
acordarse de volver a este archivo. Cuando se cree esa tabla en el Paso 4, la
columna debe llamarse `cuenta_id` y tener `team_id`, o hay que ajustar la
consulta.

### Verificación

- Typecheck limpio.
- Estructura confirmada contra la DB: 14 columnas, 5 índices, 4 CHECK.
- **6 guardas probadas contra la API real** (código duplicado → 409, hija de
  cuenta imputable → 409, tipo inválido → 400, código vacío → 400, desactivar
  padre con hijas activas → 409, volver imputable una cuenta con hijas → 409).
- **3 casos de ciclo probados**: directo (A→B→A), largo (dos niveles) y
  autopadre. Los tres rechazados con mensaje propio.
- Camino feliz completo desde el **formulario de la UI**, no solo por API: alta
  de `6102 Alquiler de local` bajo `61`, la tabla refrescó a 28 filas, y se
  borró después (catálogo de vuelta en 27).
- El desplegable de cuenta padre lista solo las 12 agrupadoras, ninguna imputable.
- Sin errores de consola. Los del server (`/api/sistema/ambiente`, API key de
  e-CF inválida) son preexistentes del entorno de dev.

> ⚠️ **Trampa del entorno, no del código.** En el navegador headless los modales
> de Radix quedan montados tras cerrarse: el reloj de animaciones está congelado
> (`currentTime: 0`) y nunca llega el `animationend` que dispara el desmontaje.
> Se comprobó que **una transición CSS trivial tampoco avanza**, así que no es
> del componente. El estado de React sí es correcto (`data-state="closed"`).
> No perseguir esto como bug: verificar el cierre en un navegador real.

---

## Paso 3 — Cuentas automáticas · ✅ HECHO (2026-07-21)

**Migración `0084_contabilidad_config_cuentas.sql` aplicada.** Tres tablas, una
por subpaso del plan: `contabilidad_config` (5 cuentas generales + interruptor),
`contabilidad_config_metodos_pago` (clave → cuenta, con cuenta de comisión para
pasarelas) y `contabilidad_config_ingresos` (override por categoría o producto).

| # | Qué pedía el plan | Cómo quedó |
|---|---|---|
| 1 | Configuración general | 5 cuentas: por cobrar, ITBIS, ingresos, descuentos, mora |
| 2 | Cuentas por método de pago | 8 claves configurables + las 2 pasarelas aparte |
| 3 | Por producto/servicio/categoría | Sin configurar: `products.tipo` decide. Overrides para excepciones |
| 4 | Validar configuración incompleta | Lista de huecos concretos + interruptor que se niega a encender |

### El hallazgo que cambió el diseño

**Un cobro por CardNet/Azul se guarda como `metodo = 'tarjeta'`**, idéntico a una
tarjeta pasada en el mostrador — ver `lib/pagos/links.ts`, que llama a
`registrarPago({ metodo: 'tarjeta' })`. El campo `pagos_recibidos.cuenta` guarda
'Azul'/'CardNet' pero es **texto libre editable**, así que no sirve de
discriminador. Lo único fiable es que exista una fila en `payment_links`
apuntando a ese pago.

Importa porque el dinero de una pasarela **no entra al banco ese día**: liquida
después y retiene comisión. Mapear ambos al mismo sitio infla el banco con plata
que no ha llegado.

Solución: las claves contables `pasarela_cardnet` / `pasarela_azul` existen
aparte de `tarjeta`, y **`claveContableDePago()`** hace la traducción mirando el
vínculo del link. La trampa queda encerrada en una función documentada.

### Decisiones de diseño

- **Solo se exigen los métodos que el team usa de verdad.** `getEstadoConfiguracion`
  mira el historial real de `pagos_recibidos`. Pedirle a una panadería que
  configure "Link de pago Azul" cuando nunca cobró en línea es ruido, y el ruido
  hace que la gente ignore la validación entera.
- **`saldo_favor` y `nota_credito` no llevan cuenta de cobro.** No son entrada de
  efectivo, son la aplicación de un crédito previo; su asiento va contra
  descuentos en el Paso 5. La API rechaza configurarles cuenta.
- **La cuenta de comisión solo aplica a pasarelas.** En efectivo no hay comisión.
- **La configuración solo acepta cuentas imputables y activas.** Apuntar a una de
  agrupación produciría asientos sobre una cuenta que no los recibe.
- **`activa` arranca apagado y no se puede encender con huecos.** Asientos
  descuadrados son peores que no tener asientos.
- **Bien → `4101`, servicio → `4104` sin configurar nada**, usando `products.tipo`
  que ya existía. Los overrides son solo para excepciones.

### Cuentas nuevas en el catálogo base

El Paso 3 necesitaba tres que el Paso 2 no tenía: **`1106 Cobros por liquidar`**
(puente de pasarela), **`4104 Ingresos por servicios`** y **`6102 Comisiones por
cobro electrónico`**. Además `4101` pasó a llamarse "Ingresos por venta de
mercancía".

> ⚠️ **La siembra automática NO las reparte a los teams ya sembrados**, porque se
> planta en cuanto existe una sola cuenta. Para eso está
> **`sembrarCuentasBaseFaltantes()`** y el botón **"Restaurar cuentas base"** del
> catálogo. Es explícito a propósito: si alguien borró una cuenta base porque no
> la usa, no se la devolvemos a sus espaldas en cada render. **Nota:** tampoco
> renombra `4101` en los catálogos viejos — el nombre es del usuario desde que lo
> toca.

### Piezas sin caller — a propósito, no por olvido

`resolverCuentaIngreso()`, `resolverCuentaCobro()` y `claveContableDePago()` no
tienen llamador fuera de su archivo. **No es el error del Paso 1.** Allí el
huérfano era funcionalidad de usuario inalcanzable; estas son la puerta de
entrada del Paso 4, y no hay nada que resolver hasta que existan los asientos.

Están **verificadas por script**, no dadas por buenas: los 4 niveles de la cadena
de resolución, incluida la vuelta atrás al quitar un override.

### Verificación

- Typecheck limpio.
- **Cadena de resolución, los 4 niveles**, con datos temporales creados y
  borrados: producto → `4102`, categoría → `4104`, tipo bien → `4101`, sin
  producto → la general. Al quitar el override de producto vuelve al de
  categoría. Limpieza confirmada en 0.
- **Guardas probadas contra la API real**: activar con huecos → 409 con los 9
  huecos listados; cuenta de agrupación → 409; comisión en método no-pasarela →
  409; cuenta para `saldo_favor` → 409.
- **Flujo completo**: configurar las 5 generales + 4 métodos + pasarela con
  puente y comisión → `completa: true` → encender → la UI muestra "encendida" y
  el botón cambia a "Apagar".
- `restaurar-base` insertó exactamente las 3 que faltaban, sin duplicar ni tocar
  las existentes. Cero códigos duplicados en la base.
- UI hidratada, 15 selects activos, las 3 secciones renderizadas.

> ⚠️ **Trampa: un componente de cliente no puede importar de `config.ts`.** Ese
> archivo importa `db`, que arrastra `postgres` → `fs`, y el build del cliente
> falla con `Can't resolve 'fs'`. Por eso las claves y etiquetas de método viven
> en **`lib/contabilidad/metodos.ts`**, sin dependencias de base. Si añades una
> constante que la UI necesite, va ahí — no en `config.ts`.

> ⚠️ **`u.clave <> ALL(${arrayJS})` no funciona.** Postgres responde
> `op ANY/ALL (array) requires array on right side`: el array de JS llega como
> parámetro escalar. Hay que expandirlo con `sql.join` a parámetros sueltos.

> **Ojo con el team en las pruebas.** `getTeamIdForUser()` devolvió el **team 2**,
> no el 9. Ambos tienen catálogo. Los escenarios `SEEDCXC` de cartera siguen
> viviendo solo en el **team 9**.

---

## Paso 4 — Asientos · ✅ HECHO (2026-07-21)

**Migración `0085_contabilidad_asientos.sql` aplicada.** `contabilidad_asientos`
(encabezado) + `contabilidad_asiento_lineas` (apuntes). Con los nombres y
columnas que `tieneMovimientos()` ya esperaba, así que la protección de borrado
del catálogo **quedó activa sola** al crear la tabla.

| # | Qué pedía el plan | Cómo quedó |
|---|---|---|
| 1 | Tablas de asientos | Encabezado + líneas, con CHECK de que un apunte es debe **o** haber |
| 2 | Asiento de factura | Debe CxC / Haber ingresos (repartidos) / Haber ITBIS |
| 3 | Asiento de pago | Debe cuenta del método / Haber CxC |
| 4 | Asegurar cuadre | Validación debe==haber **antes** del insert, dentro de la transacción |
| 5 | Relacionar con origen | `origen_tipo` + `origen_id`, con índice único |
| 6 | Una sola fuente monetaria | El cargo escolar no genera asiento; lo genera la factura |

### Las tres trampas que había que esquivar

**1. `lineas_json` está en PESOS, el encabezado en CENTAVOS.** Está dicho en
`lib/reportes/shared.ts` pero es fácil de pasar por alto: sumar líneas para el
asiento habría dado un error de ×100. `parseLineas()` ya devuelve centavos.

**2. Las líneas de factura no llevan id de producto.** Solo `referencia` (SKU) o
el nombre — el propio rollup de reportes agrupa por `'ref:'||referencia`. O sea
que **`resolverCuentaIngreso(teamId, productoId)` del Paso 3 no se puede
alimentar directo desde una línea.** El reparto mapea por SKU contra
`products.referencia`, y una línea sin SKU (o con SKU que no case) cae a la
cuenta de ingresos general. `products.referencia` **no es único por team**, así
que se usa `DISTINCT ON ... ORDER BY p.id` para que el reparto sea estable entre
ejecuciones en vez de depender del plan de consulta.

**3. Redondeo: las líneas no tienen por qué sumar el ingreso del encabezado.**
Se resuelve **anclando en el encabezado** —que es la cifra facturada al cliente y
la que tiene la DGII— y usando las líneas solo para decidir el reparto. La
diferencia va al grupo mayor. Así el asiento cuadra al centavo pase lo que pase
con el JSON. Probado: líneas que sumaban RD$99.99 contra un encabezado que exigía
RD$100.01 → ajuste de RD$0.02 al grupo mayor, cuadre exacto.

> ⚠️ **Y una cuarta, que casi se cuela: las columnas `bigint` llegan a JS como
> STRING.** `0 + "701" + "0"` da `"07010"`, no 701 — una suma de importes se
> convierte en concatenación y no se nota hasta ver un total absurdo. Lo detectó
> el propio script de prueba, que marcaba DESCUADRADO mientras el cuadre en SQL
> daba cero. Contenido en `aNumero()` dentro de `libro-diario.ts`, el único sitio
> por donde los montos salen de la base. **Si añades una consulta que devuelva
> `bigint`, pásala por ahí.**

### Decisiones de diseño

- **La generación NO se engancha al flujo de emisión de facturas.** Meterle una
  escritura contable al motor de facturación significa que un fallo aquí podría
  tumbar una emisión a la DGII: eso cambia un problema grave por uno peor. El
  barrido es un botón explícito en el libro diario.
  *Compromiso conocido, igual que las promesas del Paso 1: **lo que nadie barre
  no se asienta.*** El punto de enganche está aislado en
  `generarAsientosPendientes()`; mudarlo a un cron es un cambio chico.
- **Generar es POST, no efecto del GET.** Escribe contabilidad, y una recarga o
  un prefetch del navegador no deberían poder dispararlo.
- **Idempotencia por índice único `(team_id, origen_tipo, origen_id)`** más
  `ON CONFLICT DO NOTHING`. Reintentar no duplica, que es el error más caro que
  puede cometer este módulo. Si dos procesos asientan a la vez, uno gana y el
  otro se entera sin romper nada.
- **Se factura contra Cuentas por cobrar incluso al contado.** El pago genera su
  propio asiento (debe caja / haber CxC), así que la cuenta se abre y se cierra.
  Registrar la venta directo contra caja perdería la trazabilidad de qué se cobró
  y cuándo.
- **Los documentos con retenciones se saltan**, con motivo visible. Cambian el
  asiento (parte del cobro va a la DGII) y son explícitamente del Paso 5.
  Generar uno "casi bien" para un libro real es peor que no generarlo: nadie
  vería que está mal hasta la declaración.
- **Tope de 200 orígenes por barrido**, con aviso de "quedan más". El primer uso
  en una empresa con historial no debe tardar minutos.
- **`verificarCuadre()` se muestra en la pantalla** aunque siempre deba dar cero.
  Si algún día da algo, hay un bug y se ve antes de contaminar un reporte.

### Verificación

- Typecheck limpio.
- **Reparto y cuadre, con documentos temporales creados y borrados** (restos: 0):
  - ITBIS > 0 → 3 apuntes, ITBIS exacto contra el encabezado.
  - Dos líneas bien/servicio → `4101` y `4104` separados, cuadre exacto.
  - Redondeo → ajuste al grupo mayor, débito == `monto_total` al centavo.
  - Línea sin SKU → cuenta de ingresos general.
- **Idempotencia**: segundo barrido crea 0; reintentar una factura ya asentada
  devuelve `ya-tiene-asiento`.
- **Cotejo global en SQL**: 0 asientos descuadrados, 0 facturas cuyo asiento no
  cuadre con su `monto_total`.
- **Barrido con la contabilidad apagada** → no genera nada, motivo explicado.
- **Botón desde la UI**: generó 1 y saltó 1, con el aviso *"Se saltaron: 1 porque
  tienen retenciones (se tratan en el siguiente paso)"*.
- Detalle desplegable con fila de totales; 0 warnings de key en React; un id de
  asiento inexistente devuelve vacío en vez de filtrar datos de otro team.

---

## Paso 5 — Casos especiales · ✅ HECHO (2026-07-21)

**Migración `0086_contabilidad_casos_especiales.sql` aplicada.** No crea tablas:
añade dos columnas a `contabilidad_config` y dos cuentas al catálogo base. Los
asientos de estos casos van a las mismas tablas del Paso 4 — solo cambia lo que
se sabe registrar.

| # | Qué pedía el plan | Cómo quedó |
|---|---|---|
| 1 | Notas de crédito | Debe descuentos + Debe ITBIS / Haber CxC (+ Haber saldo a favor) |
| 2 | Notas de débito y mora | La mora acredita `4102`, no la cuenta de ventas |
| 3 | Anulaciones | Asiento reverso con debe/haber intercambiados; el original se conserva |
| 4 | Retenciones | El débito se parte: CxC (total − retenido) + `1107 Retenciones por cobrar` |
| 5 | Saldos a favor | `2104` se acredita al generarlos y se debita al aplicarlos |

### El defecto del Paso 4 que salió aquí

**Una nota de débito por mora acreditaba "Ingresos por ventas".** El tipo e-CF de
una ND es `33`, que está en `TIPOS_VENTA`, así que `generarAsientoFactura` la
trataba como una venta más y el reparto por línea caía a la cuenta de ingresos
general. El recargo por atraso se mezclaba con las ventas y distorsionaba el
margen del negocio.

Corregido: si `mora_origen_id` no es nulo, el ingreso va entero a
`cfg.cuentaMoraId` sin repartir por líneas. **Los asientos de mora generados
antes de este arreglo tienen la cuenta equivocada** — en dev no había ninguno,
pero conviene tenerlo presente si alguna base ya barrió con la versión anterior.

### Dos cuentas nuevas, y por qué son de la clase que son

- **`2104 Saldos a favor de clientes` es PASIVO.** Cuando una nota de crédito
  supera lo que el cliente debía, ese exceso no es "menos deuda": es dinero que
  la empresa le debe a él. Restarlo de la cartera la dejaría en negativo.
- **`1107 Retenciones por cobrar` es ACTIVO.** Lo que el comprador retiene no
  entra al banco, pero deja un crédito fiscal. La venta fue por el total, así que
  el ingreso no cambia; lo que se parte es el débito.

### Decisiones de diseño

- **Un documento anulado no borra su asiento.** Se crea uno reverso con debe y
  haber intercambiados. Un libro contable no se reescribe: la anulación es un
  hecho posterior con su propia fecha, y las dos operaciones quedan visibles.
  El índice único impide reversar dos veces.
- **Se busca el asiento original por `origen_tipo IN ('factura','nota')`**, porque
  una nota de crédito anulada también hay que reversarla.
- **Una NC con `codigo_modificacion = 2` ("corrige texto") no genera asiento.**
  No mueve dinero, solo enmienda datos del documento original.
- **El crédito generado se capa al total de la nota**, por si el dato viniera
  inconsistente: nunca debe crear más pasivo que el importe de la propia nota.
- **El barrido ya no excluye `saldo_favor` ni `nota_credito`**: desde este paso
  tienen asiento propio contra `2104`. Sin eso, el saldo a favor crecería para
  siempre y nunca se vería consumido en el balance.
- **Las anulaciones solo se barren si el documento YA tenía asiento** (`JOIN`, no
  `LEFT JOIN`). Uno anulado antes de que nadie barriera no tiene nada que
  reversar, y sale con ese motivo si se pide de una en una.

### Verificación

Los datos reales del dev no tienen notas de crédito, mora, retenciones ni
anulaciones asentables, así que **nada de esto estaría probado sin datos
sintéticos**. Siete casos con documentos temporales creados y borrados (restos: 0):

| Caso | Resultado |
|---|---|
| Mora | Acredita `4102`, no ventas ✓ |
| NC sin saldo a favor | Reduce CxC por el total ✓ |
| NC con saldo a favor (800 de 2000) | CxC 1200 + `2104` 800 ✓ |
| Retenciones (1800 de 11800) | CxC 10000 + `1107` 1800 ✓ |
| Anulación | CxC pasa a haber; original conservado; reversar dos veces → `ya-tiene-asiento` ✓ |
| Aplicación de saldo a favor | Debita `2104`, cancela CxC ✓ |
| NC código 2 | No genera asiento (`nc-solo-texto`) ✓ |

Los siete cuadran. Typecheck limpio. En el navegador: los 7 campos de
configuración, los 4 badges del libro (factura/cobro/nota/anulación) con colores
distintos, el detalle del reverso mostrando debe y haber invertidos, y 0 errores
de consola.

> ⚠️ **`guardarConfig` ignora los `undefined` en silencio** (es su contrato:
> `undefined` = "no tocar este campo"). El primer intento de la prueba pasó
> `by['2104']` cuando esa cuenta todavía no existía en el catálogo del team →
> `undefined` → no se guardó nada, y el script dijo "configuradas". **Si un
> script configura cuentas por código, que falle ruidosamente si el código no
> existe.**

> 🐛 **Bug del Paso 5 encontrado el 2026-07-21, arreglado en esta rama:** el
> PATCH de `/api/contabilidad/config` (sección `general`) solo reenviaba los 5
> campos originales. La UI mandaba `cuentaSaldosFavorId` y `cuentaRetencionesId`
> pero la ruta los descartaba → `guardarConfig` los veía `undefined` → 200 sin
> guardar nada. **Falla silenciosa de manual.** Lo destapó Darian configurando
> el team 9 desde la UI; la verificación original del Paso 5 configuró por
> script directo a `guardarConfig`, así que el camino UI→API de esos dos campos
> nunca se ejercitó. Lección: **verificar los caminos nuevos de la UI aunque la
> librería esté probada** — la ruta es parte del camino.

> ⚠️ **Al borrar documentos de prueba, hacerlo en orden inverso al de creación.**
> Una ND de mora referencia su factura origen vía `mora_origen_id`, así que
> borrar la factura primero viola `ecf_documents_mora_origen_id_fkey`.

---

## Paso 6 — Reportes contables · EN CURSO

**Alcance acordado con Darian (2026-07-21): los tres reportes contables**
(subpasos 1-3 del plan). El estado de resultados, los reportes de cartera y las
exportaciones (subpasos 4-6) **quedan fuera**: la cartera ya salió casi entera
en el Paso 1 y el resto se decide después. Sin migración nueva — los tres salen
de los asientos que ya existen, así que la **0087 sigue libre**.

| # | Reporte | Estado |
|---|---|---|
| 1 | Libro diario + filtros | ✅ Hecho |
| 2 | Mayor general | ✅ Hecho |
| 3 | Balance de comprobación | ✅ Hecho |

**Los tres están hechos. El Paso 6 acordado está cerrado**, y con él el plan
completo hasta donde se decidió llegar. Falta pushear (Darian decidió pushear al
cerrar el paso, no por subpaso) y actualizar la descripción del PR.

### Subpaso 1 — Libro diario con filtros · ✅ HECHO (2026-07-21)

Filtros por **fecha (desde/hasta), origen y cuenta**, que es lo que pedía el
plan, más la paginación que faltaba.

**Los filtros viven en la URL, no en estado del cliente.** Así filtra y pagina
el servidor —el libro puede tener miles de asientos y traerlos todos al
navegador para filtrarlos ahí es exactamente el bug que se arregló en la
cartera— y de paso una vista filtrada se puede compartir o guardar.

#### Dos defectos que había antes de empezar

1. **El filtro `origenTipo` de la API solo aceptaba `factura|pago`.** El Paso 5
   añadió los orígenes `nota` y `anulacion`, pero la whitelist se quedó atrás:
   filtrar por esos dos **se ignoraba en silencio y devolvía el libro entero**,
   como si no hubiera filtro. Ahora la whitelist sale de la constante `ORIGENES`
   en vez de repetir los valores a mano, que es lo que dejó que se desincronizara.
2. **La paginación era inalcanzable.** `listarAsientos` aceptaba `limit`/`offset`
   desde el Paso 4, pero la pantalla pedía 50 fijos y pintaba lo que llegara:
   **a partir del asiento 51 el resto no se podía ver desde la UI**, y sin aviso.
   Es la misma clase de pieza huérfana que el barrido del Paso 1 encontró tres
   veces — el backend estaba, el camino desde la UI no.

#### Decisiones de diseño

- **El filtro por cuenta usa `EXISTS` sobre las líneas, no un `JOIN`.** Con
  `JOIN`, un asiento que toca la misma cuenta en dos apuntes saldría duplicado en
  la lista y contado dos veces en el total. El `l.team_id` va en la subconsulta
  aunque el asiento ya esté acotado, para entrar por
  `contabilidad_asiento_lineas_cuenta_idx (team_id, cuenta_id)`.
- **El listado y el conteo comparten `condicionesLibro()`.** Si el conteo
  filtrara distinto que la lista, la paginación ofrecería páginas que no existen
  o escondería asientos sin decirlo.
- **El total y la suma son de todo lo filtrado, no de la página.** Mismo criterio
  que la cartera del Paso 1.
- **El desplegable de cuenta solo lista las que tienen movimientos**, no las 30+
  del catálogo: un filtro que ofrece opciones que devuelven cero hace dudar de si
  el reporte está roto.
- **Cambiar un filtro vuelve a la página 1 en el mismo paso.** Separarlo en un
  `useEffect` fue el bug del Paso 1 (dos consultas, y el usuario en una página que
  ya no existía).
- **Las fechas se validan antes de llegar al `::date`.** Una cadena rara ahí no
  devuelve vacío: lanza excepción y la pantalla se cae con un 500. Se comprueba
  formato **y** existencia en el calendario, que es lo que descarta un 31 de
  febrero.
- **Una página fuera de rango cae a la última real.** `?pagina=999` mostraba
  "Todavía no hay asientos" sobre un libro con 12 — falso y asustaba. La consulta
  extra solo ocurre en ese caso anómalo.
- **El vaciado distingue "no hay nada" de "no hay nada que case"**, para que
  nadie crea que perdió sus asientos por filtrar.

#### Verificación

Typecheck limpio. En el navegador, contra el **team 2** (12 asientos, 4 cuentas
con movimientos):

| Prueba | Resultado |
|---|---|
| Sin filtro | 12 asientos · RD$158.16 (suma exacta de los 12 importes) |
| `origenTipo=factura` | 3 · RD$56.76 |
| `origenTipo=pago` | 9 · RD$101.40 — **9+3=12 y 101.40+56.76=158.16**, partición exacta |
| `origenTipo=anulacion` | 0, con vaciado propio. **Antes del arreglo devolvía los 12** |
| `cuentaId` = 4101 Ingresos | 3 · RD$56.76 (solo facturas acreditan ingresos) |
| `cuentaId` = 1103 CxC | 12 asientos y **12 filas** — el `EXISTS` no duplica |
| `desde=2026-06-24&hasta=2026-06-28` | 7 · RD$116.16, ambos extremos inclusivos |
| Select de origen desde la UI | URL a `?origenTipo=pago`, 9 filas |
| Botón "Quitar filtros" | URL limpia, selects a cero, 12 de vuelta |
| Paginación (con `PAGE_SIZE` bajado a 5 y devuelto a 50) | "Página 1 de 3 · mostrando 1–5 de 12"; Anterior deshabilitado; página 2 sin solape; el total siguió siendo el de toda la cartera |
| Filtrar **estando en página 2** | URL a `?origenTipo=factura` sin `pagina`, una sola navegación |
| Parámetros basura (`desde=2026-02-31`, `desde=basura`, `';DROP TABLE x;--`, `cuentaId=abc`, `cuentaId=-5`, `origenTipo=inventado`, `pagina=-3`, `hasta=99999-99-99`) | Los 9 responden **200**, se ignoran como "sin filtro". Ninguno rompe |

0 errores de consola.

> ⚠️ **Lo que NO quedó ejercitado.** El team 2 no tiene asientos de `nota` ni de
> `anulacion`, así que de esos dos filtros solo se probó que **filtran** (0 filas
> en vez de las 12 de antes), no que seleccionen bien cuando hay datos. Para
> cerrarlo haría falta asentar los escenarios del Paso 5, que son sintéticos.
> Tampoco se probó con más de 50 asientos reales: la paginación se ejercitó
> bajando `PAGE_SIZE` a 5 temporalmente.
>
> Los **screenshots siguen agotando el tiempo de espera** en este entorno (ya
> pasaba en el Paso 1). La verificación fue por DOM y traza de red.

### Subpasos 2 y 3 — Mayor general y balance · ✅ HECHO (2026-07-21)

Los dos en `lib/contabilidad/reportes.ts`, con pantallas en
`/dashboard/contabilidad/mayor` y `/dashboard/contabilidad/balance`. **Sin
migración**: un reporte no guarda nada, así que la **0087 sigue libre**.

#### La regla del signo, y dónde NO se aplica

El saldo depende de la **`naturaleza`** de la cuenta, leída de la columna:
deudora = `debe − haber`, acreedora = `haber − debe`. Está aislada en
`saldoSegunNaturaleza()` para que exista un solo sitio donde equivocarse.

Pero **las columnas "saldo deudor" y "saldo acreedor" del balance NO miran la
naturaleza**: son aritmética pura (`debe − haber` y su inverso, el positivo
gana). Por eso el balance cuadra siempre que cuadren los asientos. La naturaleza
se usa ahí para otra cosa: para saber en qué columna se **esperaba** que cayera
la cuenta y marcar la que cae en la contraria.

#### Decisiones de diseño

- **Ninguno de los dos tiene ruta de API.** Todo el filtrado va por la URL y lo
  resuelve el servidor, así que una API sin llamador sería justo la pieza
  huérfana que este módulo ya produjo tres veces. Cuando llegue la exportación
  (subpaso 6, fuera de alcance) tendrá su propia ruta con su propio consumidor.
- **Las dos entradas se registraron en el sidebar** (`HREF_PERMISSION` y el grupo
  Contabilidad de `layout.tsx`), con `contabilidad:ver`. Sin eso las pantallas
  existirían pero no habría camino desde la UI — la lección del Paso 1.
- **El saldo inicial del mayor es el arrastre de todo lo anterior a `desde`.**
  Sin él, el saldo final de un mes suelto no significa nada. Sin `desde` es cero
  y se dice en pantalla, para que nadie lo lea como "empezó en cero".
- **El mayor ordena ASCENDENTE**, al revés que el libro diario: el saldo
  corriente solo se puede acumular leyendo de lo más viejo a lo más nuevo.
- **Tope de 500 movimientos por cuenta**, y cuando se alcanza se avisa de que
  *los totales de arriba son solo de esos 500*. Un total recortado presentado
  como total es peor que no darlo.
- **El saldo final se recalcula de los totales, no se toma del último movimiento
  visible**, precisamente por ese tope.
- **El balance solo lista cuentas con movimientos.** Un balance con 30 filas en
  cero esconde las 4 que importan.
- **Las cuentas del balance enlazan a su mayor** conservando el periodo.
- **`fmtDOP` pasó a poner el signo delante del símbolo** (`-RD$44.64` en vez de
  `RD$-44.64`). Estos reportes son los primeros que muestran negativos; hasta
  ahora nadie le pasaba uno.
- **`fechaValidaISO()` se movió a `lib/utils/format.ts`.** Había tres copias (la
  página del libro diario, su API y el filtro nuevo) de una validación que
  protege de un 500, que es el peor sitio para tener tres copias.

#### Verificación

Typecheck limpio. `npm run test:unit`: **24/24** (13 previos + 11 nuevos).

**11 tests unitarios nuevos** en `tests/unit/contabilidad-saldos.test.ts`, y no
son de adorno: **la trampa del paso no se puede ver con los datos del dev.** La
cuenta que de verdad la ejercita es `4103 Descuentos`, tipo ingreso con
naturaleza deudora, y no tiene ni un movimiento en la base. El test demuestra que
deducir la naturaleza del tipo da `-3000` donde lo correcto es `3000` — el signo
exactamente invertido, y solo en esa clase de cuenta.

En el navegador, contra el **team 2**:

| Prueba | Resultado |
|---|---|
| Balance completo | Debe 74.40+27.00+56.76 = **RD$158.16** = haber 101.40+56.76. Cuadra |
| Saldos del balance | Deudor 101.40 = acreedor 101.40. Cuadra |
| Cotejo con el libro diario | Los RD$158.16 coinciden con el total del libro |
| Mayor de 1103 CxC (deudora) | Saldo corriente correcto en los 12 pasos; final **−RD$44.64** |
| Mayor de 4101 Ingresos (acreedora) | Los créditos **suman**: 17.60 → 34.76 → 56.76. Signo opuesto, como debe |
| Cotejo entre reportes | El −44.64 del mayor es el mismo 44.64 acreedor del balance |
| Mayor con `desde=2026-06-28` | Arrastre −44.64 correcto; débitos 22.00 = créditos 22.00 → saldo final vuelve al inicial |
| Aislamiento entre teams | Las cuentas 35/36/37 (team 9) dan "esa cuenta no existe" sin filtrar datos |
| Cuenta inexistente / sin elegir / agrupadora sin movimientos | Cada una con su mensaje propio |
| Periodo vacío (`desde=2027-01-01`) | "Ninguna cuenta tuvo movimientos en el periodo elegido" |
| Parámetros basura (`cuentaId=abc`, `-1`, `desde=basura`, `2026-02-31`, `';DROP TABLE x;--`) | Los 9 responden **200**, se ignoran como "sin filtro" |
| Sidebar | Las dos entradas aparecen bajo Contabilidad |

0 errores de consola.

> **Hallazgo con los datos reales del dev, que no es un bug del reporte.** El
> balance marca `1103 Cuentas por cobrar` con **saldo invertido**: es deudora
> pero quedó acreedora en RD$44.64. La causa es que hay **9 cobros asentados
> contra solo 3 facturas** — el compromiso conocido del Paso 4 (*"lo que nadie
> barre no se asienta"*) hecho visible por primera vez. En una base donde se
> barra a tiempo no debería aparecer. Vale la pena enseñárselo a Alex: es
> justamente para lo que sirve el aviso.

> ⚠️ **Lo que NO quedó ejercitado.** Ninguna cuenta del dev tiene la naturaleza
> invertida respecto a su clase, así que la trampa del `4103` está cubierta
> **solo por test unitario**, no en pantalla. Tampoco hay datos de nota, mora,
> retención ni anulación en el team 2, así que los reportes no se vieron con esos
> asientos (sí con factura y cobro). El tope de 500 movimientos no se alcanzó.
> Los screenshots siguen agotando el tiempo de espera en este entorno; la
> verificación fue por DOM y traza de red.

### Ajuste perf post-revisión (2026-07-22) — pedido por Alex

Alex pidió aplicar al módulo el patrón de `perf/db-optimization` (que **ya está
en main y por tanto en esta rama** — verificado con `git merge-base
--is-ancestor`: SWR global, `React.cache` de sesión e índices 0070 ya activos
aquí). Lo que faltaba era de este módulo:

- **Libro diario: `PAGE_SIZE` 50 → 25.** Menos filas por consulta, más páginas
  — mismo tamaño que la cartera.
- **Mayor general: paginado de verdad** (25/página) en vez del tope de 500 con
  aviso. Tres piezas, todas en SQL y en paralelo:
  1. Totales y conteo del **tramo completo** (antes se sumaban en JS sobre las
     filas traídas: con más de 500 movimientos los totales salían recortados —
     ese defecto desapareció con el cambio, ya no hace falta el banner ámbar).
  2. El **arrastre de la página** (`saldoPrevioPaginaCents`): suma de las filas
     saltadas por el offset, con EL MISMO `ORDER BY` de la lista para que el
     saldo corriente empalme exacto entre páginas.
  3. La página de filas con `LIMIT/OFFSET`.
  La paginación de la UI es server-side con `<Link>` (la página no tiene
  componente de cliente y no hace falta crear uno). Página fuera de rango cae a
  la última real, como en el libro diario.
- **Cartera, balance y estudiantes: sin trabajo** — cartera y estudiantes ya
  seguían el patrón (Etapa 1 y MD1), el balance es agregado sin lista larga.
- **Secuencias NO se tocó**: página que vino de main (decisión 1: no tocar lo
  de main en esta rama).
- **Sin cache nuevo**: reportes server-rendered, 1 consulta por navegación;
  `unstable_cache` aportaría poco y arriesga staleness contable.

Verificado contra el team 9 (471 asientos, mayor de `1103` con 470 movimientos,
19 páginas): totales del periodo idénticos en todas las páginas; el arrastre de
la página 2 (RD$11,695.00) empalma exacto con la última fila de la página 1; el
acumulado de la última fila de la página 19 (−RD$1,528,505.00) coincide con el
saldo final agregado en SQL; `desde` + `pagina` combinados coherentes;
`pagina=999` cae a la 19; parámetros basura → 200. Typecheck limpio,
`test:unit` 24/24, 0 errores de consola.

### Si se retoma el resto del Paso 6

Quedaron fuera por decisión de alcance, no por olvido: **estado de resultados**
(subpaso 4), **reportes de cartera** (subpaso 5 — casi todo salió ya en el Paso
1) y **exportaciones CSV/PDF** (subpaso 6). El estado de resultados es el más
barato de los tres: sale de agrupar `balanceComprobacion()` por `tipo`
(ingreso − costo − gasto), que ya devuelve todo lo que necesita.

**Ojo con la naturaleza al calcular saldos:** una cuenta deudora tiene saldo
`debe − haber` y una acreedora `haber − debe`. La columna `naturaleza` está
guardada por cuenta justo para esto, y las de contrapartida (`4103`) la tienen
invertida respecto a su clase — usar `naturaleza`, nunca deducirla de `tipo`.

### Antes de escribir la primera línea

1. **Releer el Paso 6 del plan.** No asumir el diseño de memoria.
2. **Confirmar la DB con Darian** antes de correr nada contra Neon, incluso de
   solo lectura. Base actual: `ep-bold-pine-anhzpklp` / `neondb`.
3. **Los montos `bigint` llegan como string.** Pasarlos por `aNumero()` de
   `libro-diario.ts` o el reporte sumará concatenando.
4. **Numeración de migraciones:** main va por `0069` y la rama por `0086`. Al
   renombrar, ir en orden **descendente** y mover también
   `scripts/apply-migration-XXXX.ts`, actualizando la ruta del `.sql` y el
   mensaje de log **dentro** del script.

### La regla que se aprendió cerrando el Paso 1

**No marcar una etapa como hecha sin un camino desde la UI.** Las etapas 4-5 se
dieron por terminadas con el backend escrito y sin conectar; el barrido encontró
tres piezas huérfanas. Comprobación barata antes de marcar: `grep` del nombre del
endpoint o de la función exportada en `app/` y `components/`. Si no aparece fuera
de su propio archivo, no está hecho.

### Entorno (para no perder tiempo)

- **Auto-login:** `GET /api/dev/auto-login?email=ferrerasalexander@gmail.com`.
  **Hay que pasar el `?email=`** — el default `admin@emitedo.test` no existe en
  esta base y devuelve 404. Ese usuario pertenece a los teams 2, 7, 9 y 10.
- **Team 9** = COLEGIO ANDRES BELLO, donde viven los escenarios `SEEDCXC`.
- **No levantar un segundo `next dev`** si Darian ya tiene uno arriba: dos
  instancias sobre el mismo `.next` lo corrompen y sale
  `Invariant: missing bootstrap script` con 500. Si pasa: parar, borrar `.next`,
  arrancar de nuevo.
