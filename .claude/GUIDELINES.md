# Directivas de trabajo — Vera/EmiteDO

## Branches
- `main` → producción. NUNCA commit directo.
- `qa` → pre-producción, conectado a AWS RDS. NUNCA commit directo.
- `developer` → integración. NUNCA commit directo.
- `feature/nombre` → trabajo diario por tarea.
- `bugfix/nombre` → correcciones puntuales.

## Flujo obligatorio
feature/xxx → developer → qa → main
Cada transición requiere aprobación (PR/MR).

## Commits
Formato convencional:
  feat(scope): descripción
  fix(scope): descripción
  chore(scope): descripción
  docs(scope): descripción

## Reglas de IA (Claude)
- Nunca sugerir commit directo a main, qa o developer.
- Toda feature nueva → branch feature/nombre-descriptivo.
- Todo bug → branch bugfix/nombre-descriptivo.
- Push frecuente al branch de trabajo.
- No hacer merge a developer sin que la feature esté completa y probada localmente.
- Al generar código: respetar el stack (Next.js 15, React 19, TypeScript, Drizzle ORM).
- Al tocar rutas API: verificar que el teamId viene de la sesión, nunca del body.

## Ambientes
- DEV  → DATABASE_URL apunta a Docker local (puerto 54322)
- QA   → DATABASE_URL apunta a AWS RDS (credenciales de Alexander)

## Variables de entorno
Nunca commitear .env*, .env.development, .env.qa.