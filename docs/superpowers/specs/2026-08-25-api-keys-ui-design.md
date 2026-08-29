# UI de gestión de API Keys

## Contexto

El backend de API keys ya existe (`app/api/api-keys/route.ts` GET/POST, `app/api/api-keys/[id]/route.ts` DELETE) — se usó para generar la key de prueba del feature MCP de solo lectura (`docs/superpowers/specs/2026-08-25-mcp-read-only-facturacion-design.md`), pero no hay ninguna página que lo consuma. Hoy la única forma de crear una key es un `fetch()` manual desde la consola del navegador, logueado.

## Objetivo

Página en Configuración donde el usuario pueda ver sus API keys activas, crear una nueva (con nombre, permiso fijo en `read`), ver el valor crudo (`rawKey`) una sola vez al crearla, y revocar keys existentes.

## Alcance

- Crear, listar, revocar. Sin editar.
- Sin selector de permisos en el form — todas las keys creadas desde esta UI son `read`. El backend sigue soportando `write`/`admin` (usado por otros callers si hace falta), simplemente esta pantalla no los expone todavía.
- Sin fecha de expiración configurable — `expiresAt` queda `null` al crear desde la UI.
- Sin tests automatizados — no hay precedente de tests para páginas de settings equivalentes (`Equipo`, `Mi empresa`) en este repo; se verifica manualmente contra el dev server.

## Arquitectura

**Página nueva:** `app/(dashboard)/dashboard/configuracion/api-keys/page.tsx` — client component, autocontenido (sin subcomponentes nuevos), siguiendo el tamaño y estilo de `EquipoCard.tsx` como referencia (~150-200 líneas). Usa `@/components/ui/*` (`table`, `dialog`, `button`, `input`, `label`) — la convención más reciente del repo para páginas de settings nuevas, no MUI directo.

**Guardia de acceso:** mismo patrón que las demás sub-páginas de Configuración — permiso `configuracion:gestionar`, verificado vía `requirePermission` en la propia página (como hace `POST /api/api-keys` hoy) más la entrada correspondiente en `HREF_PERMISSION` dentro de `app/(dashboard)/dashboard/layout.tsx`.

**Navegación:** nueva entrada "API Keys" en el grupo "Configuración" del sidebar (`app/(dashboard)/dashboard/layout.tsx`), junto a "Mi empresa", "Maestros", etc.

## Flujo de datos

1. **Carga inicial:** `GET /api/api-keys` al montar → lista de keys (`id`, `nombre`, `keyPrefix`, `permisos`, `ultimoUsoAt`, `expiresAt`, `revokedAt`, `createdAt`). El endpoint ya filtra `revokedAt IS NULL`, así que la lista solo trae keys activas.
2. **Crear:** botón "Crear key" abre un `Dialog` con un solo campo (nombre). Al enviar: `POST /api/api-keys` con `{ nombre, permisos: 'read' }`. Si responde 201, el mismo dialog cambia de vista (no se cierra) y muestra el `rawKey` devuelto en una caja monospace + botón copiar + aviso de que no se vuelve a mostrar — mismo patrón visual que la caja de secreto en `app/(dashboard)/dashboard/security/page.tsx`. Un botón "Listo" cierra el dialog y refresca la lista (nuevo `GET`).
3. **Revocar:** botón por fila → confirmación simple (ej. cambia a "¿Confirmar?" por unos segundos, o `window.confirm`) → `DELETE /api/api-keys/[id]`. Si responde OK, se quita la fila del estado local (no hace falta re-fetch completo).

## Manejo de errores

Fetch fallido o respuesta 4xx/5xx en cualquiera de las tres acciones → mensaje de error simple (componente `Alert` o equivalente) visible en el dialog (para crear) o arriba de la tabla (para listar/revocar). Mismo patrón que usa `EquipoCard.tsx` para su form de invitación.

## Testing

Verificación manual contra el dev server: login real, crear key, confirmar que el `rawKey` se muestra una sola vez y se puede copiar, refrescar la página y confirmar que ya no aparece el `rawKey` (solo el prefix), revocar la key y confirmar que desaparece de la lista, y confirmar (via Network tab o similar) que un usuario sin el permiso `configuracion:gestionar` no puede ver la página.
