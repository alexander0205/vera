# MCP de solo lectura para facturación (clientes, facturas, facturas recurrentes, cuentas por cobrar)

## Contexto

Un cliente (colegio u otro tenant) pidió conectar su propia AI (ChatGPT, potencialmente otras) a esta app vía MCP, para consultar — nunca modificar — datos de facturación: clientes, facturas, facturas recurrentes y cuentas por cobrar.

La app (EmiteDO) ya expone estos datos vía endpoints REST usados por su propio frontend (`/api/clientes`, `/api/facturas`, `/api/facturas-recurrentes`, `/api/cuentas-por-cobrar`), todos protegidos por sesión-cookie de Supabase. No existe ningún mecanismo de autenticación por API key en uso: la tabla `apiKeys` y sus endpoints de gestión (`/api/api-keys`) existen, pero ningún endpoint de negocio valida esa key hoy.

El alcance del módulo escolar (`adminEscolarCargos`, becas, matrículas) queda **fuera** de este trabajo — el cliente quiere el módulo general de facturación, que sirve por igual a cualquier tenant.

## Objetivo

Permitir que una AI externa, autenticada con una API key de solo lectura, consulte clientes/facturas/facturas recurrentes/cuentas por cobrar de un tenant específico vía protocolo MCP, sin tocar la base de datos directamente y sin poder escribir/modificar nada.

## Arquitectura

Tres piezas nuevas, todas dentro de esta misma app Next.js (mismo deploy, sin infraestructura nueva):

### 1. Guard de API key — `lib/auth/api-key-guard.ts`

Función `requireApiKey(request)`:
- Lee header `Authorization: Bearer emdo_xxx`.
- Extrae `keyPrefix`, busca fila en `apiKeys`.
- Compara `keyHash` con bcrypt.
- Rechaza si `revokedAt` no es null, o `expiresAt` ya pasó.
- Rechaza si `permisos` no incluye nivel de lectura (`read`, `write` o `full` — todos permiten leer; `write`/`full` no se usan en este alcance pero no se restringe su creación aquí).
- Actualiza `ultimoUsoAt` de forma asíncrona (no bloquea la respuesta).
- Devuelve `{ teamId }` en éxito; en fallo, lanza/retorna 401 con mensaje genérico (no revela si la key existe, está revocada o expiró — mismo mensaje en los tres casos).

### 2. REST de solo lectura — `app/api/mcp/v1/*`

Cada ruta llama `requireApiKey` primero y usa el `teamId` devuelto para escopar la consulta (nunca el `teamId` de una sesión de usuario). Reusan las mismas funciones de query ya existentes en `lib/db/queries.ts` que alimentan los endpoints actuales — no se duplica lógica de negocio, solo se envuelve con el guard nuevo. Solo se registran métodos GET; no hay POST/PUT/DELETE en este árbol de rutas.

| Ruta | Descripción |
|---|---|
| `GET /api/mcp/v1/clientes` | Lista clientes, filtro de búsqueda por nombre/rnc/email |
| `GET /api/mcp/v1/clientes/[id]` | Detalle de un cliente |
| `GET /api/mcp/v1/facturas` | Lista facturas, filtros: estado, desde/hasta, clientId |
| `GET /api/mcp/v1/facturas/[id]` | Detalle de una factura |
| `GET /api/mcp/v1/facturas-recurrentes` | Lista planes de facturación recurrente |
| `GET /api/mcp/v1/facturas-recurrentes/[id]` | Detalle de un plan recurrente |
| `GET /api/mcp/v1/cuentas-por-cobrar` | Lista de cuentas por cobrar con totales y aging, filtros clientId/vencidas |

### 3. Endpoint MCP — `app/api/mcp/route.ts`

Implementa el protocolo MCP usando `@modelcontextprotocol/sdk`, transporte HTTP+SSE ("streamable"), compatible con clientes remotos (ChatGPT vía conector personalizado, Claude, cualquier cliente MCP estándar). Mismo guard de API key en el handshake.

7 tools expuestas:
- `list_clients`, `get_client`
- `list_invoices`, `get_invoice`
- `list_recurring_invoices`, `get_recurring_invoice`
- `get_accounts_receivable`

**Restricción clave: cada tool hace `fetch()` HTTP a su endpoint hermano en `/api/mcp/v1/*`, reenviando el mismo Bearer key recibido — nunca consulta la base de datos directamente.** Esto es un requisito explícito del cliente, no solo preferencia de diseño.

## Flujo de una consulta

1. AI externa conecta a `https://<dominio>/api/mcp` con `Authorization: Bearer <key>`.
2. Guard valida key, resuelve `teamId`.
3. AI invoca una tool (ej. `list_invoices` con filtro `estado=PENDIENTE`).
4. La tool hace `fetch('https://<dominio>/api/mcp/v1/facturas?estado=PENDIENTE', { headers: { Authorization: 'Bearer <key>' } })`.
5. Esa ruta valida la key otra vez (independiente, sin confiar en el handshake previo), corre la query scoping por `teamId`, responde JSON.
6. La tool MCP devuelve el resultado al AI.

## Manejo de errores

- Key ausente, inválida, revocada o expirada → 401, mensaje genérico idéntico en los cuatro casos.
- Error de query/DB → 500 genérico al caller, detalle completo solo en log interno del servidor.
- Sin rate limiting en esta primera versión (fuera de alcance; se puede añadir después si se abusa).

## Fuera de alcance

- Escritura de cualquier tipo (crear/editar/anular facturas, clientes, pagos) — el key es solo lectura, no hay rutas de escritura bajo `/api/mcp/v1/*`.
- Datos específicos del módulo escolar (`adminEscolarCargos`, becas, matrículas, estudiantes).
- Rate limiting / cuotas de uso.
- Rotación automática de keys o UI nueva de gestión (ya existe `/api/api-keys` para generar/revocar).

## Testing

- Unitarias del guard: key válida, revocada, expirada, ausente, sin permiso de lectura.
- Por cada ruta `/api/mcp/v1/*`: request con key válida (200 + shape esperado), request sin key o key inválida (401), scoping correcto por `teamId` (una key de un tenant no ve datos de otro).
- Prueba manual de conexión end-to-end desde un cliente MCP real (Claude Desktop o conector de ChatGPT) contra el endpoint desplegado.
