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
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new EcfApiError(res.status, text);
  }

  return res.json() as Promise<T>;
}

export class EcfApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'EcfApiError';
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
  /** Objeto con campos del subject (CN, O, C, etc.) */
  subject:    Record<string, string> | null;
  /** Objeto con campos del issuer */
  issuer:     Record<string, string> | null;
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
  estado:          EstadoEmision;
  trackId:         string | null;
  /** Código de seguridad de 6 chars alfanumérico */
  codigoSeguridad: string | null;
  fechaEmision:    string;
  montoTotal:      number;
  mensajesDgii:    Record<string, unknown> | null;
  createdAt:       string;
}

export const emision = {
  list: (codigoPublico: string) =>
    request<EmisionResponseDto[]>('GET', `/contribuyentes/${codigoPublico}/emision`),

  emitir: (codigoPublico: string, tipo: string, dto: unknown) =>
    request<EmisionResponseDto>('POST', `/contribuyentes/${codigoPublico}/emision/ecf${tipo}`, dto),

  emitirRfce32: (codigoPublico: string, dto: unknown) =>
    request<EmisionResponseDto>('POST', `/contribuyentes/${codigoPublico}/emision/rfce32`, dto),

  consultarEstado: (emisionId: string) =>
    request<EmisionResponseDto>('GET', `/emisiones/${emisionId}/estado-dgii`),

  get: (emisionId: string) =>
    request<EmisionResponseDto>('GET', `/emisiones/${emisionId}`),
};

// ─── Catálogos DGII ───────────────────────────────────────────────────────────

export interface CatalogItemDto {
  codigo: string;
  nombre: string;
}

export const catalogos = {
  /**
   * 32 provincias de RD. Códigos en formato "01" (Distrito Nacional), "02", etc.
   * Usar el código en CreateContribuyenteDto.provincia.
   */
  provincias: () =>
    request<CatalogItemDto[]>('GET', '/catalogos/provincias'),

  /**
   * 156 municipios de RD.
   * @param provincia Opcional. Código de provincia para filtrar (ej: "01").
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
