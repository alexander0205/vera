# Deploy a producción (Zero / EmiteDO)

Producción vive en la rama `master`. `v2` es integración — ahí se juntan
las ramas de feature, se prueba, y de ahí se promueve a `master` con un PR.
Todo merge aprobado a `master` dispara **Deploy**
(`.github/workflows/deploy.yml`), un solo workflow con tres jobs en cadena:
**Validar** → **Detectar migraciones pendientes** → **Deploy a Vercel**.
Nadie del equipo necesita acceso directo a Vercel: el deploy lo hace GitHub
Actions con un token de proyecto.

`.github/workflows/ci.yml` es un workflow aparte que gatea PRs (tipos,
pruebas, build) contra `v2` y `master` — `deploy.yml` no depende de él,
revalida todo de cero sobre el commit que efectivamente llega a `master`.

## Flujo normal (sin migraciones)

1. Se mergea un PR a `master` (normalmente, una promoción desde `v2`).
2. `Validar` corre tipos + `test:unit` + build. Si falla, ahí termina — no
   hay deploy.
3. `Detectar migraciones pendientes` compara los archivos tocados desde el
   último deploy exitoso: si ninguno está bajo `lib/db/migrations/`, el job
   `deploy` corre automático, sin pedir aprobación.
4. `vercel pull` + `vercel build --prod` + `vercel deploy --prebuilt --prod`
   publican la nueva versión. La URL queda en el Job Summary de ese run.

## Migraciones de base de datos

Si el rango mergeado trae algún archivo nuevo o modificado bajo
`lib/db/migrations/` (fuera de `meta/`), el job `deploy` de ese run queda
**pausado esperando aprobación** — corre bajo el Environment de GitHub
`production-migration-required`, que tiene revisores obligatorios.

Qué hacer:

1. Entrar al run de `Deploy` en la pestaña Actions y abrir el Job Summary del
   job `deploy` — lista los archivos `.sql` que dispararon el gate.
2. Correr esa migración a mano contra producción, **con el mismo driver que
   usa la app** (no `psql` — ver el comentario en `scripts/correr-migracion.ts`
   sobre por qué):
   ```bash
   npx tsx --env-file=.env --env-file=.env.local scripts/correr-migracion.ts <archivo>.sql
   ```
   Ojo con el orden de `--env-file`: gana el último. Invertido apunta a
   producción cuando no debía, o viceversa — confirmar con el host que imprime
   el script antes de seguir.
3. Confirmar que la migración corrió limpia (el script imprime `OK — migración
   aplicada`; si hay más de un `.sql` en la lista, correrlos todos, en orden).
4. Volver al run de `Deploy` en GitHub y **aprobar** el Environment
   `production-migration-required`: botón "Review deployments" → tildar
   `production-migration-required` → **Approve and deploy**. El job `deploy`
   continúa solo desde ahí.

Si la migración falla o hay dudas, **no aprobar** — el deploy nunca sale
mientras el Environment esperando revisión no se apruebe, y eso no bloquea
nada más (los siguientes merges a `master` abren su propio run de `Deploy`,
en la misma cola).

## Si algo sale mal

**El build o el deploy en sí fallan (`vercel build` o `vercel deploy`
truenan):** producción no se toca — Vercel no reemplaza el deploy activo hasta
que el nuevo termina de construirse y publicarse. No hay nada que revertir.

**El deploy "publicó" pero algo se ve roto en producción:**
1. Conseguir la URL de un deploy anterior bueno — está en el Job Summary de un
   run previo de `Deploy` que sí funcionó, o en Vercel → Deployments (solo
   para mirar la lista, no para actuar ahí).
2. Actions → **Rollback a producción** → Run workflow → pegar esa URL.
3. Eso promueve ese deploy anterior a producción al instante, sin rebuild.
4. Corregir el problema en una rama nueva, PR normal a `master`, deploy normal.

**Si el problema es de datos (una migración salió mal):** el rollback de
Vercel revierte el código, no la base — una migración que ya corrió sigue
corrida. Si hace falta revertir el esquema, escribir y correr a mano la
migración inversa con el mismo `scripts/correr-migracion.ts`.

## Configuración (Environments, secrets, Vercel)

- Environments de GitHub: `Production` (sin revisores) y
  `production-migration-required` (con revisores obligatorios).
- Secrets en ambos: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
- Vercel: **no hace falta cambiar el Production Branch del dashboard** — el
  CLI deploya con `--prod` explícito, que promueve a producción sin importar
  qué rama tenga marcada Vercel. Opcional: un Ignored Build Step que saltee
  el build de *preview* que Vercel generaría solo en cada push a `master`
  (ahorra minutos de build, no afecta la corrección del flujo):
  ```bash
  if [ "$VERCEL_GIT_COMMIT_REF" == "master" ]; then
    echo "Este build lo hace GitHub Actions, no Vercel."
    exit 0
  else
    exit 1
  fi
  ```
