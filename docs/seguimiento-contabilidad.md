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
| 5 | Recordatorios individual/masivo + exportar cartera | ✅ Hecho | `c35d354` |
| 6 | Validar casos reales + trazabilidad | ✅ Hecho | `f008345` |

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

> ⚠️ **`getAgingCxC` (lib/reportes/queries.ts) no resta las notas de crédito.**
> Usa además otra definición de cobrable: solo e-CF aceptados, y cuenta las ND
> de mora como filas propias en vez de agruparlas en su factura padre.
> Medido en el team 9: **RD$78,295 en el reporte de antigüedad contra RD$77,245
> en cuentas por cobrar** — RD$1,050 de diferencia, que corresponde exacto a las
> tres NC sembradas (300 + 250 + 500) que el reporte no descuenta.
> Son dos pantallas que le dan números distintos al mismo usuario para lo mismo.
> **Pendiente de decidir con Alex si se corrige el reporte.**

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

> ⚠️ **La rama de Neon de contabilidad NO tiene las tablas `admin_escolar_*`.**
> Se creó desde un estado anterior a las migraciones escolares 0074-0081, aunque
> el código de esta rama sí las incluye. **El módulo de Administración Escolar
> está inoperativo en esta base.** El origen escolar del panel captura el error
> 42P01 y degrada a vacío, pero cualquier pantalla escolar dará error hasta que
> se apliquen esas migraciones aquí.

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

- [ ] **Decidir si se corrige `getAgingCxC`** para que no sobreestime la cartera
      (ver el aviso en la Etapa 2). Hoy el reporte y la pantalla de cobros dan
      números distintos. Afecta también a
      `/api/reportes/export?report=cuentas-por-cobrar`.
- [ ] **Aplicar las migraciones escolares 0074-0081 a la branch de Neon de
      contabilidad**, o el módulo escolar seguirá inoperativo aquí.
- [ ] **Probar un envío real de recordatorio** con un correo propio antes de
      soltarlo a clientes. La previsualización está verificada; el envío no.
- [ ] Enganchar `evaluarPromesasVencidas` a un cron, si se quiere que las
      promesas se marquen solas sin que alguien abra la cuenta.
- [ ] Respuesta de Alex sobre el hotfix: ¿se despliega aparte a main o se queda aquí?
- [ ] Confirmar contra la base de **producción** si `fecha_limite_pago` está
      realmente vacía. De eso depende si el bug de mora llegó a cobrar de más.
- [ ] Al agrupar por cliente se piden 500 filas y se oculta la paginación, con un
      aviso si la cartera excede eso. Solución de compromiso — validar con el usuario
      que le sirve.
