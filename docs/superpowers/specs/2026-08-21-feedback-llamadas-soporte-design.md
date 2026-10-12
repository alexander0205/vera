# Feedback visual en llamadas de soporte + nav "Ayuda"

## Contexto

El feature de videollamada de soporte (`docs/superpowers/specs/2026-08-20-videollamada-soporte-design.md`) ya funciona de punta a punta: señalización, WebRTC, audio y pantalla compartida confirmados con pruebas reales. Lo que falta es la experiencia alrededor de las transiciones de estado — iniciar, contestar, colgar.

Hoy:
- El agente clickea "Llamar" y el botón no cambia hasta que vuelve la respuesta del `POST /api/zero-tickets/calls` (puede tardar). Sin feedback inmediato, el usuario duda y clickea de nuevo — el segundo click choca contra la llamada que ya se está creando (`409 Conflict`) y sale un `window.alert` nativo, feo y bloqueante.
- Lo mismo pasa del lado del cliente al aceptar/rechazar (`POST /api/zero-tickets/calls/[id]/answer`).
- El banner de invitación entrante (`InvitacionLlamada`) es un banner chico dentro del chat — fácil de no ver, sin ninguna animación que llame la atención.
- Si el widget flotante de soporte está minimizado, una llamada entrante es completamente invisible hasta que el cliente lo abre.
- Al colgar, el panel de llamada desaparece de golpe sin ninguna confirmación de que la llamada terminó.

## Objetivo

1. Feedback **instantáneo** (optimista, sin esperar al servidor) en cada acción de llamada — iniciar, aceptar, rechazar, colgar.
2. Eliminar los `window.alert` de este flujo — cualquier error real se muestra inline, no bloqueante.
3. Animaciones de estado (llamando / sonando / conectada / finalizada) **inline** dentro del chat — no overlay/modal de pantalla completa.
4. Indicador visual en el ícono del widget flotante minimizado cuando hay una llamada entrante.
5. Nuevo ítem de navegación "Ayuda" en el rail de Facturación, apuntando a `/dashboard/soporte`.

## Fuera de alcance

- Cambios al motor WebRTC (`lib/webrtc/conexion.ts`, `useLlamada.ts`) — ya está probado y funcionando, este trabajo es puramente de UI/UX alrededor de los estados existentes.
- Grabación de llamadas / AWS — spec separado, a brainstormear después.
- Sonido de timbre (ringtone) — no pedido, no se agrega.

## Diseño

### 1. Estado optimista — eliminar la ventana de doble click

**Lado agente** (`app/zero-tickets/page.tsx`, función `startCall`):
- Al clickear "Llamar", el botón pasa a estado "Llamando…" (deshabilitado) **de forma síncrona, antes de** await la respuesta del POST. Se logra con un estado local (`llamando: boolean`) que se pone en `true` en la primera línea del handler, no derivado de `call?.status`.
- Si el POST falla (network error, 409 porque ya había una llamada activa creada por otra pestaña/tab), se revierte `llamando` a `false` y se muestra el error en un `<span>` inline junto al botón (texto rojo chico, se desvanece a los ~4s), reemplazando el `window.alert` actual.
- Una vez que el poll trae `call.status === 'pendiente'` o `'activa'`, el estado optimista `llamando` se descarta (la fuente de verdad pasa a ser `call.status`).

**Lado cliente** (`components/support/invitacion-llamada.tsx` + quien lo use):
- Los botones "Aceptar"/"Rechazar" se deshabilitan en el click, antes de esperar el `POST /answer`. Mismo patrón: estado local `respondiendo: 'aceptando' | 'rechazando' | null`.
- Mientras `respondiendo` no es null, ambos botones quedan deshabilitados (no solo el que se clickeó) — evita que un click en el botón contrario mande dos respuestas en simultáneo.
- Si el POST devuelve 409 (la llamada ya fue respondida/expiró desde otra pestaña, o carrera con el timeout de 60s), se muestra el motivo real inline ("Esta llamada ya no está disponible") en vez de alert, y el banner se retira solo (el próximo poll trae `call: null` o `status: 'terminada'`).

### 2. Animaciones de estado inline

Reutiliza el mismo patrón visual de pulso que ya existe en `PanelLlamada` (círculo con `box-shadow` animado + ícono `Phone` de lucide-react), para consistencia.

- **Saliente** (agente, botón "Llamar" mientras `call?.status === 'pendiente'`): el botón muestra el ícono `PhoneCall` con la misma animación de pulso (más chica, 20px, para caber en la barra de acciones) + texto "Llamando…".
- **Entrante** (cliente, `InvitacionLlamada`): el ícono `Video` actual se reemplaza por el círculo pulsante (mismo componente reusado, tamaño intermedio), y el banner en sí gana un borde animado sutil (pulso de `border-color` o `box-shadow`, ya que es un banner ancho, no un círculo) para que sea imposible de no ver de reojo.
- **Contestada**: transición directa al `PanelLlamada` existente, sin paso intermedio — ya está sólido, no se toca.
- **Finalizada**: al colgar (por cualquiera de los dos lados, o por timeout), en vez de que el panel/banner desaparezca de golpe, se muestra por ~2.5s un mensaje inline "Llamada finalizada" (mismo lugar donde estaba el panel) con un fade-out simple, y recién ahí se retira del DOM.

Se extrae un componente chico compartido, `components/support/pulso-llamada.tsx`, que envuelve el círculo+ícono+animación parametrizado por tamaño e ícono — evita duplicar el CSS de la animación entre `PanelLlamada`, el botón "Llamar" y `InvitacionLlamada`.

### 3. Badge en el widget minimizado

`components/support/ticket-widget.tsx` ya recibe `chat.call` vía `useTicketChat`. Cuando el widget está en su estado "burbuja cerrada" (no expandido) y `chat.call?.status === 'pendiente'`, se agrega un punto animado (mismo pulso, chico, esquina superior del ícono flotante) — mismo dato que ya existe, solo falta el indicador cuando está minimizado. Al abrir el widget, se ve el banner de invitación normal (ya funciona).

### 4. Nav "Ayuda"

En `app/(dashboard)/dashboard/layout.tsx`, el array `ITEMS` (línea ~131) gana una entrada después de "Reportes":

```ts
{ id: 'ayuda', href: '/dashboard/soporte', icon: LifeBuoy, label: 'Ayuda' },
```

(`LifeBuoy` de `lucide-react`, agregado al import existente). Sin gating de permisos adicional — mismo criterio que Dashboard/Contactos/Reportes, visible para cualquiera con acceso al layout de Facturación.

## Testing

- Sin infraestructura de tests automatizados en este repo (confirmado en sesiones previas) — verificación manual: iniciar llamada y confirmar que el botón cambia en el mismo click (sin esperar red), aceptar/rechazar desde el cliente con el mismo criterio, forzar un 409 (doble click rápido) y confirmar que NO aparece `window.alert`, colgar y confirmar el mensaje de "Llamada finalizada" antes de que se retire, minimizar el widget con una llamada pendiente y confirmar el badge, y navegar a "Ayuda" desde el rail.
