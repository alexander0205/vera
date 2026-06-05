# Modos de correr la app

3 comandos, 3 bases de datos. Cada uno carga un archivo `.env` distinto antes de
arrancar Next y muestra el host de la DB para que sepas dónde estás.

## Comandos

| Comando              | Modo Next       | Archivo de env | DB                                                          |
|----------------------|-----------------|----------------|-------------------------------------------------------------|
| `pnpm dev`           | dev (turbopack) | `.env`         | Docker local (`localhost:54322/emitedo`)                    |
| `pnpm corre:dev`     | dev (turbopack) | `.env.dev`     | **Neon develop** (twilight, unpooled)                       |
| `pnpm corre:prod`    | build + start   | `.env.prod`    | **Neon prod** (raspy-mud, pooler) — escrituras = datos reales |

Extras:

- `pnpm corre:dev:build` → build + start contra Neon develop (test del bundle de prod sin tocar datos reales).
- `pnpm dev:prod` / `pnpm start:prod` → aliases viejos de `corre:prod` (mismo efecto).

## Cuándo usar cada uno

- **`pnpm dev`** → trabajo local. Datos sandbox en tu Docker (no afecta a nadie).
  Requiere `docker compose up -d` antes para que el contenedor `emitedo_postgres`
  esté corriendo.
- **`pnpm corre:dev`** → ver la app contra los datos de develop (lo mismo que
  el preview de Vercel de la rama `developer`). Útil para reproducir bugs que se
  ven en develop pero no en local.
- **`pnpm corre:prod`** → ver la app exactamente como en producción, contra los
  datos reales. **Cuidado**: cualquier crear/editar/borrar/pago afecta a usuarios
  reales. Para verificar sin escribir, evita acciones de mutación.

## Vercel ↔ DB

| Branch     | Vercel deploy | DB              |
|------------|---------------|-----------------|
| `main`     | Production    | Neon raspy-mud  |
| `developer`| Preview       | Neon twilight   |

Push a `main` → auto-deploy prod. Push a `developer` → auto-deploy preview.
Ambos se configuran en Vercel con env vars por scope (Production / Preview branch).

## Archivos `.env*`

- `.env`           → Docker local (default `pnpm dev`).
- `.env.dev`       → Neon develop (twilight). Usado por `corre:dev`.
- `.env.prod`      → Neon prod (raspy-mud). Usado por `corre:prod`.
- `.env.example`   → plantilla pública.
- `.env.prod.example` → plantilla pública específica para prod.

Todos los `.env*` con secretos están en `.gitignore`. No los commitees.

## Notas Neon

- **Develop (twilight) usa endpoint unpooled** (sin `-pooler` en el host). Razón:
  Neon pooler rechaza el parámetro `options=search_path` y la role `neondb_owner`
  necesita `search_path = public` para que las queries sin prefijo funcionen.
  En unpooled aplicamos el search_path vía `ALTER ROLE` una vez.
- **Prod (raspy-mud) usa pooler** porque el volumen lo amerita; el search_path
  ya está configurado en su role.

Si develop crece, mover a pooler y resolver el search_path en código (qualified
`public.tabla` o `SET search_path` por sesión).
