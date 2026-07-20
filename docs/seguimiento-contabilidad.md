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
| 1 | Saldo a SQL, filtros/orden/paginación server-side, totales sobre toda la cartera | ✅ Hecho | `8ea7410` |
| 2 | Antigüedad de saldos (1-30/31-60/61-90/90+), "por vencer", métricas | ⬜ Siguiente | — |
| 3 | Panel lateral de detalle + timeline con datos ya existentes | ⬜ | — |
| 4 | Seguimiento de cobranza + promesas de pago + notas internas → **migración 0082** | ⬜ **Primer toque de DB** | — |
| 5 | Recordatorios individual/masivo + exportar cartera | ⬜ | — |
| 6 | Validar casos reales + trazabilidad | ⬜ | — |

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

Sembrados en **team 11** (`Distribuidora García SRL`, RNC ficticio `130123456` —
data de demo, no cliente real). Todo con prefijo **`SEEDCXC`** en `encf` y `codigo`.

29 documentos que cubren: al día, vence hoy, vencidas a 1/45/100 días, sin fecha,
pago parcial, ND de mora (activa + anulada + ya cobrada), factura saldada que sólo
arrastra mora, y las **5 variantes de nota de crédito** (por `origen_documento_id`,
por `ncf_modificado`, código 2 "corrige texto", anulada, modelo nuevo con
`credito_generado_cents`, y NC mayor que el saldo), más anuladas/rechazadas/pagadas.

Para borrarlos:

```sql
DELETE FROM pagos_recibidos WHERE ecf_document_id IN
  (SELECT id FROM ecf_documents WHERE team_id=11 AND (encf LIKE 'SEEDCXC%' OR codigo LIKE 'SEEDCXC%'));
DELETE FROM ecf_documents WHERE team_id=11 AND (encf LIKE 'SEEDCXC%' OR codigo LIKE 'SEEDCXC%');
```

**Ojo:** uno de los documentos tiene `encf = 'E310000099001'` (se renombró a
propósito para probar el vínculo por `ncf_modificado`), por eso la limpieza debe
buscar también por `codigo`.

> El script de siembra fue temporal y se borró. Si se va a seguir con las Etapas
> 2-6 conviene versionarlo como `scripts/seed-cartera-escenarios.ts` en vez de
> regenerarlo cada vez. **Está pendiente de decidir con el usuario.**

## Cómo se verificó la Etapa 1

- 12 casos sintéticos con `VALUES` dentro de un `SELECT` (sin escribir nada), para
  la lógica de las expresiones del CTE.
- 33 asserts contra los datos sembrados: vencimientos exactos, mora, las 5
  variantes de NC, exclusiones, totales, filtros, orden y paginación. 33/33.
- Typecheck limpio; `npm run test:unit` 13/13.

**No verificado:** nada se probó en el navegador. La página de cuentas por cobrar
cambió bastante (paginación, filtros server-side, aviso al agrupar) y **no se
abrió la app ni una vez**. Eso queda pendiente.

---

## Pendientes abiertos

- [ ] **Probar la UI de cuentas por cobrar en el navegador.** Etapa 1 la reescribió
      y nunca se ejecutó.
- [ ] Decidir si el script de siembra se versiona en `scripts/`.
- [ ] Respuesta de Alex sobre el hotfix: ¿se despliega aparte a main o se queda aquí?
- [ ] Confirmar contra la base de **producción** si `fecha_limite_pago` está
      realmente vacía. De eso depende si el bug de mora llegó a cobrar de más.
- [ ] Al agrupar por cliente se piden 500 filas y se oculta la paginación, con un
      aviso si la cartera excede eso. Solución de compromiso — validar con el usuario
      que le sirve.
