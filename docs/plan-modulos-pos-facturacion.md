# Plan de trabajo — Módulos POS + Facturación (Zero)

> Objetivo: separar el sistema en dos módulos comercializables — **Facturación** (`facturacion.zero.com.do`) y **Punto de Venta** (`pos.zero.com.do`) — bajo una misma empresa (team), con acceso por usuario, switch entre módulos, POS auto-provisionado (almacén/terminal default), y ocultamiento total de e-CF (E31/E32) cuando la empresa no tiene DGII conectado vía ecf-api.

---

## 1. Estado actual (hallazgos del análisis)

### Lo que YA existe y se reutiliza
| Pieza | Dónde | Nota |
|---|---|---|
| Toggle POS por empresa | `teams.posHabilitado`, `cajaHabilitada`, `posEscolarHabilitado` (`lib/db/schema.ts:121-127`) | Base del concepto "módulo"; hoy lo activa el admin global |
| Multi-empresa por usuario | `team_members` N:N + `activeTeamId` en JWT (`lib/auth/session.ts:59`, `lib/db/queries.ts:151`) | Cambio de empresa activa ya funciona |
| Roles granulares por empresa | `team_roles` + `team_role_permissions` + catálogo `lib/config/roles.ts` (~30 permisos `recurso:accion`) | `userCanForTeam` centralizado (`lib/auth/permissions.ts`) |
| Guards de página y API | `lib/auth/page-guard.ts`, `lib/auth/api-guard.ts` | Patrón establecido |
| POS funcional | `app/pos/_pos-client.tsx` (2398 líneas) | Emite e-CF real vía `POST /api/ecf/emitir`; carrito, cobro split, monedero escolar, modo restaurante |
| Cadena almacén→terminal→turno | `pos_terminales.almacenId` NOT NULL; turno POS exige terminal (`app/api/pos/turno/route.ts:35`) | Hoy **bloquea** si faltan; hay que auto-provisionar |
| Crear producto desde POS | `NuevoProductoModal` (`_pos-client.tsx:2320`) → `POST /api/productos` | Form mínimo propio, NO comparte el form completo de productos |
| Crear cliente desde POS | `NuevoClienteModal` (`_pos-client.tsx:1439`) → `POST /api/clientes` | Modal propio del POS, misma API/tabla que facturación |
| Venta sin DGII | `tipoEcf='sin-ncf'` end-to-end (emisión, POS, PDFs, mora) | La ruta no-fiscal ya existe completa |
| Billing Stripe + planes | `lib/config/plans.ts`, `lib/payments/stripe.ts` | Enforcement real: docs/mes, usuarios, features en sidebar |
| Tests e2e | Playwright: `tests/auth.test.ts`, `habilitacion-dgii.test.ts`, `dashboard.test.ts` | Base para ampliar |

### Gaps (lo que hay que construir/arreglar)
1. **Single-domain.** Cero lógica de hostname en `proxy.ts` / `next.config.ts` / `vercel.json`. La cookie de sesión no tiene `domain` compartido.
2. **No hay gate DGII central.** Tipos `31`/`32`/`sin-ncf` SIEMPRE visibles (`lib/hooks/useTiposDisponibles.ts:20`). Sin función `puedeEmitirDgii()`. El fallo llega tarde (422 en `ensureContribuyente` o "sin secuencias").
3. **Bug:** `teams.habilitacionCompletadoAt` **nunca se escribe** — el wizard solo guarda `habilitacionState.finalizado.acknowledged` (JSON). `GET /api/habilitacion/state` reporta `completado:false` siempre.
4. **POS bloquea sin prerequisitos**: sin terminal → pantalla "pide a un administrador" (`_pos-client.tsx:225`); sin almacén → no se puede crear terminal (`lib/pos/terminales.ts:69`).
5. **Modales duplicados**: producto y cliente del POS son forms propios mínimos, no los compartidos.
6. **Deuda de roles**: RBAC legacy (`lib/auth/rbac.ts`) convive con el granular; 2 caminos de invitación (endpoint nuevo vs `inviteTeamMember` legacy en `actions.ts:455`); checks ad-hoc de role string en invitaciones/miembros.
7. **Proxy solo cubre `/dashboard`** — `/pos`, `/admin`, `/api/*` dependen de guards por archivo (funciona, pero el routing por host va a necesitar el proxy sí o sí).

### Patrones de Alegra POS a adoptar (capturas analizadas)
- Switcher de módulo ("Ir a Alegra Contabilidad" → nuestro POS ↔ Facturación).
- Configuración por cards: Negocio / Sucursal / Detalles en ventas / Facturas / Cuenta (roles y usuarios) / Dispositivos.
- Pantalla de venta: crear producto inline, venta simple, búsqueda + escáner, **multi-carrito** (tabs "Venta principal / Venta 2 / Venta 1").
- Cobro: montos rápidos (exacto / redondeos), multi-método (filas método+valor+banco, "Agregar método"), vendedor, observaciones.
- Devoluciones: modal 2 tipos — devolución de dinero vs crédito a factura (nota de crédito).

---

## 2. Decisiones de arquitectura

1. **Una sola app Next.js** con routing por hostname en `proxy.ts` — NO split de repos/deploys.
   - Comparten DB, schema, `/api/*`, modales, sesión. Vercel soporta N dominios → 1 proyecto.
   - `pos.zero.com.do` → rewrite interno a `/pos/*`; `facturacion.zero.com.do` → `/dashboard/*`.
2. **Módulos = columna `teams.modulosHabilitados`** (jsonb, ej. `["facturacion","pos"]`), migrando el actual `posHabilitado`. Los "planes" (billing) quedan para después; los módulos son el enforcement.
3. **Acceso por usuario = permisos existentes** + 2 nuevos en el catálogo: `modulo:pos` y `modulo:facturacion`. El owner los asigna por rol desde Roles y usuarios (ya existe la UI de roles). Acceso efectivo = módulo activo en la empresa ∩ permiso del usuario.
4. **Gate DGII central**: `lib/ecf/readiness.ts` con una sola fuente de verdad; UI y API la consumen.
5. **SSO entre subdominios**: cookie `session` con `domain: .zero.com.do` en prod.

---

## 3. Fases

### Fase 0 — Núcleo de módulos (fundación) 🔴 bloqueante para todo
- [ ] Migración: `teams.modulosHabilitados jsonb NOT NULL DEFAULT '["facturacion"]'`; backfill `posHabilitado=true` → añade `"pos"`. Mantener `posHabilitado` como columna legacy leída solo por código viejo hasta Fase 5.
- [ ] `lib/auth/modules.ts`:
  - `teamHasModule(team, 'pos'|'facturacion')`
  - `getUserModules(userId, teamId)` → módulos del team ∩ permisos (`modulo:pos`, `modulo:facturacion`) del rol del usuario.
  - `requireModule(mod)` para page-guard y api-guard.
- [ ] Catálogo: agregar `modulo:pos` y `modulo:facturacion` a `PERMISSION_CATALOG` + seeds de roles de sistema (owner/admin todos; user/lector según defina el owner). Script de backfill para `team_role_permissions` existentes.
- [ ] `GET /api/user`: devolver `modules: string[]`.
- [ ] `components/module-switcher.tsx` (header, estilo "Ir a…" de Alegra): lista módulos accesibles, link cross-subdominio vía helper `moduleUrl('pos'|'facturacion')`.
- [ ] Admin global (`app/admin/empresas/[id]`): editor de módulos de la empresa (reemplaza toggle suelto de caja/pos).

**Pruebas F0**: unit de `getUserModules` (matriz team×permiso), seed/backfill idempotente, api-guard rechaza sin módulo.

### Fase 1 — Subdominios y SSO
- [ ] `proxy.ts`: routing por `host`:
  - `pos.zero.com.do/*` → rewrite `/pos/*` (y `/pos` como home). Rutas de login servidas en ambos hosts.
  - `facturacion.zero.com.do/*` → `/dashboard/*`.
  - Host desconocido/base → comportamiento actual.
  - Extender matcher del proxy para cubrir `/pos` (hoy solo `/dashboard`).
- [ ] `lib/auth/session.ts`: cookie con `domain: '.zero.com.do'` en prod (env `SESSION_COOKIE_DOMAIN`); sin domain en dev. ⚠️ invalida sesiones activas una vez al deployar — avisar.
- [ ] Post-login redirect según host + módulos del usuario (si entra por pos.* sin módulo pos → pantalla "Sin acceso" con switcher).
- [ ] Helper `moduleUrl()` con envs `NEXT_PUBLIC_POS_URL` / `NEXT_PUBLIC_FACTURACION_URL`; fallback paths locales (`/pos`, `/dashboard`) en dev.
- [ ] Dev local: soportar `pos.localhost:3000` / `facturacion.localhost:3000` (host check tolerante a puerto).
- [ ] Vercel: agregar ambos dominios al proyecto (manual, documentar en README).

**Pruebas F1**: Playwright con header Host emulado — rewrite correcto, SSO (login en facturacion.* y navegar a pos.* sin re-login), sin-módulo → pantalla de acceso.

### Fase 2 — POS auto-provisioning (quitar fricción)
- [ ] `lib/pos/provision.ts` → `ensurePosDefaults(teamId)`, idempotente y transaccional:
  1. Sin almacén → crea "Almacén principal" con `esDefault=true`.
  2. Sin terminal activa → crea "Caja principal" (`almacenId`=default, `tipoEcf='sin-ncf'`, activa).
  - Advisory lock / unique parcial para evitar duplicados por concurrencia.
- [ ] Llamar en `app/pos/page.tsx` (server) antes de render. Eliminar pantalla "No hay terminales configuradas" (`_pos-client.tsx:225-235`) — con 1 terminal, autoseleccionar y pedir solo fondo inicial.
- [ ] Mantener validaciones de creación manual (`lib/pos/terminales.ts`) intactas.

**Pruebas F2**: unit de idempotencia/concurrencia; e2e: usuario nuevo con módulo pos → `/pos` abre turno directo y vende ticket.

### Fase 3 — Gate DGII (ocultar e-CF sin conexión)
- [ ] `lib/ecf/readiness.ts` → `getDgiiReadiness(teamId)`:
  - MVP síncrono-DB: `ready = team.ecfCodigoPublico != null && existe secuencia activa tipo 31|32 && team.rnc != null`.
  - Enriquecido (cacheado, TTL ~10min): `dgiiStatus.get(codigoPublico)` de ecf-api → `certificado.vigente && dgiiToken.cached`. No llamar ecf-api por render.
- [ ] `lib/hooks/useTiposDisponibles.ts`: si `!ready` → solo `sin-ncf` (adiós "31/32 siempre visibles"). Aplica a facturas nuevas, recurrentes y POS.
- [ ] POS: selector de comprobante (`_pos-client.tsx:1151`) y `terminal.tipoEcf` forzados a `sin-ncf` si `!ready`.
- [ ] **Server-side enforcement**: `POST /api/ecf/emitir` modo `emitir` con tipo fiscal y `!ready` → 422 con mensaje accionable ("Conecta tu empresa a DGII en Habilitación"). Defensa en profundidad, no solo UI.
- [ ] **Fix bug**: escribir `teams.habilitacionCompletadoAt` cuando el PUT de state llega con `finalizado.acknowledged=true` (`app/api/habilitacion/state/route.ts`).
- [ ] Banner/CTA en facturación y POS cuando `!ready`: "Estás emitiendo sin comprobante fiscal — conecta DGII".

**Pruebas F3**: unit de readiness (matriz de señales); API: emitir 31 sin readiness → 422; e2e: empresa sin DGII no ve E31/E32 en ningún selector; al activar (código+secuencia) aparecen.

### Fase 4 — Modales compartidos (una sola fuente)
- [ ] `components/shared/producto-dialog.tsx`: extraído del form completo de productos; modo "rápido" (nombre+precio+ITBIS, colapsado) y "completo" (expandible). Reemplaza `NuevoProductoModal` del POS y el alta en `dashboard/productos`. Soporta `tipo: 'bien'|'servicio'` → cumple "registrar servicio en POS = mismo modal de servicios".
- [ ] `components/shared/cliente-dialog.tsx`: con `RncSearch` integrado; reemplaza `NuevoClienteModal` del POS y el modal de facturación.
- [ ] POS "Nuevo producto": mantener acceso 1-click desde pantalla de venta (patrón Alegra captura 3).

**Pruebas F4**: e2e crear producto y cliente desde POS y desde facturación → mismos datos en ambos módulos.

### Fase 5 — Administración del negocio (self-service del owner) + billing por módulo
- [ ] Página de configuración por cards (estilo Alegra captura 2): **Negocio** (perfil fiscal) / **Módulos** (activar/desactivar self-service, ver abajo) / **Usuarios y roles** (equipo + team_roles existentes) / **Facturación** (numeraciones, impuestos, plantilla) / **POS** (terminales, almacenes, métodos-obligan-DGII) / **Suscripción** (Stripe portal existente).
- [ ] **Billing por módulo (self-service)** — decisión del user 2026-07-14:
  - Mapear cada módulo a un producto/price de Stripe (`facturacion`, `pos`); la suscripción del team puede tener 1..N items.
  - Card "Módulos": owner activa módulo → `createCheckoutSession` (o `subscriptionItems.create` si ya hay sub) → webhook `handleSubscriptionChange` actualiza `teams.modulosHabilitados` desde los items de la suscripción. Desactivar → remove item (fin de ciclo) → webhook quita el módulo.
  - `modulosHabilitados` pasa a ser **derivado de Stripe** en prod; admin plataforma conserva override manual (comps/demos) vía campo `modulosOverride`.
  - Estados de gracia: `past_due` → banner de aviso, no corte inmediato; `canceled` → módulo se apaga al fin de período.
  - Reusar patrón existente de `lib/payments/stripe.ts` + `app/api/stripe/webhook`.
- [ ] Limpieza de deuda:
  - Eliminar `inviteTeamMember` legacy (`app/(login)/actions.ts:455-525`) — un solo camino de invitación.
  - Eliminar/deprecar `lib/auth/rbac.ts` (RBAC jerárquico legacy); migrar los checks ad-hoc de role-string (invitaciones, miembros, admin layout) a `userCanForTeam`.
  - Retirar columna `posHabilitado` (código ya lee `modulosHabilitados`).
- [ ] Invitación con selección de módulos: al invitar, elegir rol (que implica módulos vía permisos).

**Pruebas F5**: e2e owner invita usuario con rol solo-POS → ese usuario ve solo pos.zero.com.do, sin sidebar de facturación; regresión de invitaciones.

### Fase 6 — POS UX nivel Alegra
- [ ] **Multi-carrito**: tabs de ventas en paralelo ("Venta principal", "Venta 2"…) con estado persistido por turno (localStorage + rehidratación).
- [ ] **Montos rápidos** en cobro efectivo: exacto / redondeo a 100 / a 1000 (captura 4).
- [ ] **Venta simple** (monto libre sin producto) si no existe ya.
- ~~Devoluciones~~ → **fase posterior** (decisión user 2026-07-14). Diseño queda documentado: modal 2 vías — (a) devolución de dinero → `caja_movimientos` SALIDA + doc; (b) crédito a factura → nota de crédito E34 (DGII ready) o interna.
- [ ] Escáner código de barras (listener de input rápido + campo búsqueda).

**Pruebas F6**: e2e multi-carrito (2 ventas en paralelo, cobrar una, la otra persiste), devolución de dinero cuadra caja, nota crédito referencia factura origen.

### Fase 7 — Cierre de calidad
- [ ] Agregar **vitest** para unit (hoy solo Playwright): `modules.ts`, `readiness.ts`, `provision.ts`, permisos.
- [ ] Suite Playwright ampliada corriendo contra DB seed local (`db:local:setup` existente).
- [ ] Smoke e2e completo: signup → empresa nueva → POS auto-provisionado → venta ticket → activar DGII (mock ecf-api) → aparecen E31/E32 → factura fiscal → switch a facturación → misma data.
- [ ] CI en PR: `next build` + vitest + Playwright.

---

## 4. Orden y dependencias

```
F0 (módulos core)
├── F1 (subdominios)          — paralelo con F2/F3/F4
├── F2 (auto-provisioning)    ┐
├── F3 (gate DGII)            ├─ independientes entre sí
└── F4 (modales compartidos)  ┘
F5 (admin negocio)  ← requiere F0
F6 (POS UX)         ← requiere F2 + F4
F7 (calidad)        ← transversal; cada fase entrega sus pruebas, F7 integra
```

## 5. Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Cambio de cookie domain desloguea a todos una vez | Deploy anunciado; el JWT expira en 1 día igualmente |
| Llamadas a ecf-api en readiness degradan render | Cache TTL en DB/memoria; MVP usa solo señales locales |
| `main` sigue moviéndose (routine diaria de merge) | Trabajar por fases pequeñas mergeables; la routine ya adapta a MUI |
| Migración `modulosHabilitados` con teams existentes | Backfill en la misma migración; código lee ambos hasta F5 |
| Multi-carrito + turno: estado inconsistente | Persistir por `turnoId`; limpiar al cerrar turno |

## 6. Decisiones tomadas (2026-07-14)
1. **Dominio**: `pos.zero.com.do` + `facturacion.zero.com.do`.
2. **Activación de módulos**: **self-service con billing Stripe desde el inicio** (ver F5); admin plataforma mantiene override manual.
3. **Devoluciones**: fase posterior, fuera del MVP.
4. **Login**: en cada subdominio, SSO por cookie `.zero.com.do`.
