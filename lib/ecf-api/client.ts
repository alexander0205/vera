/**
 * Cliente HTTP para ECF API — proveedor de NCF electrónicos.
 * Todas las llamadas se hacen server-side; la API key nunca sale al cliente.
 */

const BASE_URL = process.env.ECF_API_URL!;
const API_KEY  = process.env.ECF_API_KEY!;

// ─── Tipos de respuesta ───────────────────────────────────────────────────────

export interface ContribuyenteResponse {
  rnc: string;
  codigoPublico: string;
  nombre: string;
  ambiente: string;
  activo: boolean;
  empresaId: string;
  createdAt: string;
  updatedAt: string;
  urlsDgii: {
    webhookBaseUrl: string;
  };
}

export interface NcfRangoResponse {
  id: string;
  rnc: string;
  tipoComprobante: string;
  serie: string;
  desde: number;
  hasta: number;
  siguiente: number;
  siguienteENCF: string;
  capacidadDisponible: number;
  pctUtilizado: number;
  fechaVencimiento: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContribuyenteDto {
  rnc: string;
  nombre: string;
  direccion: string;
  nombreComercial?: string;
  telefono?: string;
  municipio?: string;
  provincia?: string;
  ambiente?: 'TesteCF' | 'CerteCF' | 'Produccion';
}

export interface CreateNcfRangoDto {
  tipoComprobante: string;
  desde: number;
  hasta: number;
  fechaVencimiento: string; // ISO 8601
  serie?: string;
}

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

// ─── Firma XML ───────────────────────────────────────────────────────────────

export type TipoDocumentoFirma =
  | 'Postulacion'
  | 'DeclaracionJurada'
  | 'ECF'
  | 'ANECF'
  | 'Otro';

export interface FirmaXmlDto {
  xmlBase64:     string;
  tipoDocumento: TipoDocumentoFirma;
}

export interface FirmaXmlResponse {
  xmlFirmadoBase64: string;
  nombreArchivo:    string;
  rnc:              string;
  subject:          string;
}

// ─── Contribuyentes ───────────────────────────────────────────────────────────

export const contribuyentes = {
  list: () =>
    request<ContribuyenteResponse[]>('GET', '/contribuyentes'),

  create: (dto: CreateContribuyenteDto) =>
    request<ContribuyenteResponse>('POST', '/contribuyentes', dto),

  get: (codigoPublico: string) =>
    request<ContribuyenteResponse>('GET', `/contribuyentes/${codigoPublico}`),

  update: (codigoPublico: string, dto: Partial<CreateContribuyenteDto>) =>
    request<ContribuyenteResponse>('PATCH', `/contribuyentes/${codigoPublico}`, dto),

  firmaXml: (codigoPublico: string, dto: FirmaXmlDto) =>
    request<FirmaXmlResponse>('POST', `/contribuyentes/${codigoPublico}/firma-xml`, dto),
};

// ─── Rangos NCF ───────────────────────────────────────────────────────────────

export const ncfRangos = {
  list: (codigoPublico: string) =>
    request<NcfRangoResponse[]>('GET', `/contribuyentes/${codigoPublico}/ncf-rangos`),

  create: (codigoPublico: string, dto: CreateNcfRangoDto) =>
    request<NcfRangoResponse>('POST', `/contribuyentes/${codigoPublico}/ncf-rangos`, dto),
};

// ─── Certificados ────────────────────────────────────────────────────────────

export interface CertificateResponse {
  id: string;
  rnc: string;
  subject: string | null;
  issuer: string | null;
  validFrom: string;
  validTo: string;
  activo: boolean;
  revocadoEn: string | null;
  createdAt: string;
}

export const certificados = {
  list: (codigoPublico: string) =>
    request<CertificateResponse[]>('GET', `/contribuyentes/${codigoPublico}/certificates`),

  upload: (codigoPublico: string, p12Buffer: Buffer, password: string) => {
    const form = new FormData();
    form.append('file', new Blob([p12Buffer], { type: 'application/x-pkcs12' }), 'certificado.p12');
    form.append('password', password);
    return requestForm<CertificateResponse>(`/contribuyentes/${codigoPublico}/certificates`, form);
  },

  revoke: (certId: string) =>
    request<CertificateResponse>('DELETE', `/certificates/${certId}`),
};

// ─── Emisión e-CF ─────────────────────────────────────────────────────────────

export interface EmisionResponse {
  id: string;
  rnc: string;
  eNcf: string;
  tipoComprobante: string;
  formato: string;
  estado: string;
  trackId: string | null;
  codigoSeguridad: string | null;
  fechaEmision: string;
  montoTotal: number;
  mensajesDgii: unknown | null;
  createdAt: string;
}

export const emision = {
  emitir: (codigoPublico: string, tipo: string, dto: unknown) =>
    request<EmisionResponse>('POST', `/contribuyentes/${codigoPublico}/emision/ecf${tipo}`, dto),

  emitirRfce32: (codigoPublico: string, dto: unknown) =>
    request<EmisionResponse>('POST', `/contribuyentes/${codigoPublico}/emision/rfce32`, dto),

  consultarEstado: (emisionId: string) =>
    request<EmisionResponse>('GET', `/emisiones/${emisionId}/estado-dgii`),
};
