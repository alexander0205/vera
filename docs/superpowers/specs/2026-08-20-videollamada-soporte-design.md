# Videollamada con pantalla compartida para soporte — Diseño

**Fecha:** 2026-08-20
**Estado:** aprobado, pendiente de plan de implementación

## Problema

Hoy los clientes llaman por WhatsApp y comparten pantalla desde ahí, o hay que
armar un Google Meet. Ninguna de las dos vive dentro del sistema: el agente
tiene que salir de Zero Tickets, pedir un número o mandar un link, y la sesión
no deja rastro en el ticket.

Lo que se quiere (textual, de Alexander): *"Una persona entra al sistema, tu le
haces request por video llamada y esa te activa el audio y compartir pantalla.
Solo eso."* Con dos condiciones: que sea open source y que corra en Vercel.

## Objetivo

El agente pide una llamada desde el ticket. El cliente acepta, comparte pantalla
y micrófono. Ambos hablan. Sin cámara, sin grabación, sin salir del sistema.

## Enfoque elegido: WebRTC nativo peer-to-peer

La media va **directo** entre los dos navegadores. No hay servidor de video.
La señalización (el handshake para establecer la conexión) viaja por una tabla
nueva y el polling que Zero Tickets ya tiene.

### Por qué P2P y no un SFU administrado

Se evaluaron tres opciones:

| | Costo | Open source | Vercel | Esfuerzo |
|---|---|---|---|---|
| **P2P nativo** | ~$0, no escala con clientes | Sí (APIs del navegador) | Sí | 3-4 días |
| LiveKit Cloud | Por minuto, escala con uso | Sí (Apache 2.0) | Sí | 1-2 días |
| Daily.co | $0.004/participante-min | No | Sí | 1 día |

Se eligió **P2P** porque:

1. Es 1:1. Un SFU existe para retransmitir entre muchos participantes; entre dos
   personas es un intermediario que se paga sin dar nada a cambio.
2. Cumple las dos condiciones de Alexander literalmente: open source (APIs
   nativas) y Vercel (solo route handlers REST).
3. El costo no crece con la cantidad de clientes — que era la preocupación
   explícita al abrir el tema.

El precio de esa decisión son ~2 días extra de desarrollo y un handshake más
delicado de debuggear. Se acepta.

## Decisiones ya tomadas (no reabrir sin volver a preguntar)

1. **Sin grabación.** Habilita P2P puro y evita el deber de custodia sobre
   datos fiscales de terceros que aparecen en la pantalla compartida.
2. **Simétrico:** ambos lados pueden compartir pantalla y ambos tienen
   micrófono. Ninguno tiene cámara.
3. **ICE no-trickle.** Ver abajo.
4. **Un solo intercambio SDP por llamada**, vía transceivers reservados. Ver abajo.
5. **La llamada la inicia siempre el agente.** El cliente no puede llamar.

## Dos decisiones técnicas que dependen de este repo

### ICE no-trickle (por la latencia de la DB)

WebRTC normalmente hace *trickle ICE*: manda cada candidato de red apenas lo
descubre, 20-40 señales sueltas por conexión. Contra la Postgres de este
proyecto (Neon remoto, ~7s por conexión medidos) eso es inviable.

Se usa **ICE no-trickle**: se espera a que termine de juntar candidatos
(`icegatheringstate === 'complete'`) y se manda **una sola señal** con el SDP
completo y los candidatos embebidos. Total del handshake: **2 señales**
(oferta + respuesta) en vez de ~40.

Cuesta ~2s más al arrancar. A cambio, la señalización cabe en el polling de
1.5s que ya existe — sin canal nuevo, sin WebSockets, sin cambiar la decisión
de arquitectura original de Zero Tickets.

### Un solo intercambio SDP, vía transceivers reservados

Agregar el track de pantalla cuando alguien empieza a compartir obligaría a un
nuevo intercambio oferta/respuesta, y como los dos lados pueden compartir, abre
la puerta a *glare* (ambos ofreciendo a la vez).

En vez de eso, la conexión se crea con los transceivers ya reservados:

```js
pc.addTransceiver('audio', { direction: 'sendrecv' });  // micrófono
pc.addTransceiver('video', { direction: 'sendrecv' });  // pantalla, track nulo
```

Compartir pantalla después es `sender.replaceTrack(screenTrack)`, y dejar de
compartir es `sender.replaceTrack(null)`. **Ninguna de las dos requiere
renegociar.**

Resultado: exactamente un intercambio oferta/respuesta por llamada, sin
importar quién comparte qué ni cuándo. Elimina el glare por construcción.

## Modelo de datos

```
ticket_calls
  id             serial PK
  ticket_id      int NOT NULL FK tickets.id ON DELETE CASCADE
  requested_by   int NOT NULL FK users.id        -- el agente que la pidió
  status         varchar(20) NOT NULL DEFAULT 'pendiente'
                 -- pendiente | activa | terminada | rechazada
  created_at     timestamp NOT NULL DEFAULT now()
  answered_at    timestamp
  ended_at       timestamp
  ended_reason   varchar(20)  -- colgada | rechazada | timeout | error | desconexion

  -- Una sola llamada viva por ticket. El segundo agente que intente
  -- llamar al mismo ticket recibe 409 en vez de crear una llamada huérfana.
  UNIQUE INDEX (ticket_id) WHERE status IN ('pendiente', 'activa')

ticket_call_signals
  id          serial PK
  call_id     int NOT NULL FK ticket_calls.id ON DELETE CASCADE
  from_role   varchar(10) NOT NULL   -- user | agent
  kind        varchar(10) NOT NULL   -- offer | answer
  payload     jsonb NOT NULL         -- SDP completo con candidatos embebidos
  created_at  timestamp NOT NULL DEFAULT now()
```

Las señales van en tabla propia y **no** en `ticket_messages`: son ruido
técnico, no conversación. Meterlas ahí ensuciaría el historial visible del
ticket y engordaría el payload del poll del chat en cada tick.

## Módulos

Separados para que cada uno se entienda y se pruebe solo:

| Archivo | Responsabilidad | No sabe nada de |
|---|---|---|
| `lib/webrtc/conexion.ts` | `RTCPeerConnection`, transceivers, tracks, streams | React, HTTP |
| `lib/webrtc/senalizacion.ts` | Cliente REST: mandar y leer señales | WebRTC |
| `lib/webrtc/useLlamada.ts` | Orquesta las dos, expone estado a la UI | — |
| `components/support/panel-llamada.tsx` | UI compartida cliente + agente | Transporte |
| `components/support/invitacion-llamada.tsx` | Banner de "te están llamando" | Transporte |

Rutas nuevas:

```
app/api/zero-tickets/calls/
  route.ts               POST crear llamada (solo agente)
  [id]/answer/route.ts   POST aceptar o rechazar (solo el dueño del ticket)
  [id]/signal/route.ts   POST mandar señal · GET leer las del otro lado
  [id]/end/route.ts      POST colgar (cualquiera de los dos)
  ice-servers/route.ts   GET credenciales TURN efímeras
```

**Cómo llega cada cosa** — son dos canales distintos y conviene no confundirlos:

- **Estado de la llamada** (`pendiente` / `activa` / `terminada`) viaja en el
  poll que ya existe: `GET /api/zero-tickets/tickets` para el cliente,
  `.../agent/tickets/[id]/messages` para el agente. Se agrega un campo `call`.
  Cuando no hay llamada activa el campo es `null` y el costo extra es una
  query indexada. Esto es lo que dispara el banner de invitación.
- **Las señales SDP** viajan por `GET /calls/[id]/signal`, ruta aparte, y solo
  se consulta mientras la llamada está `pendiente` o `activa` — o sea durante
  el handshake, que dura dos intercambios y se termina. Van aparte porque el
  SDP es un payload grande que no tiene por qué viajar en cada tick del poll
  del chat.

## Flujo

```
Agente click "Iniciar llamada"
   → POST /calls                        status=pendiente
   → mensaje de sistema en el chat:     "El agente inició una llamada."
   → agente ve "Esperando que el cliente acepte…"

Cliente — lo trae el poll de 1.5s que ya existe
   → banner: "<Agente> quiere iniciar una llamada con pantalla compartida"
             [Aceptar] [Rechazar]

Cliente acepta
   → POST /calls/[id]/answer            status=activa
   → pide micrófono, después pantalla
   → arma oferta, espera ICE completo, POST /calls/[id]/signal (kind=offer)

Agente recibe la oferta por su poll
   → pide su micrófono
   → arma respuesta, POST /calls/[id]/signal (kind=answer)

Cliente recibe la respuesta → conectados.
La media va directo entre navegadores. No pasa por ningún servidor.
```

**El que acepta es quien ofrece.** Así nunca se manda una oferta antes de que
ese lado tenga la media lista.

## UI

- **Widget flotante (360px):** muestra el banner de invitación, pero una
  pantalla compartida no se ve en ese ancho. Al aceptar, **redirige a
  `/dashboard/soporte`**.
- **`/dashboard/soporte`:** el panel de llamada aparece a la derecha
  **solo mientras hay llamada activa**. No hay columna reservada de gratis.
- **`/zero-tickets`:** botón "Iniciar llamada" junto a "Pedir captura". Mismo
  panel compartido.

**Controles, iguales de los dos lados:** micrófono on/off · compartir o dejar
de compartir pantalla · colgar.

**Rastro en el chat:** cada evento deja mensaje de sistema — "Llamada
iniciada", "Llamada rechazada", "Llamada terminada · 4 min". Reusa el patrón
`senderType: 'system'` que ya existe, y el historial del ticket queda completo.

## Manejo de errores

| Situación | Comportamiento |
|---|---|
| Cliente niega micrófono | Llamada sigue sin su audio. Aviso visible. Puede reintentar |
| Cancela el picker de pantalla | Llamada sigue. El botón queda disponible |
| Red bloquea P2P y no hay TURN | Timeout 20s → "Tu red bloquea la conexión directa. Seguimos por chat." |
| Un lado cierra la pestaña | `connectionstatechange` a `disconnected`/`failed` → 10s de gracia para reconexión ICE → cierra con `ended_reason=desconexion` |
| Invitación sin responder | Expira a 60s, `ended_reason=timeout` |
| Dos agentes llaman al mismo ticket | El índice único parcial lo rechaza. El segundo recibe 409 |

## Seguridad

- **Autorización por ruta:** el cliente solo toca llamadas de *su* ticket; el
  agente pasa por `requireZeroTicketsAgent()`, igual que todo
  `/api/zero-tickets/agent/*`.
- **Credenciales TURN efímeras**, emitidas server-side con TTL corto, nunca en
  el bundle del cliente. Mismo criterio que la decisión ya documentada en
  `lib/storage/comprobantes.ts` sobre no usar presigned URLs.
- **Degradación sin TURN:** si no hay credenciales configuradas, funciona
  STUN-only (~80-85% de las redes) y avisa claro cuando no puede conectar.
  Mismo patrón que `s3Disponible()` cayendo a base64.
- **`Permissions-Policy`** pasa de `camera=(), microphone=(), geolocation=()` a
  `camera=(), microphone=(self), display-capture=(self), geolocation=()`.
  **La cámara sigue cerrada.** Sin este cambio `getUserMedia` para micrófono
  está bloqueado y nada de esto funciona.

## Privacidad

La pantalla del cliente va a mostrar RNC, facturas y datos fiscales de
terceros. Tres mitigaciones concretas:

1. El cliente elige qué comparte en el picker nativo del navegador (pestaña,
   ventana o pantalla completa). Nunca es automático ni lo decide el agente.
2. **Nada se graba, nada se almacena.** La media no toca ningún servidor.
3. Indicador permanente mientras comparte, con el botón de cortar siempre
   visible.

## Verificación

El repo no tiene suite de tests automatizados — decisión ya documentada en
`docs/superpowers/plans/2026-08-14-zero-tickets.md`. Se sigue la misma
convención: `curl` contra las rutas REST más checklist manual en navegador.

Checklist manual (dos navegadores: uno normal, uno de incógnito con cuenta de
agente):

- [ ] Llamada completa de punta a punta
- [ ] Compartir y dejar de compartir pantalla desde ambos lados sin que se corte
- [ ] Mute / unmute de ambos lados
- [ ] Rechazar la invitación
- [ ] Cerrar la pestaña de un lado — el otro se entera y cierra
- [ ] Negar el permiso de micrófono — la llamada sigue
- [ ] En `chrome://webrtc-internals`, con ambos en red normal, confirmar que el
      par de candidatos activo es `host` o `srflx` y **no** `relay` — prueba que
      va directo y no se está pagando TURN de gusto

## Fuera de alcance

Explícitamente **no** entra en esta iteración:

- Grabación de sesiones
- Llamadas grupales (3+ participantes)
- Cámara de video
- Llamadas iniciadas por el cliente
- Estadísticas de calidad de llamada
- Chat de texto dentro del panel (el chat del ticket ya está al lado)

## Deuda relacionada, detectada al diseñar esto

No bloquea este feature, pero apareció y conviene registrarlo:

**No hay credenciales S3 en el entorno.** Los adjuntos caen al fallback base64
en Postgres (`lib/storage/tickets.ts`). Un PNG de 2MB se guarda como ~2.7MB de
texto y se lee entero por la conexión lenta de Neon en cada carga. Esa es la
causa de fondo de "las imágenes del chat tardan mucho". Configurar S3 lo
resuelve sin tocar código.
