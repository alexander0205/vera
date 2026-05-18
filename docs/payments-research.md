# Investigación: Integración de Pagos para EmiteDO (República Dominicana)

> **Fecha:** Mayo 2026  
> **Propósito:** Documentar opciones de integración de pasarelas de pago RD para que el equipo decida arquitectura e implementación.  
> **Alcance:** CardNet, AZUL, VeriFone POS, ecosistema OSS/SDK, recomendaciones para Next.js 15.

---

## Resumen Ejecutivo

Las tres pasarelas principales en RD son **CardNet**, **AZUL** (Banco Popular) y **PortalDom** (CyberSource/Fiserv). CardNet tiene la documentación pública más completa para desarrolladores con 4 modos de integración documentados, incluyendo una REST API plenamente especificada. AZUL requiere certificados SSL mutuos y tiene integración más compleja pero está más extendida. PortalDom (vía CyberSource) es la más robusta para fraude/wallet digital pero con menor presencia local.

Para EmiteDO, la ruta más directa es: **CardNet Botón de Pago (hosted POST + 3DS)** → **CardNet tokenización (card-on-file)** → **integración ECR con terminal físico**, en ese orden de fases.

---

## 1. CardNet — Opciones de Integración

### 1.1 Portal de Desarrolladores

- **URL:** [https://developers.cardnet.com.do](https://developers.cardnet.com.do)
- El portal es público, sin registro previo requerido para leer la documentación.
- Cuatro guías principales disponibles:
  1. Botón de Pago (con pantalla POST / sin pantalla REST / sin pantalla SOAP)
  2. Tokenización & Autenticación
  3. Integración Caja (ECR/POS físico)
  4. Integración POS Android

### 1.2 Opción A — Botón de Pago con Pantalla (POST + 3DS)

**Tipo:** Redirect a página hosteada por CardNet (equivalente a Stripe Checkout o PayPal Redirect).

**Flujo:**
1. El servidor del comercio hace `POST` a `https://labservicios.cardnet.com.do/sessions` (QA) o equivalente prod con los datos de la transacción.
2. CardNet devuelve un `SESSION` token.
3. El comercio renderiza un `<form>` que hace POST del `SESSION` al endpoint `/authorize` de CardNet.
4. El cliente ingresa su tarjeta en la página segura de CardNet (con 3DS si aplica).
5. CardNet redirige de vuelta al `ReturnUrl` / `CancelUrl` del comercio.
6. El comercio verifica el resultado con `GET /sessions/{SESSION}?sk={session-key}` (ventana de 30 minutos).

**Parámetros clave de la sesión:**
```
TransactionType: 0200 (venta), 0100 (pre-auth), 2240 (confirmación)
Amount, CurrencyCode, Tax (ITBIS)
MerchantNumber, MerchantTerminal
ReturnUrl, CancelUrl, ResponsePostUrl
PageLanguaje: ESP / ENG
```

**3DS:** Se incluyen campos opcionales de email, teléfono y dirección en la sesión para autenticación ampliada. Rechazos de 3DS retornan código `"TF"`.

**Entorno QA / Sandbox:**
- Session creation: `https://labservicios.cardnet.com.do/sessions`
- Credenciales sandbox: MerchantID `349041263`, TerminalID `77777777`, Currency `214` (DOP)

**Ventajas para EmiteDO:**
- Complejidad mínima: no manipulamos datos de tarjeta (PCI SAQ A).
- 3DS nativo.
- Ideal para "pagar esta factura" con un botón en el portal del cliente.

**Limitaciones:**
- El cliente sale del portal EmiteDO (redirect).
- Menos control visual/UX.
- No permite iframe (requiere confirmación con CardNet comercial).

---

### 1.3 Opción B — REST API sin pantalla (Headless)

**Tipo:** API server-to-server, el comercio captura la tarjeta directamente. **Requiere PCI DSS SAQ D o tokenización previa.**

**Endpoints de producción:**
```
Base: https://ecommerce.cardnet.com.do/api/payment

POST /api/payment/idenpotency-keys      → Generar llave idempotente
POST /api/payment/transactions/sales    → Procesar venta
POST /api/payment/transactions/voids    → Anular
POST /api/payment/transactions/checkins → Pre-autorizar
POST /api/payment/transactions/checkouts → Confirmar pre-auth
POST /api/payment/transactions/refund   → Reembolso
```

**Sandbox:** `https://labservicios.cardnet.com.do/api/payment`

**Autenticación:** HTTP Basic Auth con `API Key` como username (sin password). TLS 1.2 requerido.

**Ejemplo de cuerpo de venta:**
```json
{
  "amount": 1234.87,
  "card-number": "4111111111111111",
  "client-ip": "10.100.4.64",
  "currency": "214",
  "cvv": "468",
  "environment": "ECommerce",
  "expiration-date": "06/25",
  "idempotency-key": "098900879879645694198a1902411fa9",
  "invoice-number": "000011",
  "merchant-id": "349011300",
  "reference-number": "0000011",
  "terminal-id": "00567856",
  "token": "454500350001"
}
```

**Respuesta aprobada:**
```json
{
  "response-code": "00",
  "internal-response-code": "0000",
  "response-code-desc": "Transaction Approved",
  "approval-code": "008766",
  "pnRef": "txn-2j4S6en5X1JGnV956UtCiW76bUg"
}
```

**Tipos de entorno (`environment`):**
- `ECommerce` — pago online estándar
- `ECommerce_COF` — cargo con tarjeta guardada (card-on-file)
- `MOTO_Recurring` — pago recurrente con credencial archivada

**Códigos de respuesta clave:**
| Código | Significado |
|--------|-------------|
| `00` | Aprobado |
| `05` | Rechazado |
| `51` | Fondos insuficientes |
| `54` | Tarjeta expirada |
| `62` | Tarjeta restringida |
| `99` | Error CVV/CVC |
| `91` | Emisor no disponible |
| `96` | Error de sistema |
| `4901` | Falla autenticación 3DS |

**Notas operativas:**
- Obtener llave idempotente antes de cada transacción.
- Plataforma cierra automáticamente a las 7:00 PM (configurable).
- Anulaciones solo antes del cierre de lote.
- Reembolsos: una sola operación por transacción.

---

### 1.4 Opción C — Tokenización (Card-on-File)

**Documentación:** [https://developers.cardnet.com.do/guias/tokenizacion-autenticacion/](https://developers.cardnet.com.do/guias/tokenizacion-autenticacion/)

**Tipos de token:**
- **One-Time Token (OT):** Válido 10 minutos, uso único. Para pagos puntuales sin almacenar datos.
- **Commerce Token:** Persistente, reutilizable. Para card-on-file / pagos recurrentes.

**Flujo de tokenización:**
```
POST {URLBASE}/secure/api/Token?commerceKey={PrivateAccountKey}
Body: { Email, PAN, CVV, Expiration, CardholderName, CustomerId }
```

**Gestión de clientes:**
```
POST /v1/api/customer              → Crear cliente
GET  /v1/api/customer/{id}         → Consultar
POST /v1/api/customer/{id}/update  → Actualizar
POST /v1/api/customer/{id}/activate → Activar con código de verificación
```

**Cargo con token:**
```
POST /v1/api/purchase
Body: { TrxToken, OrderNumber, Amount, Currency, Capture: true }
```

**Para cargos recurrentes:** Usar `environment: "MOTO_Recurring"` en la REST API (Opción B) con el token almacenado.

**Webhooks:** CardNet usa webhooks asíncronos para notificar estados de transacción.
- El comercio registra su URL con CardNet.
- El webhook envía JSON con `PrivateAccountKey` como header de autenticación.
- Requerimiento: aceptar `Content-Type: application/json`.

**Activación de perfil de pago:**
1. Cliente recibe código de activación.
2. Comercio llama `POST /v1/api/customer/{id}/activate`.

Este modelo es **ideal para el caso de uso de colegios/suscripciones** de EmiteDO.

---

### 1.5 Opción D — SOAP (Legacy)

Namespace: `http://api.services.cardnet.com.do`

Métodos: `createIdempotencyKey`, `processSale`, `processVoid`, `processCheckIn`, `processCheckout`.

**No recomendado** para nuevas integraciones. Usar REST (Opción B).

---

### 1.6 Precios CardNet

Fuente: [https://www.cardnet.com.do/tarifario](https://www.cardnet.com.do/tarifario)

| Concepto | Costo |
|----------|-------|
| Afiliación | RD$850 (o US$10 en USD) |
| Botón de Pago — servicio mensual | RD$2,500 (3 meses gratis en promo) |
| 3DS Authentication por transacción | RD$7.50 |
| Tokenización por transacción | RD$7.50 |
| Enlace de Pago — mensual | RD$850 |
| POS Virtual — mensual | RD$850 |
| Pagos Automáticos — mensual | RD$850 |
| Cargo por facturación baja (< RD$350,000/mes) | RD$695 |

**Comisión por transacción (MDR — Merchant Discount Rate):**
- El tarifario público no publica el porcentaje MDR directamente.
- Fuentes independientes citan **3.75%–4.25%** para CardNet (el más bajo entre las pasarelas RD).
- Debe confirmarse con el equipo comercial de CardNet al momento de afiliación.

**Aprobación:** 7–15 días hábiles.

**Contacto desarrollo:** desarrollo@cardnet.com.do  
**Contacto afiliados:** servicioalafiliado@cardnet.com.do  
**Teléfono:** (809) 473-3200

---

## 2. VeriFone — Control de Terminal POS

### 2.1 Contexto en RD

CardNet es el principal adquiriente que despliega terminales Verifone en RD. Las terminales físicas en comercios afiliados a CardNet (V200c, V400, VX680, etc.) son propiedad/administradas por CardNet y actúan como terminales de captura de tarjeta.

### 2.2 Protocolo ECR (Electronic Cash Register)

**Documentación:** [https://developers.cardnet.com.do/guias/integracion-caja/](https://developers.cardnet.com.do/guias/integracion-caja/)

CardNet provee un protocolo propietario para que un sistema de caja (ECR) controle la terminal POS directamente por red local.

**Comunicación:** TCP/IP, **puerto 7060** en la terminal.

**Whitelist de IPs:** La terminal solo acepta conexiones de 3–6 IPs preconfiguradas. El ECR debe estar en la misma red local o en una red autorizada.

**Secuencia de handshake:**
```
ECR → POS: ENQ (0x05)          ← consulta inicial
POS → ECR: ACK (0x06)          ← listo para interactuar
ECR → POS: SYN (0x16)          ← solicitar modo cliente
[transacción]
POS → ECR: EOM (0x19)          ← fin de medio
ECR → POS: EOT (0x04)          ← fin de transmisión
```

**Delimitador de campos:** `FS (0x1C)` — separador entre campos.

**Ejemplo de request de venta (ECR → POS):**
```
CN00<FS>000000025000<FS>000000002000<FS>000000000000<FS>000056<FS>
```
Campos: tipo transacción (CN00=Venta), monto total, ITBIS, propina, número de ticket.

**Ejemplo de respuesta aprobada (POS → ECR):**
```
06<FS>MC<FS>D@5<FS>529952****4010<FS>004<FS>010518<FS>142012<FS>JUANA GOMEZ<FS>[...]
```
Campos: ACK, tipo host, modo, tarjeta enmascarada, lote, fecha, hora, titular, código de autorización.

**Tipos de transacción ECR:**
- `CN00` = Venta
- `CN01` = Cierre de lote
- `CN02` = Anulación

**Timeout:** 90 segundos para respuesta estándar; 150 segundos para cierres de lote.

**Características avanzadas:**
- DCC (conversión de moneda dinámica)
- Ajuste de propina post-transacción
- Firma digital (en terminales con panel de firma)
- Multi-comerciante (una terminal, múltiples MIDs)
- Loyalty/Promociones: indicadores BE (MONI wallet), DC (DCC), PR (PROMONET)

**Impresión de recibo con NCF:** El protocolo ECR pasa el número de ticket/invoice (`invoice-number`) al terminal. El terminal imprime el ticket estándar de la red de tarjetas. Para incluir datos adicionales del e-CF (NCF fiscal, líneas de productos, totales desglosados), se necesita un **recibo personalizado separado** desde la aplicación de caja — la terminal imprime su propio voucher de transacción independientemente.

**Importante:** No existe una API remota cloud de CardNet para controlar terminales Verifone. El protocolo ECR es exclusivamente **local LAN**. Si EmiteDO es una app SaaS cloud, necesita un **agente/cliente local** instalado en la red del comercio que sirva como puente entre el servidor cloud y la terminal.

### 2.3 POS Android (Sunmi, PAX, etc.)

**Documentación:** [https://developers.cardnet.com.do/guias/integracion-pos-android/](https://developers.cardnet.com.do/guias/integracion-pos-android/)

CardNet tiene terminales POS basados en Android (marcas Sunmi, PAX, etc.) con dos métodos de integración:

**Método 1 — Intents Android:**
La app del comercio envía un broadcast Intent al módulo de pagos CardNet instalado en el mismo dispositivo.

**Método 2 — REST local:**
```
POST http://[terminal-ip]:2001/v1/transactions
Body: { type: "SALE", amount: double, itbis: double, referenceCode, customData: {} }

Respuesta: { status: 0|1|2, message, transactionData: { authCode, cardNetwork, ... } }
```
- `status: 0` = Aprobado
- `status: 1` = Fallido  
- `status: 2` = Cancelado

**Impresión personalizada (Android POS):**
```
POST https://[terminal-ip]:2001/v1/device/printer
Body: {
  elements: [
    { type: "TEXT", text: "EmiteDO", bold: true, align: "CENTER" },
    { type: "TEXT", text: "NCF: B0100000001" },
    { type: "BARCODE", data: "...", format: "CODE_128" },
    { type: "QR", data: "https://dgii.gov.do/..." }
  ]
}
```
Soporta TEXT, IMAGE, BARCODE (CODE_128, EAN_13, etc.), QR, saltos de línea, con control de fuente (Droid Sans Mono), negrita, alineación.

**Esta es la ruta más viable para incluir NCF en el recibo** sin necesidad de una impresora separada.

### 2.4 VeriFone Cloud Global

La documentación global de Verifone Cloud ([https://docs.verifone.com](https://docs.verifone.com)) cubre APIs de e-commerce para pago online (no control de terminal POS físico). **No tiene soporte documentado específicamente para RD** y su disponibilidad para adquirientes locales como CardNet en RD es desconocida. Se necesita contacto directo con VeriFone para confirmar.

---

## 3. AZUL — Comparación

### 3.1 Generalidades

AZUL (operado por **Servicios Digitales Popular**, subsidiaria de Banco Popular Dominicano) es la pasarela con mayor reconocimiento de marca en RD. Alegra, la plataforma de facturación líder en LATAM, usa AZUL para su módulo de cobros en RD.

### 3.2 Opciones de Integración

AZUL ofrece dos modos principales:

**A) Payment Page (Página de Pagos) — Redirect**

- **URL Sandbox:** `https://pruebas.azul.com.do/PaymentPage/default.aspx`
- **URL Producción:** `https://pagos.azul.com.do/PaymentPage/default.aspx`

**Autenticación: SHA-512 + clave privada del comercio**

```
AuthHash = SHA512( UTF16LE( concat(params) + PrivateKey ) )
```

Parámetros obligatorios en orden exacto:
```
MerchantId, MerchantName, MerchantType ("ecommerce")
CurrencyCode ("$"), OrderNumber, Amount, ITBIS
ApprovedUrl, DeclinedUrl, CancelUrl, ResponsePostUrl
ShowTransactionResult, AuthHash
```

**Flujo:** Redirect del cliente → página AZUL → callback POST al `ResponsePostUrl` con `IsoCode` y hash de validación.

**Validación de respuesta:** 
- `IsoCode == "00"` → aprobado
- Verificar `AuthHash` de la respuesta para confirmar autenticidad

**B) WebServices API (JSON) — Headless**

- **Endpoint:** `https://pagos.azul.com.do/webservices/JSON/Default.aspx`
- **Sandbox:** `https://pruebas.azul.com.do/webservices/JSON/Default.aspx`

**Autenticación:** Headers HTTP `Auth1` y `Auth2` (credenciales proporcionadas por AZUL) + **Certificados SSL mutuos** (`azul.key`, `azul.pem`). Requiere configurar `CURLOPT_SSLCERT` / `CURLOPT_SSLKEY` en el cliente HTTP. **Esta es la mayor diferencia de complejidad vs CardNet.**

**Tipos de transacción:**
- `Sale` — venta estándar
- `Hold` — pre-autorización
- `Post` — confirmación de Hold
- `Void` — anulación
- `ProcessDataVault` (CREATE/Sale/DELETE) — tokenización

**Request de venta:**
```json
{
  "Channel": "EC",
  "PosInputMode": "E-Commerce",
  "TrxType": "Sale",
  "CardNumber": "4111111111111111",
  "Expiration": "202506",
  "CVC": "123",
  "Amount": "123400",
  "Itbis": "18000",
  "OrderNumber": "ORD-001",
  "CustomOrderId": "INV-00123",
  "Payments": "1"
}
```

**Respuesta:**
```json
{
  "ResponseCode": "ISO8583",
  "IsoCode": "00",
  "AuthorizationCode": "OK1234",
  "AzulOrderId": "...",
  "DataVaultToken": "...",
  "RRN": "...",
  "DateTime": "20260517123456"
}
```

**Data Vault (Tokenización):**
- `ProcessDataVault` con `TrxType: "CREATE"` para guardar tarjeta.
- `DataVaultToken` en respuesta, reutilizable en futuras ventas.
- Operación `DELETE` para remover token.

**Mensual E-commerce (API/Payment Page/Plugins):** RD$2,500/mes  
**Data Vault:** RD$1,800/mes adicionales  
**MDR máximo:** 6% (varía; típico 4%–6% según volumen)  
**Recurring payments:** RD$5 (aprobado) / RD$10 (rechazado) por transacción

### 3.3 Recursos OSS para AZUL

| Recurso | Lenguaje | Estado |
|---------|----------|--------|
| [lupena/wc-azul-payment-gateway](https://github.com/lupena/wc-azul-payment-gateway) | PHP (WooCommerce plugin) | Activo |
| [mitramejia/woocommerce-gateway-azul](https://github.com/mitramejia/woocommerce-gateway-azul) | PHP | Activo |
| [supermavster/php-azul-payment-gateway](https://github.com/supermavster/php-azul-payment-gateway) | PHP | Activo, ejemplos claros |
| [iCueto/Azul-Pay-Button](https://github.com/iCueto/Azul-Pay-Button) | Ruby | Antiguo |
| [ws-azul-mcmpos](https://www.jsdelivr.com/package/npm/ws-azul-mcmpos) | JS/npm | v1.0.3, sin mantenimiento activo, sin repo público |

**No existe un SDK Node.js/TypeScript oficial ni popular para AZUL.** Habría que construir un cliente HTTP desde cero basado en la documentación PDF.

### 3.4 Comparación CardNet vs AZUL

| Criterio | CardNet | AZUL |
|----------|---------|------|
| MDR típico | 3.75%–4.25% | 4%–6% |
| Mensual ecommerce | RD$2,500 | RD$2,500 |
| Data Vault/Tokenización | RD$7.50/txn | RD$1,800/mes |
| Documentación pública | Excelente (portal abierto) | Media (PDF descargable) |
| Autenticación API | Basic Auth (API Key) | Headers + Certificados SSL mutuos |
| Complejidad integración | Media | Alta (certificados) |
| SDK Node.js | Ninguno oficial | Ninguno oficial |
| Reconocimiento de marca RD | Alto | Muy alto |
| Settlement | 48–72 h | 48–72 h |
| 3DS | Sí (nativo en hosted) | Sí (3DS 2.0) |
| Webhooks | Sí (JSON callback) | Sí (ResponsePostUrl) |
| Terminales físicos | Sí (Verifone, ECR protocolo) | Sí (terminales propios) |

---

## 4. Ecosistema OSS / SDK en RD

### 4.1 Hallazgos en npm y GitHub

**Para CardNet dominicano:**
- No existe ningún paquete npm llamado `cardnet`, `cardnet-do`, `cardnet-rd` o similar publicado y mantenido.
- El GitHub de CardNet ([github.com/cardnet](https://github.com/cardnet)) tiene un único repo público (fork de Odoo) — **no publican SDKs**.
- Contacto oficial de desarrollo: `desarrollo@cardnet.com.do`

**Para AZUL:**
- Repositorios PHP existen pero ninguno para Node.js/TypeScript.
- `ws-azul-mcmpos` en npm (v1.0.3) envuelve los WebServices de AZUL para MCM/POS pero es un proyecto muy pequeño sin mantenimiento activo claro.
- Los WooCommerce plugins de PHP son los más usados en la comunidad.

**Conclusión:** EmiteDO necesitará construir sus propios clientes de API (wrappers TypeScript) para ambas pasarelas. Esto es razonable dado que las APIs son REST + JSON bien documentadas (CardNet) o REST + JSON con certificados (AZUL).

### 4.2 Cómo Integran los Competidores en RD

| Plataforma | Pasarela usada | Modo |
|------------|---------------|------|
| **Alegra** | AZUL + VisaNet | Redirect a Payment Page hosteada; credenciales en settings |
| **Vendabo** (e-commerce SaaS) | CardNet + AZUL + PortalDom | Pre-integradas, config en minutos |
| **Wispro** (ISP billing) | CardNet | CardNet API con tokens; registro automático en facturas |

El patrón estándar dominicano para SaaS de facturación es:
1. **Payment link** (enlace de pago) enviado por email/WhatsApp → redirect a hosted page de la pasarela.
2. Webhook de confirmación → marcar factura como pagada.
3. Para recurrentes: tokenización + cargo MOTO_Recurring desde el servidor.

---

## 5. Arquitectura Recomendada para EmiteDO

EmiteDO es una app Next.js 15, multi-tenant, con Server Actions, webhooks y e-CF DGII ya implementados. El diseño debe encajar en esa infraestructura.

### Fase 1 — Botón de Pago (Quick Win) — CardNet Hosted Checkout

**Complejidad:** 2/5  
**Tiempo estimado:** 2–3 semanas (incluyendo afiliación)  
**PCI scope:** SAQ A (mínimo — CardNet captura la tarjeta)

**Caso de uso:** Cliente recibe e-CF por email o portal → hace clic en "Pagar" → completa en página CardNet → se confirma como pagada en EmiteDO.

**Arquitectura en Next.js:**
```
Server Action (crear sesión de pago)
  → POST https://ecommerce.cardnet.com.do/sessions
  → Devuelve SESSION + session-key
  → Guarda en DB: { invoiceId, session, sessionKey, expiresAt }

Client → redirect a https://ecommerce.cardnet.com.do/authorize
  (form POST con SESSION)

CardNet → redirige a /api/payments/cardnet/return?SESSION=...

Route Handler GET /api/payments/cardnet/return
  → GET https://ecommerce.cardnet.com.do/sessions/{SESSION}?sk={key}
  → response-code == "00" → marcar factura como pagada
  → Emitir e-CF de pago si aplica
```

**Webhook alternativo:**  
Registrar `ResponsePostUrl` para recibir confirmación asíncrona (más robusto que solo el redirect).

**Pros:**
- Afiliación estándar; no necesita aprobación especial.
- Tiempo de desarrollo mínimo.
- Sin riesgo de incumplimiento PCI.
- Inmediatamente funcional para facturas individuales.

**Contras:**
- UX de redirect (el cliente sale del portal EmiteDO).
- No soporta pago programático (requiere interacción humana con la tarjeta).

---

### Fase 2 — Tokenización (Card-on-File) — Recurrentes y Suscripciones

**Complejidad:** 3/5  
**Tiempo estimado:** 3–4 semanas adicionales  
**PCI scope:** SAQ A-EP (si se usa hosted form para captura inicial) o SAQ D (si REST directo)  
**Requiere aprobación comercial especial** con CardNet para activar el producto de Pagos Automáticos.

**Caso de uso:** Colegio con mensualidades → cliente guarda tarjeta una vez → EmiteDO carga automáticamente el día 1 de cada mes.

**Flujo:**
```
1. Primera vez: cliente captura tarjeta en el hosted form de CardNet
   → CardNet genera Commerce Token y lo devuelve al webhook
   → EmiteDO almacena token en DB (cifrado), asociado al tenant + cliente

2. Cobro automático (cron job / Server Action en fecha de factura):
   → POST /api/payment/transactions/sales
     { environment: "MOTO_Recurring", token: "xxx", amount, invoiceId }
   → response-code "00" → marcar factura pagada → enviar e-CF

3. Fallo de cobro:
   → response-code "51" (fondos) → reintento 3 días
   → response-code "54" (expirada) → notificar cliente para actualizar tarjeta
```

**Modelo de datos sugerido:**
```typescript
// Tabla: payment_methods
{
  id: uuid,
  tenantId: uuid,
  clientId: uuid,
  processor: "cardnet" | "azul",
  token: string,          // cifrado en DB
  cardLast4: string,
  cardBrand: string,
  expiresMonth: number,
  expiresYear: number,
  createdAt: timestamp
}
```

**Pros:**
- Elimina fricción de pago para clientes frecuentes.
- Perfecto para colegios, condominios, suscripciones SaaS.
- Coherente con el módulo de Facturas Recurrentes ya en producción.

**Contras:**
- Requiere activación de "Pagos Automáticos" con CardNet (comercial).
- El webhook de tokenización inicial debe gestionarse cuidadosamente.
- Manejo de expiración de tarjeta y fallos requiere lógica de negocio adicional.

---

### Fase 3 — Integración POS Físico (En Persona)

**Complejidad:** 4/5  
**Tiempo estimado:** 4–6 semanas  
**Caso de uso:** Farmacia, restaurante, clínica — cliente paga en persona con tarjeta y recibe e-CF al mismo tiempo.

#### Opción 3A — Android POS (Recomendada)

**Para terminales Sunmi/PAX con Android** (que CardNet despliegue en nuevos afiliados):

```typescript
// EmiteDO Mobile App o Web App en el mismo dispositivo/red
// REST local a la terminal

async function chargeCardOnPOS(invoice: Invoice) {
  const res = await fetch(`http://${terminalIP}:2001/v1/transactions`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'SALE',
      amount: invoice.total,
      itbis: invoice.taxAmount,
      referenceCode: invoice.invoiceNumber,
      customData: { ncf: invoice.ncf }
    })
  })
  const { status, transactionData } = await res.json()
  
  if (status === 0) {
    // Imprimir NCF + datos en la terminal misma
    await printReceipt(terminalIP, invoice, transactionData)
    await markInvoicePaid(invoice.id, transactionData)
  }
}
```

**Impresión del e-CF en terminal Android:**
```json
{
  "elements": [
    { "type": "TEXT", "text": "EmiteDO", "bold": true, "align": "CENTER" },
    { "type": "TEXT", "text": "RNC: 1-00-12345-6" },
    { "type": "TEXT", "text": "NCF: B0100000001" },
    { "type": "TEXT", "text": "Fecha: 2026-05-17" },
    { "type": "TEXT", "text": "Total: RD$1,234.87" },
    { "type": "TEXT", "text": "ITBIS: RD$150.87" },
    { "type": "QR", "data": "https://ecf.dgii.gov.do/..." }
  ]
}
```

#### Opción 3B — ECR Protocol (Terminales Verifone Existentes)

Para comercios que ya tienen una terminal Verifone (V200c, V400) conectada por LAN:

**Requiere un agente local** (servicio Node.js en la LAN del comercio) que:
1. Recibe instrucción de EmiteDO cloud (WebSocket o SSE).
2. Abre socket TCP al puerto 7060 de la terminal.
3. Envía transacción en protocolo ECR binario.
4. Lee respuesta y la reenvía a EmiteDO cloud.

```
EmiteDO Cloud ←→ WebSocket ←→ Agente Local (Node.js)
                                    ↓
                              TCP:7060 ←→ Terminal Verifone
```

**Pros Opción 3B:** Funciona con el parque existente de terminales.  
**Contras:** Más complejo (agente local, protocolo binario, seguridad LAN); la impresión del NCF en el voucher de la terminal no es posible (imprime el ticket estándar de red de tarjetas).

**Recomendación Fase 3:** Iniciar con Android POS si CardNet está dispuesto a proveer terminales Android a nuevos afiliados EmiteDO. ECR para upgrade de comercios con Verifone existente.

---

### Resumen de Fases

| Fase | Descripción | Complejidad | Tiempo | Requisito CardNet |
|------|-------------|-------------|--------|-------------------|
| 1 | Hosted Checkout (botón pagar en factura) | 2/5 | 2–3 sem | Afiliación estándar |
| 2 | Tokenización + Recurrentes | 3/5 | 3–4 sem | Activar Pagos Automáticos |
| 3A | Android POS (Sunmi/PAX) | 4/5 | 4–6 sem | Terminal Android |
| 3B | ECR Verifone LAN (agente local) | 5/5 | 5–7 sem | Configuración whitelist IP |

---

## 6. Preguntas Abiertas / Lo que Necesitamos de CardNet Comercial

Antes de comenzar implementación se deben resolver estas preguntas con el equipo comercial/técnico de CardNet:

### Afiliación
- [ ] ¿CardNet ofrece un modelo de ISV/Partner para que EmiteDO integre múltiples sub-comercios (uno por tenant/empresa) desde una sola integración?
- [ ] ¿Existe un modelo de "master merchant" o "marketplace" para cobrar en nombre de clientes y liquidar separadamente?
- [ ] ¿Cuál es el tiempo real de aprobación y requisitos documentales para afiliación?
- [ ] ¿Cuál es el MDR exacto aplicable para e-commerce B2B en pesos dominicanos?

### Sandbox / Desarrollo
- [ ] ¿El sandbox (`labservicios.cardnet.com.do`) es self-service o requiere solicitud?
- [ ] ¿Se pueden obtener credenciales de sandbox sin completar afiliación de producción?
- [ ] ¿Hay tarjetas de prueba documentadas públicamente (número, CVV, fecha)?

### Tokenización / Recurrentes
- [ ] ¿"Pagos Automáticos" (MOTO_Recurring) requiere aprobación especial del banco? ¿Qué documentos?
- [ ] ¿Existe límite de tokens por comercio o por cliente?
- [ ] ¿CardNet notifica vía webhook cuando un token expira o es reemplazado?
- [ ] ¿Cuáles son los límites de monto para transacciones recurrentes sin 3DS?

### POS / Terminales
- [ ] ¿CardNet despliega terminales Android (Sunmi/PAX) en nuevos afiliados en 2025–2026?
- [ ] ¿Para el protocolo ECR (puerto 7060), cómo se configura la whitelist de IPs desde el portal de afiliados?
- [ ] ¿Se puede usar el protocolo ECR con terminales en múltiples ubicaciones (cadena de tiendas)?
- [ ] ¿Hay documentación de integración Verifone V200c / V400 específica para RD (distinta al ECR de Caja)?

### Webhooks
- [ ] ¿El webhook de CardNet es reintentado si el endpoint falla? ¿Cuántas veces? ¿Con qué delay?
- [ ] ¿El webhook entrega confirmación de `response-code: 00` para todas las transacciones de Botón de Pago?

---

## 7. Recursos y Fuentes

### CardNet
- [Portal de Desarrolladores](https://developers.cardnet.com.do/)
- [REST sin pantalla](https://developers.cardnet.com.do/guias/boton-de-pago/web-sin-pantalla-rest.html)
- [Hosted Page con 3DS](https://developers.cardnet.com.do/guias/boton-de-pago/web-con-pantalla-post-3ds.html)
- [Tokenización & Autenticación](https://developers.cardnet.com.do/guias/tokenizacion-autenticacion/)
- [Integración Caja (ECR)](https://developers.cardnet.com.do/guias/integracion-caja/)
- [Integración POS Android](https://developers.cardnet.com.do/guias/integracion-pos-android/)
- [Tarifario](https://www.cardnet.com.do/tarifario)
- [Soluciones Online](https://www.cardnet.com.do/soluciones/online)

### AZUL
- [Developer Portal](https://dev.azul.com.do/Pages/developer/pages/lib/index.aspx)
- [PHP WooCommerce Gateway (referencia técnica)](https://github.com/lupena/wc-azul-payment-gateway)
- [PHP Gateway Class (referencia técnica)](https://gist.github.com/lupena/8d08ed04b1cb91265cda1d4c887db664)
- [PHP Gateway completo](https://github.com/supermavster/php-azul-payment-gateway)
- [Tarifario AZUL](https://www.azul.com.do/Pages/es/tarifarioAzul.aspx)

### Comparativas RD
- [Pasarelas de Pago en RD — Vendabo](https://vendabo.com/blog/pasarelas-de-pago-republica-dominicana-ecommerce)
- [Guía comparativa 2025 — Nexux](https://nexux.do/pasarelas-de-pago-republica-dominicana-2025/)
- [CardNet en Wispro](https://doc.cloud.wispro.co/docs/republica-dominicana-cardnet)
- [Alegra + AZUL](https://ayuda.alegra.com/int/pagos-en-linea-con-azul)

### VeriFone
- [Verifone Developer Portal (global)](https://developer.verifone.com/)
- [V200c/V400c Installation Guide](https://verifone.cloud/sites/default/files/inline-files/2024-01/doc420_003_en_c_v200c_and_v400c_installation_guide.pdf)
- [CardNet Tutorial POS Verifone](https://www.cardnet.com.do/tutoriales/puntos-de-venta-pos-verifone/)

---

## 8. Lo que No Pudimos Confirmar

| Punto | Estado | Acción recomendada |
|-------|--------|-------------------|
| MDR exacto CardNet para e-commerce | No publicado | Contactar comercial CardNet |
| MDR exacto AZUL para API | No publicado (máx. 6%) | Contactar equipo AZUL |
| Sandbox CardNet — acceso self-service | No confirmado | desarrollo@cardnet.com.do |
| Tarjetas de prueba CardNet | No encontradas públicamente | Solicitar al sandbox |
| Modelo ISV/marketplace CardNet | Sin documentar públicamente | Contactar comercial |
| Terminales Android disponibles en RD 2026 | No confirmado | Pregunta en visita comercial |
| Webhook retry policy CardNet | No documentado | desarrollo@cardnet.com.do |
| AZUL: requisito de certificado para sandbox | Posiblemente aplica | solucionesecommerce@azul.com.do |
| PortalDom (CyberSource) — APIs completas | No investigado en detalle | Si se requiere para Fase 1+ |
| Verifone Cloud global — disponibilidad RD | Probablemente no disponible con CardNet como adquiriente local | Verificar con Verifone regional |

---

*Investigación realizada con documentación pública disponible en mayo 2026. Los precios y condiciones pueden variar — verificar con las pasarelas antes de tomar decisiones de implementación.*
