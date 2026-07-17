# Pasarelas de pago — CardNet & Azul (links de pago)

> Estado: **PLAN** (sin implementar). Decisiones tomadas: CardNet primero ·
> alcance e-CF + cotizaciones · doc detallado antes de codear.

## 1. Objetivo

El negocio genera un **link de pago** desde el sistema (para un e-CF emitido o
una cotización), lo comparte (WhatsApp, email, copiar). El cliente paga con
tarjeta en la página **hospedada del proveedor** (nunca tocamos la tarjeta). El
proveedor nos notifica el resultado; nosotros registramos el cobro en
`pagos_recibidos`, marcamos `estado_pago`, y —si era cotización— emitimos el e-CF.

**Regla dura de seguridad:** solo integraciones *hosted page*. Nunca el REST
directo de tarjeta (evita alcance PCI-DSS en nuestros servidores).

## 2. Cómo funciona cada proveedor

### CardNet — Botón con pantalla (POST 3DS) — PRIMERO
Dos pasos, el segundo es el redirect del cliente:

1. **Server → `POST {base}/sessions`** con `TransactionType=0200`, `Amount`,
   `CurrencyCode=214`, `Tax`(ITBIS), `MerchantNumber`, `MerchantTerminal`,
   `ReturnUrl`, `CancelUrl`, `OrdenId`, `TransactionId`, `MerchantName`,
   `AcquiringInstitutionCode`, `PageLanguaje`. → responde `SESSION` (uuid) +
   `session-key`.
2. **Cliente → `POST {base}/authorize`** con un único campo oculto `SESSION`.
   CardNet muestra el gateway, cliente paga con 3DS.
3. **Retorno**: redirect a `ReturnUrl` (aprobado) o `CancelUrl` (declinado/
   cancelado) con `ResponseCode` (`00`=OK), `AuthorizationCode`,
   `CreditCardNumber` (enmascarada), `TxToken`, `RetrievalReferenceNumber`.
4. **Verificación autoritativa** (recomendado, no confiar solo en el redirect):
   `GET {base}/sessions/{SESSION}?sk={session-key}` dentro de 30 min.

- Base sandbox: `https://labservicios.cardnet.com.do`
  (MerchantNumber `349041263`, Terminal `77777777`, Currency `214`)
- Base prod: `https://ecommerce.cardnet.com.do` (creds via ejecutivo de cuenta)
- Auth TLS 1.2. Cierre de lote automático 7:00 PM (configurable).

### Azul — Payment Page (fase 2)
Un solo paso, sin API de sesión: se arma un **form HTML** y se redirige.

1. **Cliente → `POST https://pagos.azul.com.do/PaymentPage/`** (prod) con campos
   `MerchantId`, `MerchantName`, `MerchantType`, `CurrencyCode`, `OrderNumber`,
   `Amount`, `ITBIS`, `ApprovedUrl`, `DeclinedUrl`, `CancelUrl`, `AuthHash`.
2. **`AuthHash`** = HMAC-SHA512 de la concatenación de los campos + la *auth key*
   privada del comercio (orden exacto según doc oficial de Azul — confirmar en
   `dev.azul.com.do` con las creds reales).
3. **Retorno**: Azul hace POST a `ApprovedUrl`/`DeclinedUrl`/`CancelUrl` con la
   respuesta + su propio hash firmado → **verificar el hash** antes de confiar.

> Nota: ambos proveedores son **form-POST**, no un GET-link. Por eso el link
> compartible es NUESTRO (`pay.zero.com.do/{token}`); la landing arma el form del
> proveedor y hace auto-submit.

## 3. Modelo de datos (migraciones nuevas)

### `payment_provider_config` — credenciales por empresa (multi-tenant)
Cada negocio usa SU cuenta de comercio.
```
id            serial pk
team_id       int → teams.id
provider      varchar(20)   -- 'cardnet' | 'azul'
merchant_id   varchar(50)
terminal_id   varchar(50)   -- CardNet
auth_key      jsonb         -- Encrypted (lib/crypto/cert.ts encryptField)
api_key       jsonb         -- Encrypted (CardNet, si aplica)
ambiente      varchar(10)   -- 'sandbox' | 'prod'
enabled       boolean default false
created_at / updated_at
UNIQUE(team_id, provider)
```
Secretos cifrados at-rest reusando `encryptField`/`decryptField` (AES-256-GCM),
igual que el P12. Nunca en texto plano ni en logs.

### `payment_links` — intención de cobro
```
id              serial pk
token           varchar(40) unique   -- nanoid; va en la URL pública
team_id         int → teams.id
provider        varchar(20)
ecf_document_id int → ecf_documents.id   NULL
cotizacion_id   int → cotizaciones.id    NULL   -- exactamente uno de los dos
monto_centavos  int
itbis_centavos  int
currency        varchar(3) default 'DOP'
orden_id        varchar(50)          -- OrdenId/OrderNumber → idempotencia
estado          varchar(20) default 'pendiente'
                -- pendiente | pagado | fallido | expirado | cancelado
session_id      varchar(64)          -- SESSION de CardNet
session_key     varchar(128)         -- para GET /sessions/{id}?sk=
provider_ref    varchar(64)          -- AuthorizationCode / RetrievalRef
card_mask       varchar(25)
expires_at      timestamp            -- p.ej. 24h
paid_at         timestamp
created_by      int → users.id
created_at      timestamp
INDEX(team_id, estado) · INDEX(token) · INDEX(orden_id)
```

## 4. Rutas / API

| Ruta | Método | Qué hace |
|------|--------|----------|
| `/api/pagos/link` | POST | Crea `payment_links` para un e-CF o cotización. Valida permiso `pagos:crear`. Devuelve `{ url: pay.zero.com.do/{token} }`. |
| `/pay/[token]` | GET (público) | Landing: valida token/estado/expiración. Para CardNet hace `POST /sessions` server-side, guarda `session_id`/`session_key`, renderiza form con `SESSION` y auto-submit a `/authorize`. Para Azul arma form con `AuthHash`. |
| `/api/pagos/callback/cardnet` | GET/POST | ReturnUrl/CancelUrl. Reconsulta `GET /sessions/{id}?sk=`. Verifica. Marca link, registra pago, emite e-CF si cotización. |
| `/api/pagos/callback/azul` | POST | ApprovedUrl/DeclinedUrl/CancelUrl. Verifica hash de respuesta. Mismo post-proceso. |
| `/api/pagos/link/[token]/status` | GET | Polling para la UI del comercio (¿ya pagó?). |

### Post-proceso al confirmar pago (compartido)
1. Idempotencia por `orden_id` — si el link ya está `pagado`, no-op.
2. **e-CF ya emitido**: `registrarPago({ ecfDocumentId, montoCentavos,
   metodo:'tarjeta', referencia: AuthorizationCode, cuenta: 'CardNet'|'Azul' })`
   → recalcula `estado_pago`.
3. **Cotización**: emitir e-CF via el flujo de `POST /api/ecf/emitir`
   (`modo:'emitir'`, delega a ecf-api → firma + DGII + NCF). Con el nuevo
   `ecf_document_id`, registrar el pago igual que arriba. Marcar cotización
   `estado='facturada'`.
4. `payment_links.estado='pagado'`, `paid_at`, `provider_ref`, `card_mask`.
5. Disparar webhook saliente existente (`lib/webhooks.ts`) evento `pago.recibido`.

> El cobro tarjeta NO entra a un turno de caja por defecto (`turno_caja_id=NULL`),
> igual que transferencias — es dinero electrónico, no efectivo físico. Confirmar
> con negocio si quieren cuadrarlo aparte.

## 5. WhatsApp
Fase 1 (gratis, sin aprobación): botón "Enviar por WhatsApp" →
`https://wa.me/{telCliente}?text={mensaje+payUrl}`. El cliente/negocio dispara
desde su propio WhatsApp.
Fase 2 (opcional): WhatsApp Business API para envío automático — requiere cuenta
Meta + plantillas aprobadas + costo por conversación. Fuera de alcance inicial.

## 6. Seguridad / consideraciones
- Solo hosted page (sin PCI en nuestros server). Nunca almacenar PAN completo.
- Verificar SIEMPRE el resultado server-side (CardNet reconsulta sesión; Azul
  valida hash de respuesta). No confiar solo en el redirect del browser.
- Credenciales cifradas (`encryptField`), fuera de logs.
- Idempotencia por `orden_id` (evita doble-cobro / doble-emisión de e-CF).
- Links con `expires_at` y estado `expirado`.
- Callbacks solo HTTPS; CSP ya permite lo necesario (revisar `frame-src` si el
  gateway se muestra embebido — preferible redirect full-page, no iframe).
- Rate-limit en `/pay/[token]` y creación de links.

## 7. Orden de implementación (MVP CardNet sandbox)
1. Migración `payment_provider_config` + `payment_links`.
2. `lib/pagos/cardnet/` — cliente (`crearSesion`, `consultarSesion`), tipos,
   mapeo monto→centavos, currency 214.
3. `POST /api/pagos/link` + UI botón "Cobrar con tarjeta / Link de pago" en
   detalle de e-CF y de cotización.
4. `/pay/[token]` landing + auto-submit.
5. `/api/pagos/callback/cardnet` + post-proceso (registrarPago / emitir e-CF).
6. `/api/pagos/link/[token]/status` + polling en UI.
7. Botón WhatsApp (`wa.me`).
8. Probar end-to-end con sandbox `349041263`/`77777777`.
9. Fase 2: abstraer `PaymentProvider` interface + implementar Azul Payment Page.

## 8. Bloqueadores comerciales (los resuelve el negocio)
- Cuenta de comercio CardNet (ejecutivo) para creds de PROD. Sandbox ya abierto.
- Cuenta de comercio Azul + auth key (809-544-5287) para fase 2.

## Fuentes
- CardNet REST sin pantalla: https://developers.cardnet.com.do/guias/boton-de-pago/web-sin-pantalla-rest.html
- CardNet con pantalla POST 3DS: https://developers.cardnet.com.do/guias/boton-de-pago/web-con-pantalla-post-3ds.html
- CardNet dev portal: https://developers.cardnet.com.do/
- Azul integración vía API: https://www.azul.com.do/Pages/es/integracionViaAPI/integracion-api.aspx
- Azul Payment Page (PDF): https://dev.azul.com.do/Pages/developer/documentos/plugins/Documento-E-Commerce-AZUL-Pagina-Pagos-(Espanol)-2023-08.pdf
- Azul dev portal: https://dev.azul.com.do/Pages/developer/pages/lib/index.aspx
