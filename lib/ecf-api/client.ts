/**
 * Cliente HTTP para ECF API — proveedor de NCF electrónicos.
 * Todas las llamadas se hacen server-side; la API key nunca sale al cliente.
 *
 * Tipos sincronizados con ecf-api.json (OpenAPI spec).
 */

const BASE_URL = process.env.ECF_API_URL!;
const API_KEY  = process.env.ECF_API_KEY!;

// ─── Helpers HTTP ────────────────────────────────────────────────────────────

async function requestForm<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY }, // sin Content-Type — fetch pone el boundary
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new EcfApiError(res.status, text);
  }
  return res.json() as Promise<T>;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new EcfApiError(res.status, text);
  }

  return res.json() as Promise<T>;
}

/**
 * Request que devuelve el Response crudo (para descargas binarias: ZIP, PDF).
 * El caller lee `.arrayBuffer()` / `.blob()` y propaga headers.
 */
async function requestRaw(method: string, path: string): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'X-Api-Key': API_KEY },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new EcfApiError(res.status, text);
  }
  return res;
}

/** POST multipart que devuelve Response crudo. */
async function requestFormRaw(path: string, formData: FormData): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new EcfApiError(res.status, text);
  }
  return res;
}

/**
 * Detalle DGII upstream cuando ecf-api propaga rechazo de la DGII.
 * Aparece bajo `err.dgii` cuando el error vino del servicio DGII.
 */
export interface EcfApiDgiiDetail {
  estado?:  'Aceptado' | 'Rechazado' | 'AceptadoCondicional' | string;
  codigo?:  number;
  mensajes?: Array<{ codigo?: string; valor?: string }>;
  dgiiRaw?:  { status?: number; url?: string; data?: unknown };
}

/**
 * Body estandarizado de error de ecf-api (>= v3 release).
 *
 * El `code` es machine-readable y estable (ej `ECFA_NCF_DUPLICADO`,
 * `ECFA_CERT_EXPIRED`). El `message` es human-readable y puede cambiar
 * de versión a versión — NO matchear por string.
 */
export interface EcfApiErrorBody {
  statusCode?: number;
  code?:       string;
  message?:    string | string[];
  error?:      string;
  // Contexto adicional según código:
  rnc?:        string;
  eNcf?:       string;
  formato?:    string;
  dgii?:       EcfApiDgiiDetail;
  [k: string]: unknown;
}

export class EcfApiError extends Error {
  /** Código machine-readable del error (ej `ECFA_NCF_DUPLICADO`). null si el body no es JSON parseable. */
  public readonly code: string | null;
  /** Body parseado del error si era JSON; null si era texto plano. */
  public readonly body: EcfApiErrorBody | null;
  /** Detalle DGII upstream cuando aplica. */
  public readonly dgii: EcfApiDgiiDetail | null;

  constructor(public status: number, message: string) {
    super(message);
    this.name = 'EcfApiError';

    // Intentar parsear el body como JSON estándar de ecf-api
    let parsed: EcfApiErrorBody | null = null;
    try {
      parsed = JSON.parse(message);
    } catch { /* texto plano, deja null */ }
    this.body = parsed;
    this.code = parsed?.code ?? null;
    this.dgii = parsed?.dgii ?? null;
  }

  /** Mensaje human-readable (sin stack/JSON). Útil para logs. */
  get humanMessage(): string {
    if (!this.body) return this.message;
    const m = this.body.message;
    if (Array.isArray(m)) return m.join('. ');
    return m ?? this.body.error ?? this.message;
  }
}

// ─── Enums compartidos ────────────────────────────────────────────────────────

export type AmbienteEcf = 'TesteCF' | 'CerteCF' | 'Produccion';

export type EstadoEmision =
  | 'PENDIENTE'
  | 'ENVIADO'
  | 'ACEPTADO'
  | 'ACEPTADO_CONDICIONAL'
  | 'RECHAZADO'
  | 'ERROR';

export type FormatoEmision = 'RFCE' | 'ECF';

// ─── Contribuyentes ───────────────────────────────────────────────────────────

export interface ContribuyenteResponseDto {
  rnc:          string;
  codigoPublico: string;
  nombre:       string;
  ambiente:     AmbienteEcf;
  activo:       boolean;
  empresaId:    string;
  createdAt:    string;
  updatedAt:    string;
  urlsDgii:     UrlsDgiiDto;
}

export interface UrlsDgiiDto {
  /** URL base (sin https://) para registrar en el formulario de postulación DGII. */
  webhookBaseUrl: string;
}

export interface CreateContribuyenteDto {
  rnc:             string;
  nombre:          string;
  /** Max 100 chars. Debe coincidir con la dirección registrada en DGII para el RNC. */
  direccion:       string;
  nombreComercial?: string;
  telefono?:       string;
  /** Código de provincia según catálogo DGII. Ej: "01" (Distrito Nacional). */
  provincia?:      string;
  /** Código de municipio según catálogo DGII. Ej: "01001". */
  municipio?:      string;
  /** Default: "TesteCF" */
  ambiente?:       AmbienteEcf;
}

export interface UpdateContribuyenteDto {
  nombre?:          string;
  ambiente?:        AmbienteEcf;
  activo?:          boolean;
  nombreComercial?: string;
  direccion?:       string;
  provincia?:       string;
  municipio?:       string;
  telefono?:        string;
}

export const contribuyentes = {
  list: () =>
    request<ContribuyenteResponseDto[]>('GET', '/contribuyentes'),

  create: (dto: CreateContribuyenteDto) =>
    request<ContribuyenteResponseDto>('POST', '/contribuyentes', dto),

  get: (codigoPublico: string) =>
    request<ContribuyenteResponseDto>('GET', `/contribuyentes/${codigoPublico}`),

  update: (codigoPublico: string, dto: UpdateContribuyenteDto) =>
    request<ContribuyenteResponseDto>('PATCH', `/contribuyentes/${codigoPublico}`, dto),

  /** Firma cualquier XML DGII (postulación, declaración jurada, ECF, etc.) */
  firmaXml: (codigoPublico: string, dto: FirmarXmlDto) =>
    request<FirmarXmlResponseDto>('POST', `/contribuyentes/${codigoPublico}/firma-xml`, dto),

  /** Verifica si el contribuyente tiene P12 activo y puede firmar */
  estadoFirma: (codigoPublico: string) =>
    request<FirmaXmlEstadoDto>('GET', `/contribuyentes/${codigoPublico}/firma-xml`),

  /** Revoca el certificado P12 activo (para reemplazarlo por uno nuevo) */
  revocarCertificadoActivo: (codigoPublico: string) =>
    request<FirmaXmlRevocarResponseDto>('DELETE', `/contribuyentes/${codigoPublico}/firma-xml`),
};

// ─── Firma XML ───────────────────────────────────────────────────────────────

/**
 * Tipos de documento DGII soportados por ecf-api para firma.
 * Si se omite `tipoDocumento`, ecf-api lo auto-detecta del XML.
 */
export type TipoDocumentoFirma =
  | 'Postulacion'
  | 'DeclaracionJurada'
  | 'ECF'
  | 'RFCE'
  | 'ANECF'
  | 'ACECF'
  | 'ARECF'
  | 'SemillaModel';

export interface FirmarXmlDto {
  /** XML sin firmar en base64. */
  xmlBase64: string;
  /**
   * Tipo de documento DGII. Opcional — si se omite ecf-api lo auto-detecta.
   * Determina el elemento raíz que se firma y el nombre de archivo sugerido.
   */
  tipoDocumento?: TipoDocumentoFirma;
}

export interface FirmarXmlResponseDto {
  /** XML firmado en base64. Decodificar con Buffer.from(v, 'base64'). */
  xmlFirmadoBase64: string;
  /** Nombre de archivo sugerido para la descarga. */
  nombreArchivo:    string;
  rnc:              string;
  subject?:         string | null;
}

/** Respuesta de GET /contribuyentes/{id}/firma-xml */
export interface FirmaXmlEstadoDto {
  /** true si hay un P12 activo listo para firmar */
  puedeFiremar:   boolean;
  rnc:            string;
  certificadoId?: string | null;
  subject?:       string | null;
  validTo?:       string | null;
}

/** Respuesta de DELETE /contribuyentes/{id}/firma-xml */
export interface FirmaXmlRevocarResponseDto {
  rnc:           string;
  certificadoId: string;
  mensaje:       string;
}

// ─── Rangos NCF ───────────────────────────────────────────────────────────────

export interface NcfRangoResponseDto {
  id:                  string;
  rnc:                 string;
  tipoComprobante:     string;
  serie:               string;
  desde:               number;
  hasta:               number;
  siguiente:           number;
  /** e-NCF formateado que se asignará en la próxima emisión. Ej: "E310000000523" */
  siguienteENCF:       string;
  /** NCFs disponibles restantes en este rango (hasta − siguiente + 1) */
  capacidadDisponible: number;
  /** Porcentaje del rango ya utilizado (0–100, 2 decimales) */
  pctUtilizado:        number;
  fechaVencimiento:    string;
  activo:              boolean;
  createdAt:           string;
  updatedAt:           string;
}

export interface RegisterNcfRangoDto {
  /** Tipo de comprobante DGII (2 dígitos). Ver /catalogos/tipos-comprobante. */
  tipoComprobante:  string;
  desde:            number;
  hasta:            number;
  /** ISO 8601. Debe estar en el futuro. */
  fechaVencimiento: string;
  /** Default: "E" */
  serie?:           string;
}

export const ncfRangos = {
  list: (codigoPublico: string) =>
    request<NcfRangoResponseDto[]>('GET', `/contribuyentes/${codigoPublico}/ncf-rangos`),

  create: (codigoPublico: string, dto: RegisterNcfRangoDto) =>
    request<NcfRangoResponseDto>('POST', `/contribuyentes/${codigoPublico}/ncf-rangos`, dto),
};

// ─── Certificados ────────────────────────────────────────────────────────────

export interface CertificateResponseDto {
  id:         string;
  rnc:        string;
  /** String formato "CN=xxx, O=yyy, C=DO" o null */
  subject:    string | null;
  /** String formato "CN=xxx, O=yyy, C=DO" o null */
  issuer:     string | null;
  validFrom:  string;
  validTo:    string;
  /** Solo un certificado por RNC puede estar activo a la vez. */
  activo:     boolean;
  revocadoEn: string | null;
  createdAt:  string;
}

export const certificados = {
  list: (codigoPublico: string) =>
    request<CertificateResponseDto[]>('GET', `/contribuyentes/${codigoPublico}/certificates`),

  upload: (codigoPublico: string, p12Buffer: Buffer, password: string) => {
    const form = new FormData();
    form.append('file', new Blob([p12Buffer], { type: 'application/x-pkcs12' }), 'certificado.p12');
    form.append('password', password);
    return requestForm<CertificateResponseDto>(`/contribuyentes/${codigoPublico}/certificates`, form);
  },

  /** Revoca un certificado específico por ID */
  revoke: (certId: string) =>
    request<CertificateResponseDto>('DELETE', `/certificates/${certId}`),
};

// ─── Emisión e-CF ─────────────────────────────────────────────────────────────

export interface EmisionResponseDto {
  id:              string;
  rnc:             string;
  /** e-NCF asignado (13 chars). Ej: "E320000000001" */
  eNcf:            string;
  /** Tipo de comprobante (2 dígitos). Ej: "32" */
  tipoComprobante: string;
  formato:         FormatoEmision;
  /** Ambiente DGII bajo el que se emitió (TesteCF/CerteCF/Produccion) */
  ambiente?:       AmbienteEcf;
  estado:          EstadoEmision;
  trackId:         string | null;
  /** Código de seguridad de 6 chars alfanumérico */
  codigoSeguridad: string | null;
  /** Fecha + hora de la firma digital aplicada por ecf-api. Formato "dd-MM-yyyy HH:mm:ss" */
  fechaHoraFirma?: string | null;
  /** URL completa DGII portal de verificación (consultatimbre) — devuelta por ecf-api */
  urlVerificacion?: string | null;
  /** URL para el QR code (igual a urlVerificacion) */
  qrCodeData?: string | null;
  fechaEmision:    string;
  montoTotal:      number;
  mensajesDgii:    Record<string, unknown> | null;
  /** URL al PDF de representación impresa generado por ecf-api (3rd party PDF). */
  urlPdf?:         string | null;
  /** URL al XML firmado descargable. */
  urlXml?:         string | null;
  /** XML firmado raw embebido (útil para auditoría). */
  xmlFirmado?:     string | null;
  /** URL del endpoint que consulta el estado en DGII. */
  urlEstadoDgii?:  string | null;
  createdAt:       string;
}

export const emision = {
  list: (codigoPublico: string, limit?: number) =>
    request<EmisionResponseDto[]>(
      'GET',
      `/contribuyentes/${codigoPublico}/emisiones${limit ? `?limit=${limit}` : ''}`,
    ),

  /** Endpoint unificado nuevo: POST /contribuyentes/:cp/emisiones/emitir */
  emitirUnified: (codigoPublico: string, dto: unknown, extraHeaders?: Record<string, string>) =>
    request<EmisionResponseDto>('POST', `/contribuyentes/${codigoPublico}/emisiones/emitir`, dto, extraHeaders),

  /**
   * @deprecated Legacy path `/contribuyentes/:cp/emision/ecf{tipo}` — returns 404 in production ecf-api.
   * Use `emitirUnified()` instead. Kept only for backward compatibility; emits a runtime warning.
   */
  emitir: (codigoPublico: string, tipo: string, dto: unknown, extraHeaders?: Record<string, string>) => {
    console.warn(
      `[ecf-api] DEPRECATED: emision.emitir() uses legacy path /emision/ecf${tipo}. ` +
      `Switch to emision.emitirUnified() (POST /emisiones/emitir).`,
    );
    return request<EmisionResponseDto>('POST', `/contribuyentes/${codigoPublico}/emision/ecf${tipo}`, dto, extraHeaders);
  },

  /**
   * @deprecated Legacy path `/contribuyentes/:cp/emision/rfce32` — returns 404 in production ecf-api.
   * Use `emitirUnified()` instead. Kept only for backward compatibility.
   */
  emitirRfce32: (codigoPublico: string, dto: unknown, extraHeaders?: Record<string, string>) => {
    console.warn(
      `[ecf-api] DEPRECATED: emision.emitirRfce32() uses legacy path /emision/rfce32. ` +
      `Switch to emision.emitirUnified() (POST /emisiones/emitir).`,
    );
    return request<EmisionResponseDto>('POST', `/contribuyentes/${codigoPublico}/emision/rfce32`, dto, extraHeaders);
  },

  consultarEstado: (emisionId: string) =>
    request<EmisionResponseDto>('GET', `/emisiones/${emisionId}/estado-dgii`),

  get: (emisionId: string) =>
    request<EmisionResponseDto>('GET', `/emisiones/${emisionId}`),
};

// ─── Recepciones e-CF (documentos entrantes de otros contribuyentes) ─────────

export interface RecepcionEcfDto {
  id:           string;
  rnc:          string;
  rncEmisor?:   string;
  eNcf:         string;
  tipoComprobante: string;
  estado?:      string;
  fechaRecepcion?: string;
  xmlOriginal?: string;
  arecfXml?:    string;
  createdAt:    string;
  [k: string]: unknown;
}

export interface AprobacionRecibidaDto {
  id:           string;
  rnc:          string;
  eNcf:         string;
  tipoComprobante: string;
  estado?:      string;
  fechaRecepcion?: string;
  xmlOriginal?: string;
  createdAt:    string;
  [k: string]: unknown;
}

export const recepciones = {
  /** Lista e-CFs entrantes (alguien nos emitió). */
  listEcf: (codigoPublico: string) =>
    request<RecepcionEcfDto[]>('GET', `/contribuyentes/${codigoPublico}/recepciones-ecf`),

  /** Detalle (incluye XML emisor + ARECF nuestro). */
  getEcf: (codigoPublico: string, id: string) =>
    request<RecepcionEcfDto>('GET', `/contribuyentes/${codigoPublico}/recepciones-ecf/${id}`),

  /** Lista ACECFs entrantes (aprobaciones comerciales recibidas). */
  listAprobaciones: (codigoPublico: string) =>
    request<AprobacionRecibidaDto[]>('GET', `/contribuyentes/${codigoPublico}/aprobaciones-recibidas`),

  /** Detalle de aprobación recibida. */
  getAprobacion: (codigoPublico: string, id: string) =>
    request<AprobacionRecibidaDto>('GET', `/contribuyentes/${codigoPublico}/aprobaciones-recibidas/${id}`),
};

// ─── Schemas e-CF (campos requeridos por tipo, fuente DGII) ──────────────────

export interface EcfSchemaTipoSummary {
  tipo:        string;
  nombre?:     string;
  requiredCount?: number;
  optionalCount?: number;
}

export interface EcfSchemaField {
  dgiiNo?:          string;
  xmlTag?:          string;
  payloadKey?:      string;
  maxLength?:       number;
  valoresValidos?:  string[];
  obligatoriedad?: 'OBLIGATORIO' | 'OPCIONAL' | 'CONDICIONAL' | string;
  [k: string]: unknown;
}

export interface EcfSchemaDetalle {
  tipo:    string;
  nombre?: string;
  fields:  EcfSchemaField[];
}

export const schemas = {
  /** Lista todos los tipos de comprobante con counts. */
  list: () => request<EcfSchemaTipoSummary[]>('GET', '/schemas/ecf'),

  /** Detalle de campos por tipo. */
  detalle: (tipo: string) =>
    request<EcfSchemaDetalle>('GET', `/schemas/ecf/${tipo}`),
};

// ─── Catálogos DGII ───────────────────────────────────────────────────────────

export interface CatalogItemDto {
  codigo: string;
  nombre: string;
  /** Campos extra varían por catálogo: descripcion, tasa, sigla, simbolo,
   * codigoIso2, formato, provinciaCodigo, municipioCodigo, etc. */
  [key: string]: unknown;
}

export const catalogos = {
  /**
   * 32 provincias de RD. Códigos en formato "010000" (Distrito Nacional), "020000", etc.
   * Usar el código en CreateContribuyenteDto.provincia.
   */
  provincias: () =>
    request<CatalogItemDto[]>('GET', '/catalogos/provincias'),

  /**
   * 156 municipios de RD.
   * @param provincia Opcional. Código de provincia para filtrar (ej: "010000").
   * Usar el código en CreateContribuyenteDto.municipio.
   */
  municipios: (provincia?: string) =>
    request<CatalogItemDto[]>(
      'GET',
      `/catalogos/municipios${provincia ? `?provincia=${encodeURIComponent(provincia)}` : ''}`,
    ),

  tiposComprobante: () =>
    request<CatalogItemDto[]>('GET', '/catalogos/tipos-comprobante'),

  formasPago: () =>
    request<CatalogItemDto[]>('GET', '/catalogos/formas-pago'),

  // ── Adicionales (sincronizados a Postgres local vía cron) ──
  ambientes: () =>
    request<CatalogItemDto[]>('GET', '/catalogos/ambientes'),

  tiposDocumento: () =>
    request<CatalogItemDto[]>('GET', '/catalogos/tipos-documento'),

  monedas: () =>
    request<CatalogItemDto[]>('GET', '/catalogos/monedas'),

  unidadesMedida: () =>
    request<CatalogItemDto[]>('GET', '/catalogos/unidades-medida'),

  indicadoresItbis: () =>
    request<CatalogItemDto[]>('GET', '/catalogos/indicadores-itbis'),

  paises: () =>
    request<CatalogItemDto[]>('GET', '/catalogos/paises'),

  tiposIngreso: () =>
    request<CatalogItemDto[]>('GET', '/catalogos/tipos-ingreso'),

  tiposPago: () =>
    request<CatalogItemDto[]>('GET', '/catalogos/tipos-pago'),

  distritosMunicipales: () =>
    request<CatalogItemDto[]>('GET', '/catalogos/distritos-municipales'),

  impuestosAdicionales: () =>
    request<CatalogItemDto[]>('GET', '/catalogos/impuestos-adicionales'),

  codigosModificacion: () =>
    request<CatalogItemDto[]>('GET', '/catalogos/codigos-modificacion'),
};

// ─── Me (identidad de la API key) ─────────────────────────────────────────────

export interface MeResponseDto {
  software: { nombre: string; version: string; ambienteDefault: string };
  empresa: {
    id: string;
    nombre: string;
    emailContacto: string | null;
    activo: boolean;
    createdAt: string;
  };
  apiKey: {
    id: string;
    nombre: string;
    esAdmin: boolean;
    ultimoUso: string | null;
    expiraEn: string | null;
  };
}

export const me = () => request<MeResponseDto>('GET', '/me');

// ─── DGII Status ──────────────────────────────────────────────────────────────

export interface DgiiStatusDto {
  rnc: string;
  codigoPublico: string;
  ambiente: string;
  certificado: {
    vigente: boolean;
    subject: string | null;
    issuer: string | null;
    validFrom: string | null;
    validTo: string | null;
    diasRestantes: number | null;
    revocado: boolean;
  };
  dgiiToken: {
    cached: boolean;
    vigenteHasta: string | null;
    tiempoRestanteSegundos: number | null;
    ambiente: string;
  };
  ultimaEmisionExitosa: string | null;
}

export const dgiiStatus = {
  get: (codigoPublico: string) =>
    request<DgiiStatusDto>('GET', `/contribuyentes/${codigoPublico}/dgii-status`),

  refreshToken: (codigoPublico: string) =>
    request<{ ok: boolean; expiraEn: string }>('POST', `/contribuyentes/${codigoPublico}/dgii-token/refresh`),
};

// ─── Extender contribuyentes con delete ───────────────────────────────────────

export const contribuyentesExtras = {
  delete: (codigoPublico: string) =>
    request<{ ok: boolean }>('DELETE', `/contribuyentes/${codigoPublico}`),
};

// ─── Extender ncfRangos con delete ────────────────────────────────────────────

export const ncfRangosExtras = {
  delete: (codigoPublico: string, rangoId: string) =>
    request<{ ok: boolean }>('DELETE', `/contribuyentes/${codigoPublico}/ncf-rangos/${rangoId}`),
};

// ─── Emisión extras: descargas y estado DGII ─────────────────────────────────

export const emisionExtras = {
  estadoDgiiByCp: (codigoPublico: string, emisionId: string) =>
    request<EmisionResponseDto>('GET', `/contribuyentes/${codigoPublico}/emisiones/${emisionId}/estado-dgii`),

  /** Descarga XML firmado (base64) */
  downloadXml: async (codigoPublico: string, emisionId: string): Promise<string> => {
    const res = await fetch(`${BASE_URL}/contribuyentes/${codigoPublico}/emisiones/${emisionId}/xml`, {
      headers: { 'X-Api-Key': API_KEY },
    });
    if (!res.ok) throw new EcfApiError(res.status, await res.text());
    return res.text();
  },

  /** Descarga PDF representación */
  downloadPdf: async (codigoPublico: string, emisionId: string): Promise<Buffer> => {
    const res = await fetch(`${BASE_URL}/contribuyentes/${codigoPublico}/emisiones/${emisionId}/pdf`, {
      headers: { 'X-Api-Key': API_KEY },
    });
    if (!res.ok) throw new EcfApiError(res.status, await res.text());
    return Buffer.from(await res.arrayBuffer());
  },
};

// ─── Recepción (ACECF) ────────────────────────────────────────────────────────

export interface RecepcionDto {
  id: string;
  rnc: string;
  tipoComprobante: string;
  ncf: string;
  fecha: string;
  estado: 'aprobado' | 'rechazado';
  detalleMotivoRechazo?: string;
  createdAt: string;
}

export const recepcion = {
  list: (codigoPublico: string) =>
    request<RecepcionDto[]>('GET', `/contribuyentes/${codigoPublico}/recepcion`),

  aprobar: (codigoPublico: string, dto: { rnc: string; tipoComprobante: string; ncf: string; fecha: string }) =>
    request<RecepcionDto>('POST', `/contribuyentes/${codigoPublico}/recepcion/aprobar-comercial`, dto),

  rechazar: (codigoPublico: string, dto: { rnc: string; tipoComprobante: string; ncf: string; detalleMotivoRechazo: string }) =>
    request<RecepcionDto>('POST', `/contribuyentes/${codigoPublico}/recepcion/rechazar-comercial`, dto),
};

// ─── Anulaciones (ANECF) ──────────────────────────────────────────────────────

export interface AnecfDto {
  id: string;
  tipoComprobante: string;
  rangos: Array<{ desde: number; hasta: number }>;
  estado: string;
  createdAt: string;
}

export const anecf = {
  list: (codigoPublico: string) =>
    request<AnecfDto[]>('GET', `/contribuyentes/${codigoPublico}/anecf`),

  create: (codigoPublico: string, dto: { tipoComprobante: string; rangos: Array<{ desde: number; hasta: number }> }) =>
    request<AnecfDto>('POST', `/contribuyentes/${codigoPublico}/anecf`, dto),
};

// ─── Soporte ──────────────────────────────────────────────────────────────────

export interface SupportTicketDto {
  numero: string;
  email: string;
  asunto: string;
  descripcion: string;
  estado: string;
  createdAt: string;
}

export const support = {
  create: (dto: { email: string; asunto: string; descripcion: string }) =>
    request<SupportTicketDto>('POST', '/support/tickets', dto),

  get: (numero: string, email: string) =>
    request<SupportTicketDto>('GET', `/support/tickets/${numero}?email=${encodeURIComponent(email)}`),
};

// ─── Set de Pruebas (Habilitación / Certificación) ───────────────────────────

export type SetPruebasAmbiente = 'testecf' | 'certecf';
export type SetPruebasStatus   = 'PENDIENTE' | 'PROCESANDO' | 'COMPLETO' | 'FALLIDO';
export type SetPruebasCaseStatus = 'OK' | 'FAILED' | 'SKIPPED';

export interface SetPruebasStartResponseDto {
  importId: string;
  status:   SetPruebasStatus;
}

export interface SetPruebasCaseDto {
  casoPrueba:  string;
  tipoECF:     string;
  eNcf:        string;
  formato:     FormatoEmision;       // 'RFCE' | 'ECF'
  paso:        number;
  status:      SetPruebasCaseStatus; // OK | FAILED | SKIPPED
  emisionId?:  string;
  xmlUrl?:     string;
  pdfUrl?:     string;
  error?:      string;
  errorDetail?: unknown;
  estadoDgii?: EstadoEmision;        // PENDIENTE | ENVIADO | ACEPTADO | ACEPTADO_CONDICIONAL | RECHAZADO | ERROR
  trackId?:    string;
  mensajesDgii?: string[];
  urlVerificacion?: string;
}

export interface SetPruebasStatusDto {
  importId:     string;
  status:       SetPruebasStatus;
  errorMessage?: string;
  total?:       number;
  ok?:          number;
  failed?:      number;
  skipped?:     number;
  elapsedMs?:   number;
  zipUrl?:      string;
  rows?:        SetPruebasCaseDto[];
}

export interface SetPruebasRunListItemDto {
  importId:       string;
  rncEmisor:      string;
  sourceFilename: string;
  fileHash:       string;
  totalCasos:     number;
  uploadedAt:     string;
  byTipo?:        Record<string, number>;
}

export interface SetPruebasAprobacionCaseDto {
  eNCF?:         string;
  eNcf?:         string;       // tolera ambas grafías del backend
  estadoEnvio?:  string;       // estado de envío a DGII
  estadoDgii?:   string;
  trackId?:      string;
  error?:        string;
  mensajesDgii?: string[];
}

export interface SetPruebasAprobacionesResultDto {
  total:  number;
  ok:     number;
  failed: number;
  rows?:  SetPruebasAprobacionCaseDto[];
}

/**
 * Set de Pruebas DGII (paso 2 habilitación).
 *
 * El contribuyente se resuelve por la columna `RNCEmisor` DENTRO del Excel
 * — no se pasa codigoPublico. La API key master (esAdmin) autoriza la corrida.
 */
export const setPruebas = {
  /**
   * Sube Excel y arranca emisión async de todos los casos.
   * `modo=direct` es requerido en el paso 2 para emisión directa de e-CF.
   * `skipEncfs` (CSV de e-NCF) excluye comprobantes que ya fallaron, para
   * re-correr solo los que faltan. Ej: "E320000000012,E320000000015".
   */
  startRun: (ambiente: SetPruebasAmbiente, file: FormData, skipEncfs?: string) => {
    const qs = new URLSearchParams({ modo: 'direct' });
    if (skipEncfs && skipEncfs.trim()) qs.set('skipEncfs', skipEncfs.trim());
    return requestForm<SetPruebasStartResponseDto>(`/set-pruebas/${ambiente}/runs?${qs.toString()}`, file);
  },

  /** Estado + counters + casos de una corrida. */
  getRun: (runId: string) =>
    request<SetPruebasStatusDto>('GET', `/set-pruebas/runs/${runId}`),

  /** Casos parseados (detalle completo). */
  getCasos: (runId: string) =>
    request<SetPruebasCaseDto[]>('GET', `/set-pruebas/runs/${runId}/casos`),

  /** Re-emite todos los casos (sincrónico). */
  emitirTodos: (runId: string) =>
    request<SetPruebasStatusDto>('POST', `/set-pruebas/runs/${runId}/emitir-todos`),

  /** ZIP con SOLO los XMLs <RD$250K para subida manual al portal DGII. */
  manualUploadZip: (runId: string) =>
    requestRaw('GET', `/set-pruebas/runs/${runId}/manual-upload/zip`),

  /** ZIP completo (xml/ + pdf/ + manifest.json) de todos los casos. */
  package: (runId: string) =>
    requestRaw('GET', `/set-pruebas/runs/${runId}/package`),

  /**
   * Paso 3 (ACECF) — sube Excel de Aprobaciones Comerciales (hoja
   * ACEECF_Generadas) y procesa el batch SÍNCRONO. Firma cada ACECF con el
   * cert del RNCComprador (derivado del Excel) y envía a DGII.
   * `secShift` / `secShiftEncfs` ajustan FechaHoraAprobacionComercial.
   */
  startAprobaciones: (
    ambiente: SetPruebasAmbiente,
    file: FormData,
    opts?: { secShift?: number; secShiftEncfs?: string },
  ) => {
    const qs = new URLSearchParams();
    if (opts?.secShift != null) qs.set('secShift', String(opts.secShift));
    if (opts?.secShiftEncfs?.trim()) qs.set('secShiftEncfs', opts.secShiftEncfs.trim());
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return requestForm<SetPruebasAprobacionesResultDto>(`/set-pruebas/${ambiente}/aprobaciones${suffix}`, file);
  },

  /** Lista todas las corridas (metadata, sin casos). */
  listRuns: () =>
    request<SetPruebasRunListItemDto[]>('GET', '/set-pruebas/runs'),

  /**
   * Borra una corrida (cascade a casos + comparaciones).
   * `purgeEmisiones=true` además purga las emisiones (solo TesteCF/CerteCF,
   * nunca Produccion) para permitir re-correr limpio. Requiere que el endpoint
   * con purge esté deployado; si no, ecf-api ignora el query y deja huérfanas.
   */
  deleteRun: (runId: string, purgeEmisiones = false) =>
    request<{ deleted: boolean; id: string; emisionesBorradas?: number }>(
      'DELETE',
      `/set-pruebas/runs/${runId}${purgeEmisiones ? '?purgeEmisiones=true' : ''}`,
    ),
};

// ─── Pruebas de Simulación e-CF (Paso 4) ──────────────────────────────────────
// Genera 29 casos sintéticos (sin Excel) y los envía a DGII. cp-scoped.
// Reutiliza el shape de SetPruebasStatusDto para el estado del run.

export interface StartSimulacionDto {
  ncfStart?: number;   // default 500
  runTag?:   string;   // idempotencia
  dryRun?:   boolean;  // firma+persiste, NO envía a DGII
  // ambiente omitido a propósito: ecf-api usa el del contribuyente
}

export interface RestartSimulacionDto {
  ncfBump?: number;    // default 100
}

export const simulacion = {
  /** Inicia un run de simulación (29 casos sintéticos). */
  start: (codigoPublico: string, dto: StartSimulacionDto) =>
    request<SetPruebasStatusDto>('POST', `/contribuyentes/${codigoPublico}/pruebas-simulacion/start`, dto),

  /** Estado del run con auto-refresh DGII por trackId. */
  getRun: (codigoPublico: string, runId: string) =>
    request<SetPruebasStatusDto>('GET', `/contribuyentes/${codigoPublico}/pruebas-simulacion/runs/${runId}`),

  /** Re-inicia el set con NCFs auto-bumpeados (re-corre si DGII rechazó). */
  restart: (codigoPublico: string, dto: RestartSimulacionDto) =>
    request<SetPruebasStatusDto>('POST', `/contribuyentes/${codigoPublico}/pruebas-simulacion/restart`, dto),
};

// ─── Backward-compatible type aliases ────────────────────────────────────────
// Evita romper imports existentes mientras migramos.

/** @deprecated Usar ContribuyenteResponseDto */
export type ContribuyenteResponse = ContribuyenteResponseDto;
/** @deprecated Usar NcfRangoResponseDto */
export type NcfRangoResponse = NcfRangoResponseDto;
/** @deprecated Usar CertificateResponseDto */
export type CertificateResponse = CertificateResponseDto;
/** @deprecated Usar EmisionResponseDto */
export type EmisionResponse = EmisionResponseDto;
/** @deprecated Usar RegisterNcfRangoDto */
export type CreateNcfRangoDto = RegisterNcfRangoDto;
/** @deprecated Usar FirmarXmlDto */
export type FirmaXmlDto = FirmarXmlDto;
/** @deprecated Usar FirmarXmlResponseDto */
export type FirmaXmlResponse = FirmarXmlResponseDto;
