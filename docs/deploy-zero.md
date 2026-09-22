# Deploy a producción (Zero / EmiteDO)

Producción vive en la rama `master`. Todo merge aprobado a `master` dispara,
en orden: **CI** (tipos, pruebas unitarias, build de verificación —
`.github/workflows/ci.yml`) y, si pasa, **Deploy** (`.github/workflows/deploy.yml`).
Nadie del equipo necesita acceso directo a Vercel: el deploy lo hace GitHub
Actions con un token de proyecto.

## Flujo normal (sin migraciones)

1. Se mergea un PR a `master`.
2. `CI` corre tipos + `test:unit` + build. Si falla, ahí termina — no hay deploy.
3. Si `CI` pasa, `Deploy` arranca solo. Compara los archivos tocados desde el
   último deploy exitoso: si ninguno está bajo `lib/db/migrations/`, el job
   `deploy` corre automático, sin pedir aprobación.
4. `vercel pull` + `vercel build --prod` + `vercel deploy --prebuilt --prod`
   publican la nueva versión. La URL queda en el Job Summary de ese run.

## Migraciones de base de datos

Si el rango mergeado trae algún archivo nuevo o modificado bajo
`lib/db/migrations/` (fuera de `meta/`), el job `deploy` de ese run queda
**pausado esperando aprobación** — corre bajo el Environment de GitHub
`produccion-con-migracion`, que tiene revisores obligatorios.

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
   `produccion-con-migracion` (botón "Review deployments"). El job `deploy`
   continúa solo desde ahí.

Si la migración falla o hay dudas, **no aprobar** — el deploy nunca sale
mientras el Environment esperando revisión no se apruebe, y eso no bloquea
nada más (los siguientes merges a `master` sí siguen corriendo `CI`, pero cada
uno abre su propio run de `Deploy` en la misma cola).

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

Ver la sección "Configuración manual previa" del plan que creó este flujo:
`docs/superpowers/plans/2026-09-22-deploy-zero-cicd.md`. Resumen:

- Environments de GitHub: `produccion` (sin revisores) y
  `produccion-con-migracion` (con revisores obligatorios).
- Secrets en ambos: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
- Vercel: Production Branch = `master`, con un Ignored Build Step que saltea
  el auto-deploy de Vercel en `master` (el deploy real lo hace GitHub Actions).
