# Grabación de llamadas de soporte

## Contexto

El feature de videollamada de soporte (`docs/superpowers/specs/2026-08-20-videollamada-soporte-design.md`) ya funciona de punta a punta — audio, pantalla compartida, feedback de estado (`docs/superpowers/specs/2026-08-21-feedback-llamadas-soporte-design.md`). Falta poder guardar esas llamadas para revisarlas después.

## Objetivo

Grabar automáticamente cada llamada y guardarla en AWS S3, con acceso restringido a agentes/personal autorizado.

## Decisión de diseño clave: sin mezcla en vivo

La arquitectura de la llamada es P2P (WebRTC directo entre navegadores, sin servidor de media) — grabar un archivo único con el audio combinado de ambos lados requeriría mezclar streams con Web Audio API en tiempo real, y manejar en vivo casos como "la pantalla compartida empieza a mitad de llamada" o "un lado corta la pestaña" sin perder sincronía. Es la clase de superficie donde este proyecto ya se pasó horas debuggeando comportamiento de navegador (ver la saga de `docs/superpowers/specs/2026-08-21-feedback-llamadas-soporte-design.md`).

**En vez de eso:** cada lado graba y sube **su propio** mic + su propia pantalla compartida (si aplica), como un archivo independiente. Dos archivos por llamada (uno por participante) en vez de uno combinado. Sin Web Audio API, sin mezcla, un solo `MediaRecorder` por lado. Si más adelante hace falta un archivo unificado, se arma server-side después con las dos piezas ya guardadas — no bloquea este trabajo.

## Diseño

### 1. Grabación (cliente)

- Cuando `estado === 'activa'` (la llamada conecta), cada lado arranca su propio `MediaRecorder` sobre un `MediaStream` local con: el track de mic (siempre) + el track de pantalla compartida cuando esté activo.
- Para no reiniciar el recorder si empieza a compartir pantalla a mitad de llamada, el stream que se graba se arma desde el inicio como `[track de mic]`, y si después aparece pantalla compartida, se agrega ese track al mismo `MediaStream` vía `addTrack()` (mismo patrón ya usado en `ConexionLlamada.streamRemoto` para el stream remoto) — `MediaRecorder` sigue grabando el mismo stream, ahora con más contenido, sin cortes.
- Al colgar (cualquiera de los dos lados) o en la limpieza de `useLlamada` (`limpiar()`), se llama `.stop()` sobre el `MediaRecorder`; su evento `onstop` arma el `Blob` final (`video/webm`) y dispara la subida.
- Vive en un módulo nuevo, `lib/webrtc/grabacionLlamada.ts` — no en `ConexionLlamada` (que es puramente de conexión) ni en `useLlamada` directamente (para no inflar ese hook, ya bastante cargado); `useLlamada` lo orquesta llamándolo en los mismos puntos donde ya maneja el ciclo de vida de la llamada.

### 2. Aviso de grabación

- Un banner chico, no bloqueante, en `PanelLlamada`, visible apenas arranca la grabación (mismo momento que `estado === 'activa'`): "Esta llamada se está grabando". Mismo lenguaje visual liviano que el resto de los avisos del panel (no un modal, no requiere click para continuar).

### 3. Subida y storage

- Nuevo endpoint `POST /api/zero-tickets/calls/[id]/grabacion` — recibe el blob (`multipart/form-data` o body binario con el `role` como query param), sube a S3 reusando el patrón ya establecido en `lib/storage/tickets.ts` (mismo bucket, prefix propio `grabaciones/`), guarda la referencia.
- Tabla nueva `ticket_call_recordings`:
  ```
  id              serial primary key
  callId          integer references ticket_calls(id) on delete cascade
  role            varchar(10)   -- 'user' | 'agent', quién generó ESTE archivo
  s3Key           varchar(500)
  duracionSegundos integer
  createdAt       timestamp default now()
  ```
- Sin política de borrado automático — se guardan indefinidamente, mismo criterio que el resto de los archivos adjuntos de este feature. Retención se puede agregar después si hace falta (no se construye ahora, no está pedido).

### 4. Reproducción

- En `/zero-tickets` (consola de agente), un historial simple de grabaciones por ticket — lista de llamadas pasadas con link para reproducir/descargar cada archivo (los dos, si ambos lados grabaron).
- Gateado con `requireZeroTicketsAgent` / `isZeroTicketsAgent` — el mismo guard que ya usa el resto de las rutas de agente, sin inventar un nivel de permiso nuevo. El cliente no tiene acceso a reproducir grabaciones.

## Fuera de alcance

- Mezcla/combinación de los dos archivos en un solo video — no pedido, se puede agregar después sin romper nada de esto (las dos piezas ya están guardadas por separado).
- Política de retención/borrado automático.
- Transcripción o cualquier procesamiento del contenido grabado.
- Notificar o pedir consentimiento explícito más allá del banner visual (no es una revisión legal, es una decisión de producto ya tomada por el usuario: banner informativo, no un gate de "aceptar para continuar").

## Testing

Sin infraestructura de tests automatizados en este repo (mismo criterio que el resto de la sesión) — verificación manual: hacer una llamada con pantalla compartida de ambos lados, confirmar que arrancan 2 grabaciones, que el banner de aviso aparece, colgar y confirmar que ambos archivos se suben a S3 y aparecen en el historial del agente con size/duración razonables, y confirmar que el cliente no puede acceder a la ruta de reproducción.
