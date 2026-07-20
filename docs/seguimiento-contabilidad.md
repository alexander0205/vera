# Seguimiento — Módulo de contabilidad

> **Para quien retome esto (humano o IA).** Estado real de la ejecución del plan
> `docs/plan-contabilidad-vera.md` en la rama `feature/contabilidad-asientos-reportes`.
> Última actualización: **2026-07-20**.
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

## Siguiente trabajo de desarrollo

**Paso 2 del plan: catálogo de cuentas contables.** Nada empezado. No existe
ninguna tabla de asientos ni de catálogo en el schema. Ver
`docs/plan-contabilidad-vera.md` desde "Paso 2". La primera migración libre es
la **0083** (la 0082 ya se usó).
