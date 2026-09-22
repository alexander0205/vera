# Deploy a Producción (CI/CD Zero) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Adaptación a este repo:** no hay runner de tests para YAML de GitHub Actions. La "verificación" de cada task que toca `.github/workflows/*.yml` es: revisar el diff a ojo, y una vez pusheado, confirmar en la pestaña **Actions** de GitHub que el workflow aparece listado sin el banner de "workflow file issue" (GitHub valida la sintaxis del YAML al indexarlo). Los pasos de ejecución real (que un deploy salga bien) solo se pueden probar en GitHub, no en local — por eso el plan termina con una task explícita de "primer deploy de prueba".

**Goal:** Que cada merge aprobado a `master` dispare automáticamente validación + build + deploy a producción en Vercel, sin que nadie del equipo necesite acceso directo a Vercel — y que si el cambio trae migraciones de base de datos, el deploy se detenga a esperar que alguien las corra a mano antes de continuar. Ticket: [Trello #18 — Configurar CI/CD Zero Emite](https://trello.com/c/8z2auSGE/18-configurar-ci-cd-zero-emite).

**Architecture:** Un segundo workflow (`deploy.yml`), separado del `ci.yml` ya reactivado (Fase 1), encadenado a él vía `workflow_run` — así el deploy solo arranca si `CI` terminó en verde sobre `master`. Un job intermedio compara el commit actual contra el último deploy exitoso registrado (consultando el propio historial del workflow `deploy.yml` por la API de GitHub) y detecta si el rango trae archivos nuevos en `lib/db/migrations/`. Si los trae, el job de deploy corre bajo el Environment de GitHub `produccion-con-migracion` (con revisores obligatorios); si no, corre bajo `produccion` (sin revisores, automático). El deploy en sí lo hace el CLI de Vercel (`vercel pull` / `vercel build` / `vercel deploy --prebuilt --prod`) autenticado con un token de proyecto — nadie necesita login en Vercel. Un tercer workflow (`rollback.yml`, `workflow_dispatch`) revierte a un deploy anterior con `vercel rollback` si algo sale mal.

**Tech Stack:** GitHub Actions (`workflow_run`, Environments con revisores requeridos, `actions/github-script`), Vercel CLI, Bash.

---

## Decisiones ya tomadas (no reabrir sin volver a preguntar)

1. **`master` es la única rama de producción**, ya confirmado con el usuario. `main` y `develop` quedan abandonadas, no se tocan en este plan.
2. **El deploy depende de que `CI` (Fase 1, `.github/workflows/ci.yml`) haya pasado.** `deploy.yml` no repite tipos/pruebas/build — los reusa vía `workflow_run`. Si `ci.yml` cambia de nombre (`name: CI`), hay que actualizar el `workflows: ["CI"]` de `deploy.yml`.
3. **Detección de migraciones = cualquier archivo tocado bajo `lib/db/migrations/` (menos `meta/`)** entre el último deploy exitoso y el commit actual. No se intenta automatizar la migración en sí — el repo no usa `drizzle-kit migrate` como mecanismo real (su `_journal.json` solo llega hasta la migración 0004 mientras hay 180 archivos `.sql`; las migraciones reales se corren a mano con `scripts/correr-migracion.ts`). Automatizar eso está fuera de alcance; el ticket pide explícitamente que sea manual.
4. **Gate de migración = GitHub Environment con revisores obligatorios**, no un mecanismo custom de "pausar y esperar". Es la primitiva nativa de Actions para esto — nada de polling ni de aprobar por comentario.
5. **Vercel deja de autodeployar `master`** vía un "Ignored Build Step" en su propio dashboard (configuración manual, Task 1). Los previews de PRs y otras ramas siguen igual — solo se apaga el auto-deploy de producción.
6. **Sin cambios a `package.json`/`pnpm-lock.yaml`.** El CLI de Vercel se instala global dentro del job (`npm install --global vercel@latest`), no como dependencia del proyecto.

---

## Configuración manual previa (bloquea todo lo demás)

Estos pasos no son código — los hace el usuario en GitHub y Vercel antes de que cualquier workflow pueda correr de verdad. Las tasks de código se pueden escribir y commitear sin esto, pero **no van a funcionar** hasta que esté hecho.

### Task 0: Environments, secrets y Vercel

- [ ] **Paso 1: Crear el token de Vercel**
  Vercel → Account Settings → Tokens → Create. Scope: el proyecto de Zero. Copiar el valor (no se vuelve a mostrar).

- [ ] **Paso 2: Conseguir Project ID y Org/Team ID**
  Vercel → el proyecto → Settings → General → `Project ID`. El Org/Team ID sale de Team Settings → General → `Team ID` (si el proyecto es de una cuenta personal, no de team, usar el `User ID` de Account Settings en su lugar).

- [ ] **Paso 3: Crear los GitHub Environments**
  Repo → Settings → Environments → New environment, dos veces:
  - `produccion` — sin protection rules (el deploy normal, sin migraciones, no debe frenar).
  - `produccion-con-migracion` — con **Required reviewers** activado, agregando a quien deba aprobar el deploy después de correr la migración a mano.

- [ ] **Paso 4: Cargar los secrets**
  En cada uno de los dos Environments (se repiten los mismos tres valores en ambos, GitHub no los comparte entre environments):
  - `VERCEL_TOKEN` — el del Paso 1.
  - `VERCEL_ORG_ID` — el del Paso 2.
  - `VERCEL_PROJECT_ID` — el del Paso 2.

- [ ] **Paso 5: Apagar el auto-deploy de Vercel para `master`**
  Vercel → el proyecto → Settings → Git → **Ignored Build Step** → pegar:
  ```bash
  if [ "$VERCEL_GIT_COMMIT_REF" == "master" ]; then
    echo "Producción se despliega vía GitHub Actions, no por Vercel. Build salteado."
    exit 0
  else
    echo "Build de preview, continúa normal."
    exit 1
  fi
  ```
  Guardar. Con esto, un push a `master` ya no dispara un deploy de Vercel por su cuenta — los previews de PRs y otras ramas no cambian (`exit 1` = seguir con el build normal).

- [ ] **Paso 6: Production Branch en Vercel**
  Settings → Git → Production Branch → `master` (si no estaba puesto ya desde la Fase 1).

---

## Task 1: Script de detección de migraciones

**Files:**
- Create: `scripts/ci/detectar-migraciones.sh`

- [ ] **Paso 1: Crear el script**

```bash
#!/usr/bin/env bash
# Compara dos commits y dice si hay archivos .sql tocados en lib/db/migrations
# entre ellos (se ignora lib/db/migrations/meta, que son snapshots internos de
# drizzle-kit, no migraciones reales).
#
# Uso:
#   scripts/ci/detectar-migraciones.sh <sha-base> <sha-head>
#   scripts/ci/detectar-migraciones.sh --contra-master   # HEAD vs origin/master, para correr en local antes de abrir un PR
#
# Salida: primera línea "hay-migraciones" o "sin-migraciones"; el resto, la
# lista de archivos si los hay. Exit code siempre 0 — esto informa, no falla.
set -euo pipefail

if [ "${1:-}" = "--contra-master" ]; then
  git fetch origin master --quiet
  BASE="origin/master"
  HEAD="HEAD"
else
  BASE="${1:?Falta el sha base. Uso: detectar-migraciones.sh <sha-base> <sha-head>}"
  HEAD="${2:?Falta el sha head. Uso: detectar-migraciones.sh <sha-base> <sha-head>}"
fi

ARCHIVOS=$(git diff --name-only "$BASE" "$HEAD" -- lib/db/migrations -- ':!lib/db/migrations/meta' || true)

if [ -z "$ARCHIVOS" ]; then
  echo "sin-migraciones"
  exit 0
fi

echo "hay-migraciones"
echo "$ARCHIVOS"
```

- [ ] **Paso 2: Hacerlo ejecutable**

Run: `chmod +x scripts/ci/detectar-migraciones.sh`

- [ ] **Paso 3: Probarlo contra un rango real sin migraciones**

Run: `scripts/ci/detectar-migraciones.sh HEAD~1 HEAD` (usa dos commits cualesquiera del historial actual que no toquen `lib/db/migrations`)
Expected: primera línea `sin-migraciones`, nada más.

- [ ] **Paso 4: Probarlo contra un rango que sí tiene migraciones**

Run: `scripts/ci/detectar-migraciones.sh HEAD~30 HEAD` (ajustar el rango a uno que abarque algún commit con `.sql` nuevo — se puede confirmar antes con `git log --oneline -- lib/db/migrations | head`)
Expected: primera línea `hay-migraciones`, seguida de al menos un path bajo `lib/db/migrations/*.sql`.

- [ ] **Paso 5: Commit**

```bash
git add scripts/ci/detectar-migraciones.sh
git commit -m "ci: script para detectar migraciones pendientes entre dos commits"
```

---

## Task 2: Workflow de deploy

**Files:**
- Create: `.github/workflows/deploy.yml`

Depende de que `.github/workflows/ci.yml` de la Fase 1 ya esté mergeado a `v2`/`master` con `name: CI` (así se llama hoy — si cambia, hay que actualizar el `workflows: ["CI"]` de abajo).

- [ ] **Paso 1: Crear el workflow**

```yaml
name: Deploy a producción

# Corre después de que "CI" termina en verde sobre master. Nunca dispara
# directo en push: así el deploy nunca sale de un commit que no pasó
# tipos/pruebas/build (ver .github/workflows/ci.yml).
#
# Flujo (ticket Trello "Configurar CI/CD Zero Emite"):
#   1. Busca el último deploy exitoso anterior (para comparar).
#   2. Si el rango trae cambios en lib/db/migrations/, el job `deploy` corre
#      bajo el Environment `produccion-con-migracion` (revisores obligatorios
#      configurados en GitHub) — alguien debe correr la migración a mano
#      primero (ver docs/deploy-zero.md) y recién ahí aprobar. Sin cambios de
#      DB, corre bajo `produccion`, sin revisores, automático.
#   3. El deploy lo hace GitHub Actions con el CLI de Vercel — nadie del
#      equipo necesita acceso a Vercel para publicar.
on:
  workflow_run:
    workflows: ["CI"]
    branches: [master]
    types: [completed]

permissions:
  contents: read
  actions: read

jobs:
  linaje:
    name: Buscar último deploy exitoso
    if: github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    outputs:
      base_sha: ${{ steps.buscar.outputs.base_sha }}
    steps:
      - name: Buscar el run exitoso anterior de este mismo workflow
        id: buscar
        uses: actions/github-script@v7
        with:
          script: |
            const runs = await github.rest.actions.listWorkflowRuns({
              owner: context.repo.owner,
              repo: context.repo.repo,
              workflow_id: 'deploy.yml',
              branch: 'master',
              status: 'success',
              per_page: 1,
            });
            const base = runs.data.workflow_runs[0]?.head_sha ?? '';
            core.setOutput('base_sha', base);
            console.log(base
              ? `Comparando contra el último deploy exitoso: ${base}`
              : 'No hay deploy exitoso previo registrado — se trata como si hubiera migraciones, por seguridad.');

  migraciones:
    name: Detectar migraciones pendientes
    needs: linaje
    runs-on: ubuntu-latest
    outputs:
      hay_migraciones: ${{ steps.detectar.outputs.hay_migraciones }}
      archivos: ${{ steps.detectar.outputs.archivos }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha }}
          fetch-depth: 0

      - name: Correr scripts/ci/detectar-migraciones.sh
        id: detectar
        run: |
          BASE="${{ needs.linaje.outputs.base_sha }}"
          HEAD="${{ github.event.workflow_run.head_sha }}"

          if [ -z "$BASE" ]; then
            echo "hay_migraciones=true" >> "$GITHUB_OUTPUT"
            {
              echo "archivos<<EOF_ARCHIVOS"
              echo "(primer deploy registrado — sin base para comparar, se fuerza la revisión)"
              echo "EOF_ARCHIVOS"
            } >> "$GITHUB_OUTPUT"
            exit 0
          fi

          RESULTADO=$(scripts/ci/detectar-migraciones.sh "$BASE" "$HEAD")
          ESTADO=$(echo "$RESULTADO" | head -1)
          ARCHIVOS=$(echo "$RESULTADO" | tail -n +2)

          if [ "$ESTADO" = "hay-migraciones" ]; then
            echo "hay_migraciones=true" >> "$GITHUB_OUTPUT"
          else
            echo "hay_migraciones=false" >> "$GITHUB_OUTPUT"
          fi
          {
            echo "archivos<<EOF_ARCHIVOS"
            echo "$ARCHIVOS"
            echo "EOF_ARCHIVOS"
          } >> "$GITHUB_OUTPUT"

  deploy:
    name: Deploy a Vercel
    needs: migraciones
    runs-on: ubuntu-latest
    environment: ${{ needs.migraciones.outputs.hay_migraciones == 'true' && 'produccion-con-migracion' || 'produccion' }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha }}

      - name: Avisar si este deploy trae migraciones
        if: needs.migraciones.outputs.hay_migraciones == 'true'
        run: |
          {
            echo "### ⚠️ Este deploy incluye cambios de base de datos"
            echo '```'
            echo "${{ needs.migraciones.outputs.archivos }}"
            echo '```'
            echo ""
            echo "Corrió bajo el Environment \`produccion-con-migracion\`, que pide aprobación manual."
            echo "Antes de aprobar: correr la migración a mano. Ver [docs/deploy-zero.md](../../docs/deploy-zero.md#migraciones-de-base-de-datos)."
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Instalar Vercel CLI
        run: npm install --global vercel@latest

      - name: Traer configuración de producción de Vercel
        run: vercel pull --yes --environment=production --token="${{ secrets.VERCEL_TOKEN }}"
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Build de producción
        run: vercel build --prod --token="${{ secrets.VERCEL_TOKEN }}"
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Deploy
        id: deploy
        run: |
          URL=$(vercel deploy --prebuilt --prod --token="${{ secrets.VERCEL_TOKEN }}")
          echo "url=$URL" >> "$GITHUB_OUTPUT"
          {
            echo "### ✅ Deploy publicado"
            echo "$URL"
          } >> "$GITHUB_STEP_SUMMARY"
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Si algo falló, cómo revertir
        if: failure()
        run: |
          {
            echo "### ❌ El deploy falló"
            echo "Si falló ANTES del paso Deploy, producción sigue en el deploy anterior — no hay nada que revertir."
            echo "Si falló DESPUÉS de que Deploy imprimió una URL, revertir con el workflow **Rollback a producción** (pestaña Actions → Rollback a producción → Run workflow), pasando esa URL o la del deploy bueno anterior."
            echo "Ver [docs/deploy-zero.md](../../docs/deploy-zero.md#si-algo-sale-mal)."
          } >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Paso 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: workflow de deploy a producción con gate manual de migraciones"
```

---

## Task 3: Workflow de rollback

**Files:**
- Create: `.github/workflows/rollback.yml`

- [ ] **Paso 1: Crear el workflow**

```yaml
name: Rollback a producción

# Manual, a propósito — un rollback no debería poder dispararse solo.
# Pide la URL de un deploy anterior bueno (la que imprimió el job "Deploy" de
# deploy.yml, visible en su Job Summary o en el dashboard de Vercel).
on:
  workflow_dispatch:
    inputs:
      deployment_url:
        description: 'URL del deploy bueno anterior, ej. https://zero-abc123.vercel.app'
        required: true

permissions:
  contents: read

jobs:
  rollback:
    name: Revertir
    runs-on: ubuntu-latest
    environment: produccion
    steps:
      - name: Instalar Vercel CLI
        run: npm install --global vercel@latest

      - name: Revertir al deploy indicado
        run: vercel rollback "${{ github.event.inputs.deployment_url }}" --token="${{ secrets.VERCEL_TOKEN }}" --yes
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

- [ ] **Paso 2: Commit**

```bash
git add .github/workflows/rollback.yml
git commit -m "ci: workflow manual de rollback a un deploy anterior"
```

---

## Task 4: Documentar el procedimiento

**Files:**
- Create: `docs/deploy-zero.md`
- Modify: `README.md` (agregar un link a la sección de deploy)

- [ ] **Paso 1: Escribir el runbook**

```markdown
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
```

- [ ] **Paso 2: Linkear desde el README**

Buscar la sección "When you're ready to deploy your SaaS application to
production" en `README.md` y agregar, justo después del encabezado de esa
sección:

```markdown
> **Zero/EmiteDO ya está en producción.** El procedimiento real de deploy
> (automático vía GitHub Actions al mergear a `master`, con gate manual para
> migraciones) está en [`docs/deploy-zero.md`](docs/deploy-zero.md). Lo que
> sigue en esta sección es la guía genérica del boilerplate original.
```

- [ ] **Paso 3: Commit**

```bash
git add docs/deploy-zero.md README.md
git commit -m "docs: runbook de deploy a producción (CI/CD Zero)"
```

---

## Task 5: Primer deploy de prueba

No hay forma de probar `workflow_run` + Environments en local — esta task es
la verificación real, en GitHub.

- [ ] **Paso 1: Confirmar que la Task 0 (configuración manual) está completa**
  Los dos Environments existen con sus tres secrets, y el Ignored Build Step
  de Vercel está guardado.

- [ ] **Paso 2: Abrir PR con las Tasks 1–4 contra `v2`**, mergear cuando `CI`
  pase. Esto todavía no dispara `Deploy` — `deploy.yml` solo escucha
  `workflow_run` sobre `master`, y este merge fue a `v2`.

- [ ] **Paso 3: Promover `v2` a `master`** (fuera de este plan si ya se hizo
  en la Fase 1; si no, PR de `v2` a `master`).

- [ ] **Paso 4: Verificar el run de `CI` sobre `master`** en la pestaña
  Actions — debe quedar verde.

- [ ] **Paso 5: Verificar que `Deploy` arrancó solo** después de que `CI`
  terminó (lista de workflows en Actions, buscar "Deploy a producción").
  Confirmar que el job `deploy` corrió bajo el Environment `produccion` (sin
  pedir aprobación, porque este merge no trae `.sql` nuevos) y que el Job
  Summary muestra la URL publicada.

- [ ] **Paso 6: Abrir esa URL** y confirmar que la app responde (misma
  verificación que ya se hacía a mano en Vercel, ahora disparada por Actions).

- [ ] **Paso 7: Probar el gate de migración**, en una rama de prueba: agregar
  un archivo vacío bajo `lib/db/migrations/9999_prueba_gate.sql` con un
  comentario SQL (`-- prueba del gate de CI/CD, no aplicar`), PR a `v2` →
  `master`. Confirmar que el job `deploy` de ese run queda **esperando
  aprobación** en el Environment `produccion-con-migracion`, con el archivo
  listado en el Job Summary. Rechazar el deployment (no aprobar) y borrar el
  archivo de prueba en un commit aparte — nunca dejar un `.sql` de prueba en
  `lib/db/migrations/`.

---

## Self-Review (spec coverage)

- "Todo cambio mergeado a `master` valida, hace build y deploy" → Tasks 2
  (`deploy.yml` encadenado a `CI` vía `workflow_run`).
- "El equipo no necesita acceso directo a Vercel" → Task 0 Paso 5 (apaga el
  auto-deploy nativo) + Task 2 (deploy vía CLI con token en Actions).
- "Revisar si hay migraciones antes de cada deploy" → Task 1 + Task 2 (job
  `migraciones`).
- "Si hay migraciones, correrlas a mano y luego continuar el deploy
  automático vía Actions" → Task 2 (`environment:` condicional con revisores)
  + Task 4 (pasos exactos del runbook).
- "Documentar el procedimiento, incluyendo validaciones, migraciones y qué
  hacer si falla" → Task 4 (`docs/deploy-zero.md`, tres secciones para cada
  cosa).
- "Variables de Vercel" (hoja de cálculo del ticket) → Task 0 Paso 4, los tres
  secrets. Si la hoja trae variables de entorno de la app además de las de
  autenticación del CLI, esas ya viven en Vercel y `vercel pull` las trae
  solas — no hace falta copiarlas a GitHub.
