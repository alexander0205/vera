# Spec — Conexión WhatsApp por negocio (vera → crm-escolar)

> Estado: diseño aprobado, pendiente de plan de implementación.
> Rama: (definir al implementar).

## Contexto

Cada negocio (team) en vera necesita poder conectar su propio número de
WhatsApp Business para que vera le mande mensajes (facturas, recordatorios de
cobro, etc.) usando ese número.

La conexión real con Meta/WhatsApp Business API **no la construye vera**.
Existe una plataforma propia — el repo `crm-escolar`
(`C:\Users\User\OneDrive\Documents\crm-escolar`) — que ya expone una API
pública multi-tenant para integradores externos:

- `docs/api-publica.md` y `docs/guia-integrador.md` documentan el contrato.
- Vera es "un integrador más" de esa API, igual que cualquier tercero.
- La plataforma está deployada en `https://crm.zero.com.do`.

**Por qué esto no es una integración directa con Meta:** `crm-escolar` ya
resolvió Meta Business verification, Embedded Signup y el rol de BSP. Vera
solo habla HTTP con `crm-escolar` usando una API key por negocio.

**Enlace con crm-escolar sin trabajo extra:** cuando vera manda un mensaje vía
`POST /api/v1/messages`, ese mensaje también aparece en el inbox propio de
crm-escolar (la conversación pasa a estado `humano`) — el equipo del colegio ve
en crm-escolar lo que vera mandó, sin sincronización adicional. Es el mismo
negocio en la misma plataforma; ambos sistemas comparten el mismo número
porque comparten el mismo `negocioId`.

**Alcance de este spec:** solo el lado de vera. `crm-escolar`/API v1 ya existe
y no se modifica. Cubre únicamente conexión + envío saliente — el inbox
bidireccional completo en vera (UI de conversaciones, respuestas) queda fuera
de alcance, es un spec futuro aparte.

## Objetivo

1. Cada team de vera puede conectar su WhatsApp desde Configuración → Canales.
2. Si el team no tiene negocio en `crm-escolar` todavía, vera lo crea
   automáticamente (sin que el dueño del negocio tenga que registrarse aparte
   en crm-escolar).
3. Vera puede enviar mensajes de texto a un teléfono usando el WhatsApp
   conectado del team (para facturas, recordatorios, etc. — el disparo real
   de esos mensajes es trabajo de integración posterior, fuera de este spec;
   este spec solo entrega el mecanismo de envío).
4. Vera puede recibir mensajes entrantes vía webhook, verificados por firma,
   y guardarlos (persistencia mínima — sin UI de inbox en este spec).

## Prerrequisito de configuración (fuera del código de vera)

`crm-escolar` necesita tener `PARTNER_API_KEY` configurado en su entorno de
producción (`.env.example:75` lo declara vacío; hay que generarlo y
desplegarlo ahí — `openssl rand -hex 32`, según `docs/api-publica.md`). Sin
esto, `POST /api/v1/negocios` responde 503. Este paso lo hace el dueño de
`crm-escolar` (mismo usuario, otro repo) — no es parte de esta implementación,
pero bloquea probar el flujo end-to-end.

## Modelo de datos

Tabla nueva `whatsapp_config`, una fila por team:

| Campo | Tipo | Notas |
|---|---|---|
| `id` | serial PK | |
| `teamId` | integer, FK `teams.id`, unique, not null | un negocio-crm-escolar por team |
| `negocioId` | text, not null | id devuelto por `POST /api/v1/negocios` |
| `apiKeyCiphered` | text, not null | `encryptField()` de `sk_live_...` |
| `apiKeyIv` | text, not null | |
| `apiKeyAuthTag` | text, not null | |
| `webhookSecretCiphered` | text, nullable | `encryptField()` del secret del webhook |
| `webhookSecretIv` | text, nullable | |
| `webhookSecretAuthTag` | text, nullable | |
| `conectado` | boolean, not null, default false | true cuando Meta confirma el número vinculado |
| `numeroWhatsapp` | text, nullable | `+1...` de display una vez conectado |
| `creadoEn` | timestamp, not null, default now() | |
| `actualizadoEn` | timestamp, not null, default now() | |

Cifrado: reusar `lib/crypto/cert.ts` (`encryptField`/`decryptField`,
AES-256-GCM con `CERT_MASTER_KEY` ya existente) — mismo patrón usado hoy para
certificados P12. No se crea un mecanismo de cifrado nuevo.

Tabla nueva `whatsapp_mensajes` (persistencia mínima de entrantes, sin UI de
inbox en este spec):

| Campo | Tipo | Notas |
|---|---|---|
| `id` | serial PK | |
| `teamId` | integer, FK `teams.id`, not null | |
| `telefono` | text, not null | número del contacto (`evento.from`) |
| `nombreContacto` | text, nullable | `evento.name` |
| `texto` | text, nullable | `evento.text` (null si `type` no es texto) |
| `tipo` | text, not null | `evento.type` (`texto`, `imagen`, etc.) |
| `conversationId` | text, not null | id de crm-escolar |
| `messageId` | text, not null, unique | `evento.messageId` (`wamid....`) — evita duplicados por reintento |
| `recibidoEn` | timestamp, not null, default now() | |

## Variables de entorno nuevas (vera)

```
CRM_ZERO_API_URL=https://crm.zero.com.do/api/v1
CRM_ZERO_PARTNER_KEY=<partner key generado en crm-escolar>
```

## Flujo — Onboarding (conectar WhatsApp)

UI: Configuración → Canales → tarjeta "WhatsApp Business".

1. **Sin `whatsapp_config` para el team** → botón "Conectar WhatsApp".
   Al hacer clic, endpoint interno `POST /api/whatsapp/conectar`:
   - Llama `POST {CRM_ZERO_API_URL}/negocios` con header
     `x-partner-key: CRM_ZERO_PARTNER_KEY`, body `{ nombre: team.nombre,
     vertical: team.posEscolarHabilitado ? 'colegio' : 'general' }`
     (server-side; `CRM_ZERO_PARTNER_KEY` nunca llega al browser). Vera no es
     exclusivo de colegios — `posEscolarHabilitado` (ya existe en
     `teams`, `lib/db/schema.ts:140`) es la señal correcta de qué vertical
     usar; el resto de negocios usa `'general'`.
   - Guarda `negocioId` + `apiKey` (encriptada) en `whatsapp_config`.
   - Registra el webhook propio: `POST {CRM_ZERO_API_URL}/webhooks` con
     `x-api-key` recién obtenida, body
     `{ url: "https://<vera-domain>/api/whatsapp/webhook/{teamId}" }` →
     guarda `secret` (encriptado).
   - Devuelve `connectUrl` al frontend.
2. Frontend abre `connectUrl` en popup/nueva pestaña. Usuario hace login con
   Meta y escanea el QR con WhatsApp Business (flujo 100% de crm-escolar, sin
   código en vera).
3. **Con `whatsapp_config` pero `conectado=false`** → botón "Verificar
   conexión": endpoint `POST /api/whatsapp/estado` llama
   `POST {CRM_ZERO_API_URL}/connect-url` con la `apiKey` del team (este
   endpoint de crm-escolar además regenera el link si expiró) y actualiza
   `conectado`/`numeroWhatsapp` según la respuesta.
4. **Con `conectado=true`** → tarjeta muestra el número conectado, sin acción
   pendiente.

No hay polling automático en background en este spec — el estado se
refresca cuando el usuario entra a la pantalla o pulsa "Verificar conexión".

## Flujo — Envío saliente

`lib/whatsapp/client.ts`:

```ts
export async function enviarWhatsApp(teamId: number, telefono: string, texto: string): Promise<{ messageId: string; conversationId: string }>
```

- Lee `whatsapp_config` del team, desencripta `apiKey`.
- Si no hay config o `conectado=false` → lanza error tipado
  (`WhatsAppNoConectadoError`) — el llamador decide cómo mostrarlo (ej. en
  cobranza, deshabilitar el botón "Enviar por WhatsApp" si no está
  conectado).
- Llama `POST {CRM_ZERO_API_URL}/messages` con `x-api-key`,
  body `{ to: telefono, text: texto }`.
- Mapeo de errores de la API (`api-publica.md`):
  - `409` → `WhatsAppNoConectadoError` (se desconectó del lado de Meta).
  - `422` → `WhatsAppFueraDeVentanaError` (regla de 24h o número inválido —
    el mensaje de error de la API trae el detalle, se propaga tal cual).
  - `429` → un reintento único con espera de 2s; si vuelve a fallar, se
    propaga el error (no hay cola/reintentos avanzados en este spec).
- El llamador (ej. lógica de cobranza) hace fire-and-forget con log de error
  si falla — mismo patrón que el envío de email actual, no bloquea la
  respuesta HTTP que disparó el envío.

Este spec entrega el mecanismo (`enviarWhatsApp`); **no** cablea todavía
ningún punto de disparo real (recordatorios de cobro, facturas). Eso queda
para cuando se decida el primer caso de uso concreto.

## Flujo — Recepción (webhook)

`app/api/whatsapp/webhook/[teamId]/route.ts`:

1. Lee el body **crudo** (`await req.text()` en Next.js — nunca
   `req.json()` antes de verificar, la firma se calcula sobre el string
   exacto recibido).
2. Busca `whatsapp_config` por `teamId` de la ruta; si no existe, `404`.
3. Verifica header `x-crm-signature: sha256=<hex>` contra
   HMAC-SHA256(`webhookSecret`, rawBody) con `crypto.timingSafeEqual`. Si no
   coincide → `401`.
4. Responde `200` inmediatamente (antes de cualquier escritura a DB, como
   pide la API para no acumular reintentos).
5. Parsea el JSON ya verificado, hace `upsert` en `whatsapp_mensajes` por
   `messageId` (idempotente — la API puede reintentar 3 veces).

No hay UI de inbox en este spec — la tabla existe para no perder los
mensajes entrantes mientras se decide qué hacer con ellos (ej. mostrarlos en
el detalle del cliente en vera, o simplemente quedar de registro).

## Manejo de errores — resumen

| Código API crm-escolar | Situación | Vera hace |
|---|---|---|
| `401` | api key mala/revocada | error interno, loguear, no reintentar |
| `409` | WhatsApp no conectado | `WhatsAppNoConectadoError`, UI invita a reconectar |
| `422` | Meta rechazó (ventana 24h, número inválido) | `WhatsAppFueraDeVentanaError`, mensaje al usuario con el detalle de la API |
| `429` | rate limit (60/min) | 1 reintento con espera de 2s, luego propaga |
| `503` (en `/negocios`) | `PARTNER_API_KEY` no configurado en crm-escolar | error interno claro en logs — bloqueante para todo el flujo, no es recuperable desde vera |

## Fuera de alcance (explícito)

- Inbox bidireccional en vera (lista de conversaciones, responder desde
  vera) — spec futuro, depende de este.
- Envío de imágenes/PDF/media — la API pública hoy solo envía texto.
- Disparo automático real desde cobranza/facturación hacia
  `enviarWhatsApp` — este spec entrega el mecanismo, no los call-sites.
- Polling en background del estado de conexión.
- Cambios en `crm-escolar` — se asume la API pública actual tal cual está
  documentada en ese repo.

## Testing

- Unit: `lib/whatsapp/client.ts` — mockear `fetch`, cubrir cada código de
  error (`409`/`422`/`429`) y el caso feliz.
- Unit: verificación de firma del webhook — HMAC válido/inválido, body
  alterado.
- Integración (dev, con crm-escolar real desplegado): flujo completo de
  conectar → escanear QR manualmente → enviar mensaje de prueba → verificar
  que llega al inbox de crm-escolar. Documentado como checklist manual, no
  automatizable sin un número de WhatsApp de prueba.
