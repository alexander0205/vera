# scripts/db-seed — Dumps de base de datos local

Este directorio contiene los dumps de Postgres para bootstrap local.

## ¿Por qué los .dump no están en git?

Los archivos `.dump` **nunca se commitean** porque contienen:
- Datos reales de clientes (RNC, nombre, email) — PII bajo LGPD/normativas DR
- Hashes de passwords de usuarios de demo
- Datos confidenciales del negocio

`.gitignore` ya está configurado para excluir `*.dump` de este directorio.

## Cómo obtener el dump

Pídelo al lead del proyecto (Alexander) o descárgalo desde el Drive compartido del equipo EmiteDO. El archivo se llama `emitedo-local-seed.dump` y debe colocarse en este directorio.

**Canales seguros únicamente** — no compartir por email sin cifrar ni repositorios públicos.

## Qué contiene el dump actual (`emitedo-local-seed.dump`)

| Tabla   | Registros | Notas                            |
|---------|-----------|----------------------------------|
| teams   | 7         | Equipos de demo/QA               |
| users   | 7         | Un usuario por equipo             |
| clients | 87        | Clientes de prueba con datos reales ficcionalizados |
| facturas| 0         | Slate limpio para demos          |
| products| 0         | Slate limpio para demos          |

- Formato: pg_dump custom (`-Fc`), generado con Postgres 17
- Tamaño: ~16 MB

## Cómo usar

```bash
# Prerequisito: Docker Desktop corriendo

pnpm db:local:setup
```

El script hace todo automáticamente:
1. Levanta el container `emitedo_postgres` (puerto `54322`)
2. Espera a que esté healthy
3. Restaura el dump (es idempotente — puede correrse N veces)
4. Verifica los counts y muestra un resumen

## Resetear la DB desde cero

```bash
# Borra el volume y vuelve a levantar limpio
docker compose down -v
pnpm db:local:setup
```

## Cómo crear un nuevo dump (solo el lead)

```bash
# Desde el host, contra el container local
docker exec emitedo_postgres \
  pg_dump -U postgres -d emitedo -Fc -f /tmp/nuevo-seed.dump

docker cp emitedo_postgres:/tmp/nuevo-seed.dump scripts/db-seed/emitedo-local-seed.dump
```

Distribuir el nuevo dump por canal seguro antes de actualizar la versión en el Drive.
