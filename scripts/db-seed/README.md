# scripts/db-seed — Bootstrap de base de datos local (devs)

Arranca EmiteDO en local con datos reales + login de prueba, sin tocar prod.

## Quickstart (dev nuevo)

```bash
git checkout developer
pnpm install

# Coloca el dump seed (te lo pasa el lead — NO está en git por PII):
#   scripts/db-seed/emitedo-local-seed.dump

pnpm db:local:setup    # Docker postgres + restaura seed + setea login de prueba
pnpm dev               # app local (usa .env → localhost:54322, NO toca prod)
```

Abre http://localhost:3000

## Login de prueba

Tras `pnpm db:local:setup`, **todos los usuarios locales** quedan con el mismo password:

| Email | Password |
|---|---|
| (el owner que imprime el script al final) | `Dev1234!` |

Cualquier email de la tabla `users` sirve con ese mismo password (solo en LOCAL).

## ¿Por qué los .dump no están en git?

Contienen PII (RNC/nombre/email de clientes) + hashes de usuarios. `.gitignore`
excluye `scripts/db-seed/*.dump`. Obtén el dump del lead (Alexander) o del Drive
compartido. **Canales seguros únicamente.**

## Qué contiene el seed actual

`pg_dump -Fc` de producción (schema completo: migraciones 0027-0032 + data real
actual). ~16 MB. El script imprime los counts (facturas/clientes/productos/users)
al restaurar.

## Cómo usar

```bash
pnpm db:local:setup     # idempotente — re-córrelo para resetear la DB local
```

El script:
1. Verifica Docker.
2. Levanta `emitedo_postgres` (puerto host 54322) y espera healthy.
3. Restaura el dump (`--clean` → idempotente).
4. Setea el password `Dev1234!` en todos los usuarios (solo LOCAL).
5. Imprime counts + login de prueba.

## Resetear desde cero

```bash
docker compose down -v && pnpm db:local:setup
```

## Crear/actualizar el seed (solo el lead)

```bash
# Dump fresco de prod (Neon) — requiere .env.prod con POSTGRES_URL
docker exec -e PGCONNECT_TIMEOUT=20 emitedo_postgres pg_dump "$POSTGRES_URL_PROD" -Fc \
  > scripts/db-seed/emitedo-local-seed.dump
# Distribuir por canal seguro (Drive). NO commitear.
```

## Correr contra prod (solo si lo necesitas)

```bash
pnpm dev:prod    # requiere .env.prod — usa Neon, NO local
```
