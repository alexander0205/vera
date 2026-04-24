# API DGII e-CF — Endpoints completos

> Fuente: "Descripción Técnica de Facturación Electrónica" v1.5 (DGII, Mayo 2023)
> Última actualización: 2026-04-22

---

## Ambientes

| Nombre | Código | Propósito |
|--------|--------|-----------|
| Pre-habilitación / Set de Pruebas | `testecf` | Pruebas de habilitación antes de certificarse |
| Certificación | `certecf` | Proceso formal de certificación DGII |
| Producción | `ecf` | Operación real |

---

## 1. DOMINIO PRINCIPAL — `ecf.dgii.gov.do/{ambiente}/`

### Autenticación

| # | Nombre | Método | Endpoint |
|---|--------|--------|----------|
| 1 | Obtener Semilla | GET | `/autenticacion/api/autenticacion/semilla` |
| 2 | Validar Semilla (obtener token) | POST | `/autenticacion/api/autenticacion/validarsemilla` |

**Flujo:**
1. `GET semilla` → devuelve XML con `<valor>` (string aleatorio) y `<fecha>`.
2. Firma el XML con el certificado `.p12` (RSA-SHA256 / XMLDSig).
3. `POST validarsemilla` con el XML firmado como `multipart/form-data` (campo `xml`).
4. Respuesta: `{ token, expira, expedido }`. El token dura **1 hora** — renovar a los ~55 min.

---

### Recepción e-CF (envío a DGII)

| # | Nombre | Método | Endpoint |
|---|--------|--------|----------|
| 3 | Enviar e-CF | POST | `/recepcion/api/facturaselectronicas` |

- **Entrada**: `multipart/form-data`, campo `xml` con el XML del e-CF firmado.
- **Salida**: `{ trackId, error, mensaje }` — respuesta **asincrónica**.
- **Importante**: NO hay envío en lote. Un POST por cada e-CF.

---

### Consulta de resultados

| # | Nombre | Método | Endpoint |
|---|--------|--------|----------|
| 4 | Consultar Estado por TrackId | GET | `/consultaresultado/api/consultas/estado?trackid={trackId}` |
| 5 | Consultar Estado por NCF | GET | `/consultaestado/api/consultas/estado?rncemisor=&ncfelectronico=&rnccomprador=&codigoseguridad=` |
| 6 | Consultar TrackIds de un NCF | GET | `/consultatrackids/api/trackids/consulta?rncemisor=&encf=` |

**Endpoint #4 — estados posibles:**
- `0` = No encontrado
- `1` = Aceptado
- `2` = Rechazado
- `3` = En Proceso
- `4` = Aceptado Condicional

Incluye campo **`secuenciaUtilizada`** (`true`/`false`):
- `false` → el NCF puede reutilizarse si fue rechazado.
- `true` → el NCF queda marcado como consumido aunque sea rechazado.

**Endpoint #5**: Solo disponible en `testecf` y `ecf` (producción). NO en `certecf`.

**Endpoint #6**: Lista todos los trackIds asociados a un e-NCF (útil para rastrear reintentos).

---

### Operaciones sobre e-CF

| # | Nombre | Método | Endpoint |
|---|--------|--------|----------|
| 7 | Aprobación Comercial | POST | `/aprobacioncomercial/api/aprobacioncomercial` |
| 8 | Anulación de e-NCF | POST | `/anulacionrangos/api/operaciones/anularrango` |

- **#7**: XML de tipo ACECF. Respuesta: `1`=Aprobada · `2`=Rechazada.
  - Tipos excluidos de B2B (no requieren aprobación entre contribuyentes): 32, 41, 43, 46, 47.
- **#8**: XML de tipo ANECF. Solo en `testecf` y `ecf`.

---

### Directorio de contribuyentes

| # | Nombre | Método | Endpoint |
|---|--------|--------|----------|
| 9 | Listado completo | GET | `/consultadirectorio/api/consultas/listado` |
| 10 | Por RNC | GET | `/consultadirectorio/api/consultas/obtenerdirectorioporrnc?RNC={rnc}` |

- **#10**: Retorna las URLs de los servicios del contribuyente (para envío B2B directo).

---

### Timbre QR (representación impresa)

| # | Nombre | Método | Endpoint |
|---|--------|--------|----------|
| 11 | Consulta Timbre e-CF (QR) | GET | `/consultatimbre?rncemisor=&rnccomprador=&encf=&fechaemision=&montototal=&fechafirma=&codigoseguridad=` |

- Valida la autenticidad de un e-CF desde el código QR de la representación impresa.

---

## 2. DOMINIO FACTURAS DE CONSUMO — `fc.dgii.gov.do/{ambiente}/`

> **Solo en `testecf` y `ecf` — NO existe en `certecf`**

| # | Nombre | Método | Endpoint |
|---|--------|--------|----------|
| 12 | Enviar RFCE (tipo 32 < DOP 250K) | POST | `/recepcionfc/api/recepcion/ecf` |
| 13 | Consultar RFCE | GET | `/consultarfce/api/Consultas/Consulta?RNC_Emisor=&ENCF=&Cod_Seguridad_eCF=` |
| 14 | Consulta Timbre FC / QR | GET | `/consultatimbrefc?rncemisor=&encf=&montototal=&codigoseguridad=` |

**Endpoint #12 — Respuesta sincrónica** (no usa trackId):
```json
{
  "codigo": "string",
  "estado": "Aceptado | Rechazado | ...",
  "mensajes": ["..."],
  "encf": "E32...",
  "secuenciaUtilizada": true | false
}
```

**Endpoint #13**: Solo disponible en producción (`ecf`).

**Diferencia clave tipo 32:**
- Monto < DOP 250,000 → enviar como RFCE al dominio `fc.dgii.gov.do` (sincrónico).
- Monto ≥ DOP 250,000 → enviar como e-CF normal al dominio `ecf.dgii.gov.do` (asincrónico con trackId).

---

## 3. SERVICIO EMISOR-RECEPTOR — `ecf.dgii.gov.do/testecf/emisorreceptor/`

> **Solo en TesteCF** — Simula la comunicación B2B entre contribuyentes

| # | Nombre | Método | URL completa |
|---|--------|--------|--------------|
| 15 | Auth — Obtener Semilla | GET | `https://ecf.dgii.gov.do/testecf/emisorreceptor/fe/autenticacion/api/semilla` |
| 16 | Auth — Validar Certificado | POST | `https://ecf.dgii.gov.do/testecf/emisorreceptor/fe/autenticacion/api/validacioncertificado` |
| 17 | Emitir Comprobante (a receptor) | POST | `https://ecf.dgii.gov.do/testecf/emisorreceptor/api/emision/emisioncomprobantes` |
| 18 | Consultar Acuse de Recibo | GET | `https://ecf.dgii.gov.do/testecf/emisorreceptor/api/emision/consultaacuserecibo?Rnc=&Encf=` |
| 19 | Enviar Aprobación Comercial | POST | `https://ecf.dgii.gov.do/testecf/emisorreceptor/api/emision/envioaprobacioncomercial` |
| 20 | Recibir Comprobante (como receptor) | POST | `https://ecf.dgii.gov.do/testecf/emisorreceptor/fe/recepcion/api/ecf` |
| 21 | Recibir Aprobación Comercial (como receptor) | POST | `https://ecf.dgii.gov.do/testecf/emisorreceptor/fe/aprobacioncomercial/api/ecf` |

- Tipos **excluidos** del flujo B2B (no van de emisor a receptor): `32, 41, 43, 45, 46, 47`.
- **#20** devuelve ARECF (Acuse de Recibo) firmado digitalmente.
- **#21** devuelve HTTP 200 (satisfactorio) o HTTP 400 (error).

---

## 4. ESTATUS SERVICIOS — `statusecf.dgii.gov.do/`

> **Solo en producción** — Requiere **APIKEY** entregada por la DGII
>
> Header: `Authorization: Apikey XXXXXXXX-XXXXXXXX-XXXX-XXXXXXXXXX`

| # | Nombre | Método | Endpoint |
|---|--------|--------|----------|
| 22 | Obtener Estatus de Servicios | GET | `/api/estatusservicios/obtenerestatus` |
| 23 | Obtener Ventanas de Mantenimiento | GET | `/api/estatusservicios/obtenerventanasmantenimiento` |
| 24 | Verificar Estado (mantenimiento) | GET | `/api/estatusservicios/verificarestado?ambiente={n}` |

**Endpoint #22** — lista todos los servicios con estado por ambiente:
```json
[
  { "servicio": "Autenticación", "estatus": "Disponible", "ambiente": "Produccion" },
  { "servicio": "Recepción", "estatus": "Disponible", "ambiente": "Produccion" },
  { "servicio": "Consulta Resultado", "estatus": "Disponible", "ambiente": "Produccion" },
  { "servicio": "Consulta Estado", "estatus": "Disponible", "ambiente": "Produccion" },
  { "servicio": "Consulta Directorio", "estatus": "Disponible", "ambiente": "Produccion" },
  { "servicio": "Consulta TrackIds", "estatus": "Disponible", "ambiente": "Produccion" },
  { "servicio": "Aprobación Comercial", "estatus": "Disponible", "ambiente": "Produccion" },
  { "servicio": "Anulación Rangos", "estatus": "Disponible", "ambiente": "Produccion" },
  { "servicio": "Recepción FC", "estatus": "Disponible", "ambiente": "Produccion" }
]
```

**Endpoint #24** — parámetro `ambiente`:
- `1` = PreCertificacion
- `2` = Producción
- `3` = Certificación

Respuesta: `{ "estado": "Disponible" | "No Disponible" }`

---

## Resumen de URLs base

| Dominio | TesteCF | CerteCF | Producción |
|---------|---------|---------|------------|
| e-CF principal | `https://ecf.dgii.gov.do/testecf/` | `https://ecf.dgii.gov.do/certecf/` | `https://ecf.dgii.gov.do/ecf/` |
| Facturas Consumo | `https://fc.dgii.gov.do/testecf/` | ❌ No existe | `https://fc.dgii.gov.do/ecf/` |
| Emisor-Receptor | `https://ecf.dgii.gov.do/testecf/emisorreceptor/` | ❌ No existe | ❌ No existe |
| Estatus servicios | — | — | `https://statusecf.dgii.gov.do/` |

---

## Estándar Emisor-Receptor (endpoints propios del contribuyente)

Las páginas 52-60 del PDF documentan los endpoints que **cada contribuyente debe exponer en sus propios servidores** para recibir e-CF de otros contribuyentes (B2B directo). El servicio `emisorreceptor` de TesteCF los simula.

Patrón de URL estandarizado (el host varía por contribuyente):

```
GET  https://{host}/{ambiente}/fe/autenticacion/api/semilla
POST https://{host}/{ambiente}/fe/autenticacion/api/validacioncertificado
POST https://{host}/{ambiente}/fe/recepcion/api/ecf              → devuelve ARECF (XML acuse)
POST https://{host}/{ambiente}/fe/aprobacioncomercial/api/ecf   → HTTP 200 / 400
```

---

## Restricciones de caracteres en XML

En campos `ALFANUM` del XML, los siguientes caracteres deben escaparse:

| Nombre | Carácter | Referencia decimal |
|--------|----------|--------------------|
| quot | `"` | `&#34;` |
| amp | `&` | `&#38;` |
| apos | `'` | `&#39;` |
| lt | `<` | `&#60;` |
| gt | `>` | `&#62;` |

**No incluir tags vacíos** — todo tag sin valor debe omitirse del XML.

## Formato de nombre de archivos XML

| Formato | Nombre de archivo | Ejemplo |
|---------|-------------------|---------|
| e-CF | `RNCEmisor+e-NCF` | `101672919E3100000001.xml` |
| Aprobación Comercial | `RNCComprador+e-NCF` | `101672919E3100000001.xml` |
| Acuse de Recibo | `RNCComprador+e-NCF` | `101672919E3100000001.xml` |
| RFCE (tipo 32 < 250K) | `RNCEmisor+e-NCF` | `101672919E3200000001.xml` |

---

## Pendientes / Cosas por hacer

### ✅ Ya implementado
- [x] Autenticación (semilla + token) — `lib/dgii/auth.ts`
- [x] Envío de e-CF al dominio principal — `app/api/ecf/emitir/route.ts`
- [x] Envío de RFCE (tipo 32 < DOP 250K) — mismo route con lógica diferenciada
- [x] Consulta de estado por TrackId — `app/api/habilitacion/consultar-estados/route.ts`
- [x] Set de pruebas de habilitación (wizard) — `app/(dashboard)/dashboard/habilitacion/`

---

### 🔲 Fase actual / Corto plazo
- [ ] **Anulación de e-NCF** (endpoint #8 — ANECF): permitir que el cliente anule una factura emitida por error desde el dashboard. Necesita generar y firmar el XML tipo ANECF.
- [ ] **Consulta Timbre / QR** (endpoint #11): generar el link del QR correcto en la representación impresa (RI) del e-CF para que el comprador pueda verificarla.
- [ ] **Consulta de TrackIds por NCF** (endpoint #6): útil para reintentos — antes de emitir con un NCF, verificar si ya tiene trackIds previos en la DGII.

---

### 🔲 Mediano plazo
- [ ] **Directorio de contribuyentes** (endpoints #9 y #10): sincronizar periódicamente el directorio DGII para saber qué clientes están habilitados electrónicamente. Necesario para el flujo B2B directo en producción.
- [ ] **Consulta Estado por NCF** (endpoint #5): permitir búsqueda manual de un e-CF por RNC + NCF + código de seguridad desde el panel de administración.
- [ ] **Consulta RFCE** (endpoint #13): consultar el estado de un RFCE ya enviado (solo producción).
- [ ] **Estatus Servicios** (endpoints #22-24): monitorear si la DGII está en mantenimiento antes de intentar enviar. Mostrar aviso al usuario si los servicios están caídos. Requiere APIKEY (se obtiene después de certificarse).

---

### 🔲 Largo plazo (Módulo de Recepción)
- [ ] **Recepción de e-CF de proveedores**: implementar la URL de recepción propia (`/fe/recepcion/api/ecf`) para que los clientes de EmiteDO también puedan *recibir* facturas de sus proveedores dentro de la plataforma.
- [ ] **Aprobación Comercial como receptor** (endpoint #7): una vez implementada la recepción, permitir que el cliente apruebe o rechace facturas tipo 31, 33, 34, 44 recibidas de proveedores. La decisión se registra ante la DGII con un XML tipo ACECF.
- [ ] **Acuse de Recibo (ARECF)**: al recibir un e-CF, generar y devolver automáticamente el XML de acuse al emisor.
- [ ] **Recepción de Aprobación Comercial**: implementar el endpoint propio para recibir la respuesta del receptor cuando tu cliente es el emisor B2B.

---

## Firmado de XML

- Protocolo: **SHA-256**
- El campo `SN` del certificado debe coincidir con el RNC/Cédula/Pasaporte del titular.
- Firmar sin preservación de espacios: `preservewhitespace = false`.
- Una vez firmado, el XML **no puede ser alterado**.
