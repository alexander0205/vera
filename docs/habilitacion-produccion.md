# Habilitación DGII — Flujo completo para producción

Este documento describe paso a paso cómo funciona (o **debe** funcionar) el
proceso de habilitación DGII de punta a cabo cuando el usuario está en el
ambiente **real de producción**, no en modo demo/test.

---

## Los 3 ambientes DGII

Antes de entrar en los pasos, es importante entender los 3 ambientes:

| Ambiente | URL base | Para qué sirve |
|---|---|---|
| **TesteCF** | `https://ecf.dgii.gov.do/testecf` | Ambiente de **pruebas internas del desarrollador** (EmiteDO lo usa para construir/QA). No requiere contribuyente real. |
| **CerteCF** | `https://ecf.dgii.gov.do/certecf` | Ambiente de **certificación por contribuyente**. Aquí es donde cada cliente nuestro hace su habilitación real. Usa su RNC real y cert real. |
| **eCF** | `https://ecf.dgii.gov.do/ecf` | **Producción**. Solo se accede después de que la DGII apruebe la habilitación en CerteCF. Aquí se emiten e-CFs fiscales reales. |

**Proceso completo del cliente:**

```
Cliente firma contrato con EmiteDO
        ↓
(Pre-requisitos: subir RNC, cert P12, datos empresa)
        ↓
Habilitación en CerteCF  ←── Fases 0 a 5 del wizard
        ↓
DGII aprueba
        ↓
Cliente cambia team.dgiiEnvironment = 'eCF'
        ↓
Operación normal en producción (emisión de facturas reales)
```

El wizard de habilitación **siempre corre contra CerteCF**, no contra eCF.
Solo después de aprobado el RNC salta a eCF.

---

## Pre-requisitos (antes de iniciar el wizard)

Antes de que el usuario pueda entrar al wizard de habilitación, debe
completar estas configuraciones en el dashboard:

### A. Datos fiscales del equipo

| Campo | Cómo se captura | Endpoint |
|---|---|---|
| RNC | Formulario `/dashboard/configuracion` | `POST /api/equipo/perfil` |
| Razón social | Autocompleta vía RNC API DGII | `GET /api/rnc/[rnc]` (nuestro cache) |
| Nombre comercial, dirección, provincia, municipio | Manual | `POST /api/equipo/perfil` |
| Email facturación, teléfono, sitio web | Manual | `POST /api/equipo/perfil` |

### B. Certificado digital (P12)

| Paso | Quién lo hace | Endpoint |
|---|---|---|
| Obtener cert en VIAFIRMA / Uanataca | **Usuario** — fuera de EmiteDO | — |
| Subir archivo `.p12` y PIN | Usuario en `/dashboard/certificado` | `POST /api/equipo/certificado` |
| Validación: RNC del cert debe coincidir con RNC del team | EmiteDO automático | (mismo endpoint) |
| Cifrado AES-256-GCM del P12 y PIN | EmiteDO automático | (mismo endpoint) |

### C. Ambiente DGII

`team.dgiiEnvironment` = `'CerteCF'` durante habilitación.
Se cambia a `'eCF'` después de que DGII apruebe (manualmente en base de
datos o vía endpoint admin — ver sección "Transición a producción").

---

## Fase 0 — Postulación

**Objetivo:** Inscribirse formalmente como emisor electrónico ante la DGII.

### Paso 0.1 — Usuario copia datos al portal DGII

- **Quién:** Usuario.
- **EmiteDO hace:** **Nada.** Solo muestra en pantalla los datos a copiar:
  - Tipo de software: `EXTERNO`
  - Nombre del software: `EmiteDO`
  - Versión: `1.6`
  - URL de recepción: `https://api.emitedo.com/api/dgii/{RNC}/recepcion`
  - URL de aprobación comercial: `https://api.emitedo.com/api/dgii/{RNC}/aprobacioncomercial`
  - URL de autenticación: `https://api.emitedo.com/api/dgii/{RNC}/autenticacion`
  - RNC del proveedor (EmiteDO): `132596161`
  - Razón social del proveedor: `Yisrael Technology LLC`
- **DGII hace:** Recibe el formulario en su portal (`https://dgii.gov.do` sección **Emisor Electrónico → CREAR POSTULACIÓN**).
- **Endpoint EmiteDO:** ninguno.
- **Endpoint DGII:** ninguno (el usuario navega el portal).
- **Archivo:** el portal DGII genera y descarga un XML sin firmar llamado **Formulario de Postulación**.

### Paso 0.2 — Firmar el Formulario de Postulación

- **Quién:** Usuario sube el XML; EmiteDO lo firma.
- **EmiteDO hace:**
  - Recibe XML en base64.
  - Descifra el cert P12 del team.
  - Firma con XMLDSig RSA-SHA256 (envelope signature).
  - Devuelve XML firmado en base64 para descarga.
- **DGII hace:** nada todavía.
- **Endpoint EmiteDO:** `POST /api/habilitacion/firmar-xml`
  - Body: `{ xmlBase64, proposito: "postulacion" }`
  - Rate limit: 30 firmas/hora.
- **Endpoint DGII:** ninguno.
- **Archivo:** `postulacion-firmada-{RNC}.xml`

### Paso 0.3 — Usuario sube el XML firmado al portal DGII

- **Quién:** Usuario.
- **EmiteDO hace:** muestra instrucciones; marca un checkbox local `uploadConfirmed = true` en `habilitacion_state`.
- **DGII hace:** valida el XML contra su XSD del Formulario de Postulación. Si está bien formado, acepta la postulación y la pone en cola interna.
- **Endpoint EmiteDO:** `PUT /api/habilitacion/state` (solo para persistir el checkbox).
- **Endpoint DGII:** ninguno directo (todo pasa en el portal web del usuario).
- **Archivo:** el XML firmado del paso anterior.

### Paso 0.4 — Esperar aprobación de DGII

- **Quién:** DGII procesa (1 a 3 días hábiles).
- **EmiteDO hace actualmente:** simula una espera de 8 segundos (`WaitForDgii`) y luego permite avanzar. **Esto es un demo — no es real.**
- **EmiteDO debería hacer en producción:**
  - Opción A (recomendada): **polling pasivo por email.** El usuario recibe un correo de DGII cuando su postulación es aprobada. El usuario regresa al wizard y marca la casilla "DGII ya me respondió".
  - Opción B (si la DGII publica un endpoint de consulta de estatus de postulación): `GET {CerteCF_URL}/autenticacion/api/Postulacion/Estado?rnc={RNC}` — **verificar si este endpoint existe**; hoy no está documentado en `lib/dgii/client.ts`.
- **Endpoint DGII (si se implementa polling):** por definir.

**Estado persistido al completar Fase 0:**
```json
{
  "fase": 1,
  "postulacion": {
    "xmlFirmadoDataUrl": "...",
    "xmlFirmadoName": "postulacion-firmada-{rnc}.xml",
    "uploadConfirmed": true,
    "validado": true
  }
}
```

---

## Fase 1 — Set de Pruebas (emisión de e-CFs reales)

**Objetivo:** Emitir el conjunto obligatorio de comprobantes de prueba que
la DGII define en su "Set de Pruebas" para validar que el software emisor
funciona correctamente.

**Esto es la única fase 100% automatizada hoy.**

### Emisiones requeridas por tanda

| Tanda | Tipos e-CF | Cantidad por tipo |
|---|---|---|
| 1 (básicos) | 31, 32 ≥RD$250K, 41, 43, 44, 45, 46, 47 | 4 del tipo 31, 2 de cada uno de los demás |
| 2 (notas) | 33 (nota débito), 34 (nota crédito) | 1 del 33, 2 del 34 |
| 3 (RFCE <RD$250K) | 32 de consumo pequeño (formato Resumen) | 4 |

### Para cada e-CF del Set de Pruebas

- **Quién:** EmiteDO automático desde el wizard.
- **EmiteDO hace:**
  1. Genera e-NCF **hardcodeado** (E310000001000, E310000001001, …)
     — no consume la secuencia real del equipo.
  2. Construye XML e-CF con `buildEcfXml` (los 10 tipos).
  3. Firma con el cert P12 del team → XMLDSig.
  4. Obtiene token DGII si no tiene o expiró:
     - `GET {CerteCF}/autenticacion/api/Autenticacion/Semilla`
     - Firma la semilla localmente.
     - `POST {CerteCF}/autenticacion/api/Autenticacion/ValidarSemilla`
     - Guarda token JWT (~55 min).
  5. Envía el e-CF a DGII:
     - Tipos 31, 33, 34, 41, 43, 44, 45, 46, 47 y 32 ≥250K: `POST {CerteCF}/recepcion/api/facturaselectronicas`
     - Tipos 32 <250K: `POST {CerteCF_FC}/recepcionfc/api/recepcion/ecf` (RFCE — Resumen de Facturas de Consumo)
  6. DGII responde con `trackId` + estado inicial.
  7. EmiteDO guarda el `trackId` en `habilitacion_state.pruebas.trackIds`.
- **DGII hace:**
  - Recibe el XML firmado.
  - Valida firma digital.
  - Valida contra XSD del tipo correspondiente.
  - Valida reglas de negocio (RNC emisor habilitado, rangos correctos, etc.).
  - Devuelve estado: `En Proceso` → `Aceptado` | `AceptadoCondicional` | `Rechazado`.
- **Endpoint EmiteDO (interno):** `POST /api/ecf/emitir` con `encfOverride` para usar NCFs hardcodeados.
- **Endpoint DGII:** los 3 listados arriba.
- **Archivo enviado:** XML firmado (multipart/form-data con campo `xml`).

### Validación de respuestas DGII

- **Quién:** EmiteDO podría consultar estatus final por cada trackId:
  - `GET {CerteCF}/consultaresultado/api/ConsultaResultado/TrackId/{trackId}`
  - Devuelve: `{ estado, mensajes, codigoSeguridad, ... }`
- **EmiteDO hace actualmente:** guarda el estado inicial devuelto y pone `WaitForDgii` 8 s simulado.
- **EmiteDO debería hacer en producción:** polling real a `trackid/{trackId}` hasta que `estado !== 'En Proceso'` para confirmar aceptación.

**Estado persistido al completar Fase 1:**
```json
{
  "fase": 2,
  "pruebas": {
    "emitidas": { "31": 4, "32g": 2, "32r": 4, "33": 1, "34": 2, "41": 2, "43": 2, "44": 2, "45": 2, "46": 2, "47": 2 },
    "trackIds": [ { "tipo": "31", "encf": "E310000001000", "trackId": "..." }, ... ],
    "fc250Done": true,
    "confirmed": true
  }
}
```

---

## Fase 2 — Representaciones impresas

**Objetivo:** Entregar a la DGII muestras impresas (PDF) del formato visual
de cada tipo de e-CF para que validen que cumplen las especificaciones de
diseño.

### Paso 2.1 — Descargar PDFs

- **Quién:** Usuario.
- **EmiteDO hace actualmente:** ofrece 11 PDFs estáticos pre-diseñados (genéricos).
- **EmiteDO debería hacer en producción:** generar PDFs **dinámicos** con los e-CFs reales emitidos en Fase 1 (usando `GET /api/pdf/factura/[id]` con los trackIds guardados).
- **Endpoint EmiteDO:** `GET /api/pdf/factura/[id]` (uno por cada e-CF del Set de Pruebas).
- **Endpoint DGII:** ninguno.
- **Archivo:** 11 PDFs nombrados por tipo (31, 32a, 32b, 33, 34, 41, 43, 44, 45, 46, 47).

### Paso 2.2 — Usuario sube los PDFs al portal DGII

- **Quién:** Usuario.
- **EmiteDO hace:** nada (solo marca checkbox local).
- **DGII hace:** valida manualmente (personal DGII revisa que los PDFs cumplan el formato oficial).
- **Endpoint EmiteDO:** `PUT /api/habilitacion/state`.
- **Endpoint DGII:** ninguno.

**Estado persistido al completar Fase 2:**
```json
{
  "fase": 3,
  "representaciones": {
    "downloaded": ["31","32a","32b","33","34","41","43","44","45","46","47"],
    "uploadConfirmed": true,
    "validado": true
  }
}
```

---

## Fase 3 — URLs de Producción

**Objetivo:** Confirmar que las URLs de los endpoints webhook públicos
(recepción, aprobación comercial, autenticación) están registradas en el
portal DGII y responden correctamente.

### Paso 3.1 — Verificación de endpoints públicos

- **Quién:** EmiteDO puede verificar que sus propios endpoints responden (salud automática).
- **EmiteDO hace actualmente:** muestra las 3 URLs para que el usuario las confirme en el portal DGII.
- **EmiteDO debería hacer en producción:** self-check antes de continuar — `HEAD` a sus propias URLs para confirmar que están desplegadas:
  - `HEAD https://api.emitedo.com/api/dgii/{RNC}/autenticacion` → debe devolver 200.
  - `HEAD https://api.emitedo.com/api/dgii/{RNC}/recepcion` → 200 o 405.
  - `HEAD https://api.emitedo.com/api/dgii/{RNC}/aprobacioncomercial` → 200 o 405.
- **DGII hace:** durante habilitación la DGII hace ping a estos endpoints para verificar conectividad.
- **Endpoint EmiteDO (público):**
  - `GET /api/dgii/{rnc}/autenticacion` → healthcheck + datos del team.
  - `POST /api/dgii/{rnc}/recepcion` → recibe e-CFs entrantes.
  - `POST /api/dgii/{rnc}/aprobacioncomercial` → recibe ACECFs entrantes.
- **Endpoint DGII:** ninguno saliente. DGII es la que nos hace HTTP a estas URLs.
- **Archivo:** ninguno.

**Estado persistido al completar Fase 3:**
```json
{
  "fase": 4,
  "urlsProduccion": { "confirmado": true }
}
```

---

## Fase 4 — Declaración Jurada

**Objetivo:** Firmar la Declaración Jurada final de cumplimiento y
enviarla a la DGII.

### Paso 4.1 — Descargar plantilla desde portal DGII

- **Quién:** Usuario (desde portal DGII).
- **EmiteDO hace:** nada.
- **DGII hace:** entrega XML sin firmar con los datos de la postulación.
- **Archivo:** `declaracion-jurada-{RNC}.xml` (sin firmar).

### Paso 4.2 — Firmar la Declaración Jurada

- **Quién:** Usuario sube XML; EmiteDO lo firma.
- **EmiteDO hace:** idéntico al paso 0.2 pero con `rootElement: "DeclaracionJurada"` y `proposito: "declaracion-jurada"`.
- **DGII hace:** nada todavía.
- **Endpoint EmiteDO:** `POST /api/habilitacion/firmar-xml`
  - Body: `{ xmlBase64, proposito: "declaracion-jurada" }`
- **Endpoint DGII:** ninguno.
- **Archivo:** `declaracion-jurada-firmada-{RNC}.xml`

### Paso 4.3 — Usuario sube la declaración firmada al portal DGII

- **Quién:** Usuario.
- **EmiteDO hace:** marca checkbox local.
- **DGII hace:** recibe la declaración, la registra como compromiso formal del contribuyente, y autoriza internamente al RNC como emisor electrónico certificado.
- **Endpoint EmiteDO:** `PUT /api/habilitacion/state`.
- **Endpoint DGII:** ninguno directo.

### Paso 4.4 — Verificación final del RNC

- **Quién:** EmiteDO puede verificar que el RNC ya aparece como emisor certificado en el directorio DGII.
- **EmiteDO hace actualmente:** simula 5 segundos de espera.
- **EmiteDO debería hacer en producción:**
  - `GET {CerteCF}/emisorreceptor/api/EmisorReceptor/{RNC}` — si responde 200 con datos del emisor, la habilitación está completa.
  - Este endpoint ya existe en `lib/dgii/client.ts` como `consultarEmisorReceptor`.

**Estado persistido al completar Fase 4:**
```json
{
  "fase": 5,
  "declaracionJurada": {
    "xmlFirmadoDataUrl": "...",
    "xmlFirmadoName": "declaracion-jurada-firmada-{rnc}.xml",
    "enviado": true,
    "verificado": true
  }
}
```

---

## Fase 5 — Finalizado

**Objetivo:** Cerrar el wizard y marcar el team como habilitado.

- **Quién:** Usuario confirma.
- **EmiteDO hace:**
  - `PUT /api/habilitacion/state` con `finalizado.acknowledged = true`.
  - `UPDATE teams SET habilitacionCompletadoAt = NOW()`.
  - **Importante:** cambia `team.dgiiEnvironment` de `CerteCF` a `eCF`.
    (Hoy no lo hace automáticamente — debe hacerse manual o vía endpoint admin.)
- **DGII hace:** nada (ya está aprobado).
- **Endpoint EmiteDO:** `PUT /api/habilitacion/state` + `PUT /api/equipo/perfil` (para cambiar ambiente).
- **Endpoint DGII:** ninguno.

**Estado final:**
```json
{
  "fase": 5,
  "finalizado": { "acknowledged": true }
}
```
```sql
UPDATE teams
SET dgii_environment = 'eCF',
    habilitacion_completado_at = NOW()
WHERE id = {teamId};
```

---

## Después de la habilitación (operación normal)

Una vez el team está en `dgiiEnvironment = 'eCF'`, la operación diaria es:

### Emitir factura

1. Usuario llena formulario en `/dashboard/facturas/nueva`.
2. `POST /api/ecf/emitir`:
   - Valida plan (`planLimit !== -1 && monthlyCount >= planLimit`).
   - Obtiene próximo NCF desde tabla `sequences`.
   - Construye XML → firma → envía.
3. DGII responde con trackId.
4. Polling o espera de ACECF.

### Endpoints DGII usados en producción diaria

| Endpoint | Método | Para qué |
|---|---|---|
| `/autenticacion/api/Autenticacion/Semilla` | GET | Obtener semilla |
| `/autenticacion/api/Autenticacion/ValidarSemilla` | POST | Obtener token JWT |
| `/recepcion/api/facturaselectronicas` | POST | Enviar e-CF tipos 31, 33, 34, 41, 43, 44, 45 |
| `/recepcion/api/facturaselectronicas` | POST | Enviar e-CF tipos 46, 47 (exportación / exterior) |
| `/recepcionfc/api/recepcion/ecf` | POST | Enviar RFCE (tipo 32 <RD$250K) |
| `/consultaresultado/api/ConsultaResultado/TrackId/{trackId}` | GET | Consultar estatus |
| `/consultaresultado/api/ConsultaResultado/Estado/{rnc}/{encf}` | GET | Consultar por eNCF |
| `/emisorreceptor/api/EmisorReceptor/{RNC}` | GET | Directorio de emisores |

### Webhooks entrantes (DGII nos llama a nosotros)

| Endpoint EmiteDO | Quién llama | Propósito |
|---|---|---|
| `POST /api/dgii/{rnc}/recepcion` | DGII | Reenvía e-CFs que otros emisores nos mandan |
| `POST /api/dgii/{rnc}/aprobacioncomercial` | DGII | Reenvía ACECFs cuando un comprador aprueba/rechaza nuestros e-CFs |
| `GET /api/dgii/{rnc}/autenticacion` | DGII | Healthcheck |

---

## Brechas actuales para "producción 100%"

Para cumplir el criterio "nada test, todo producción real", estas son las
correcciones pendientes:

| Brecha | Dónde | Impacto | Fix |
|---|---|---|---|
| Fase 0.4 espera 8 s simulada | `WaitForDgii` en `PhasePostulacion` | Usuario avanza sin que DGII haya aprobado | Reemplazar por instrucción "regresa cuando recibas correo de DGII" + botón "Ya recibí la confirmación" |
| Fase 1 no consulta estado final | Después de emitir cada e-CF | Se guardan trackIds pero no sabemos si DGII los aceptó | Polling a `consultaresultado/api/ConsultaResultado/TrackId/{trackId}` |
| Fase 2 usa PDFs estáticos | Descargas en `PhaseImpresa` | DGII recibe muestras genéricas en vez de las facturas reales del Set de Pruebas | Generar PDFs dinámicos usando `GET /api/pdf/factura/[id]` con los `documentoId` del Set |
| Fase 3 no hace self-check | `PhaseUrls` | Si alguna URL está caída, el usuario avanza igualmente | `HEAD` a las 3 URLs antes de permitir avanzar |
| Fase 4.4 no verifica RNC en directorio DGII | `WaitForDgii` en `PhaseDeclaracionJurada` | Usuario cree que está habilitado sin estarlo | `GET emisorreceptor/{RNC}` → 200 = habilitado |
| Fase 5 no cambia ambiente automáticamente | `PhaseFinalizado` | Team queda en CerteCF aunque diga "completado" | `PUT /api/equipo/perfil { dgiiEnvironment: 'eCF' }` como parte de `completePhase(5)` |
| Webhooks no validan firma de DGII | `/api/dgii/{rnc}/*` | Confía 100% en HTTPS — un atacante con acceso a red podría inyectar e-CFs falsos | Validar firma XMLDSig del XML entrante antes de aceptarlo |
| Set de Pruebas re-emite al reiniciar | Wizard carece de "checkpoint" | Si el usuario refresca durante Fase 1, podría duplicar NCFs hardcodeados | Verificar trackIds ya guardados antes de reintentar emisión |

---

## Endpoints EmiteDO involucrados (resumen)

### Autenticados (solo el dueño del team)

| Método + Path | Propósito |
|---|---|
| `GET /api/habilitacion/state` | Cargar estado del wizard |
| `PUT /api/habilitacion/state` | Persistir avance del wizard |
| `DELETE /api/habilitacion/state` | Reiniciar wizard (dev) |
| `POST /api/habilitacion/firmar-xml` | Firmar cualquier XML (postulación o declaración jurada) |
| `POST /api/ecf/emitir` | Emitir e-CF (con `encfOverride` para habilitación) |
| `GET /api/pdf/factura/{id}` | PDF de cualquier e-CF del team |
| `POST /api/equipo/certificado` | Subir cert P12 |
| `POST /api/equipo/perfil` | Actualizar datos + ambiente DGII |

### Públicos (DGII u otros contribuyentes llaman)

| Método + Path | Propósito |
|---|---|
| `GET /api/dgii/{rnc}/autenticacion` | Healthcheck / descubrimiento |
| `HEAD /api/dgii/{rnc}/autenticacion` | Ping ligero |
| `POST /api/dgii/{rnc}/recepcion` | Recibir e-CFs de terceros |
| `POST /api/dgii/{rnc}/aprobacioncomercial` | Recibir ACECFs (aprobación/rechazo comercial) |

### Endpoints DGII (los llama nuestro `DgiiClient`)

Ambiente `CerteCF` durante habilitación | `eCF` en producción.

| Método + Path | Propósito |
|---|---|
| `GET {base}/autenticacion/api/Autenticacion/Semilla` | Obtener semilla |
| `POST {base}/autenticacion/api/Autenticacion/ValidarSemilla` | Obtener JWT |
| `POST {base}/recepcion/api/facturaselectronicas` | Enviar e-CF |
| `POST {base_fc}/recepcionfc/api/recepcion/ecf` | Enviar RFCE (<250K) |
| `GET {base}/consultaresultado/api/ConsultaResultado/TrackId/{trackId}` | Estatus por trackId |
| `GET {base}/consultaresultado/api/ConsultaResultado/Estado/{rnc}/{encf}` | Estatus por eNCF |
| `GET {base}/emisorreceptor/api/EmisorReceptor/{RNC}` | Directorio |

---

## Resumen de 1 línea por fase (producción real)

| Fase | Usuario | EmiteDO | DGII |
|---|---|---|---|
| 0 | Llena portal, descarga XML | Firma XML con cert | Recibe en portal, valida formato, aprueba (días) |
| 1 | Ingresa datos de prueba | Emite 27 e-CFs reales vía API | Valida cada uno, devuelve trackIds |
| 2 | Descarga PDFs, sube al portal | Genera PDFs dinámicos con e-CFs del Set | Valida formato visual manual |
| 3 | Confirma URLs en portal | Self-check de sus endpoints | Hace ping a nuestras URLs |
| 4 | Descarga Declaración, sube firmada | Firma XML, verifica directorio DGII | Registra compromiso, autoriza RNC |
| 5 | Acepta cierre | Cambia `dgiiEnvironment` a `eCF` | — |
