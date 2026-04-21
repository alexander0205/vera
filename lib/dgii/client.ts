/**
 * Cliente de comunicación con la API de la DGII
 * Maneja autenticación (semilla → token), envío de e-CF y consulta de estado
 */

export type DgiiEnvironment = 'TesteCF' | 'CerteCF' | 'eCF';

export type EstadoDgii =
  | 'Aceptado'
  | 'Rechazado'
  | 'AceptadoCondicional'
  | 'En Proceso';

/** Respuesta completa del endpoint ValidarSemilla */
export interface DgiiTokenResponse {
  token:    string;
  expira:   string;   // ISO 8601 UTC — "yyyy-MM-ddTHH:mm:ssZ"
  expedido: string;   // ISO 8601 UTC — fecha de emisión
}

export interface DgiiTrackIdResponse {
  trackId: string;
  estado: EstadoDgii;
  rnc?: string;
  encf?: string;
  fechaRecepcion?: string;
  mensajes?: { codigo: string; descripcion: string }[];
}

const BASE_URLS: Record<DgiiEnvironment, string> = {
  TesteCF: 'https://ecf.dgii.gov.do/testecf',
  CerteCF: 'https://ecf.dgii.gov.do/certecf',
  eCF: 'https://ecf.dgii.gov.do/ecf',
};

const FC_BASE_URLS: Record<DgiiEnvironment, string> = {
  TesteCF: 'https://fc.dgii.gov.do/testecf',
  CerteCF: 'https://fc.dgii.gov.do/certecf',
  eCF: 'https://fc.dgii.gov.do/ecf',
};

export class DgiiClient {
  private baseUrl: string;
  private fcBaseUrl: string;
  private token: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(private environment: DgiiEnvironment = 'TesteCF') {
    this.baseUrl = BASE_URLS[environment];
    this.fcBaseUrl = FC_BASE_URLS[environment];
  }

  // ─── Autenticación ───────────────────────────────────────────────────────

  async getSemilla(): Promise<string> {
    const url = `${this.baseUrl}/autenticacion/api/Autenticacion/Semilla`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error obteniendo semilla: ${res.status}`);
    return res.text();
  }

  async validarSemilla(semillaFirmada: string): Promise<DgiiTokenResponse> {
    const url = `${this.baseUrl}/autenticacion/api/Autenticacion/ValidarSemilla`;
    const formData = new FormData();
    const blob = new Blob([semillaFirmada], { type: 'application/xml' });
    formData.append('xml', blob, 'semilla.xml');

    const res = await fetch(url, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`Error validando semilla: ${res.status}`);
    const data = await res.json();
    // La DGII devuelve: { token, expira, expedido }
    if (!data.token) throw new Error('La DGII no devolvió token en ValidarSemilla');
    return data as DgiiTokenResponse;
  }

  setToken(token: string, expiresAt: Date) {
    this.token = token;
    this.tokenExpiresAt = expiresAt;
  }

  isTokenValid(): boolean {
    if (!this.token || !this.tokenExpiresAt) return false;
    return new Date() < new Date(this.tokenExpiresAt.getTime() - 5 * 60 * 1000);
  }

  private getAuthHeaders(): HeadersInit {
    if (!this.token) throw new Error('Sin token de autenticación');
    return { Authorization: `Bearer ${this.token}` };
  }

  // ─── Envío de e-CF ───────────────────────────────────────────────────────

  async enviarEcf(
    xmlFirmado: string,
    rnc: string,
    encf: string
  ): Promise<{ trackId: string; estado: string }> {
    const url = `${this.baseUrl}/recepcion/api/facturaselectronicas`;
    const formData = new FormData();
    const fileName = `${rnc}${encf}.xml`;
    const blob = new Blob([xmlFirmado], { type: 'application/xml' });
    formData.append('xml', blob, fileName);

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Error enviando e-CF: ${res.status} - ${err}`);
    }

    return res.json();
  }

  // Tipo 32 menores a DOP 250,000 — van por el servicio de FC
  async enviarRfce(
    xmlRfceFirmado: string,
    rnc: string,
    encf: string
  ): Promise<{ trackId: string; estado: string }> {
    const url = `${this.fcBaseUrl}/recepcionfc/api/recepcion/ecf`;
    const formData = new FormData();
    const fileName = `${rnc}${encf}.xml`;
    const blob = new Blob([xmlRfceFirmado], { type: 'application/xml' });
    formData.append('xml', blob, fileName);

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Error enviando RFCE: ${res.status} - ${err}`);
    }

    return res.json();
  }

  // ─── Consulta de estado ───────────────────────────────────────────────────

  /**
   * Consulta el estado de un e-CF por trackId.
   * Endpoint correcto: GET /consultaresultado/api/Consultas/Estado?trackId={trackId}
   * (con timeout de 20 s para evitar colgarse en rate-limit de la DGII)
   */
  async consultarEstado(trackId: string): Promise<DgiiTrackIdResponse> {
    const url = `${this.baseUrl}/consultaresultado/api/Consultas/Estado?trackId=${encodeURIComponent(trackId)}`;
    const res = await fetch(url, {
      headers: this.getAuthHeaders(),
      signal:  AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Error consultando estado: ${res.status}`);
    return res.json();
  }

  async consultarPorEncf(
    rnc: string,
    encf: string
  ): Promise<DgiiTrackIdResponse> {
    const url = `${this.baseUrl}/consultaresultado/api/Consultas/Estado?rncEmisor=${encodeURIComponent(rnc)}&ncfElectronico=${encodeURIComponent(encf)}`;
    const res = await fetch(url, {
      headers: this.getAuthHeaders(),
      signal:  AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Error consultando por eNCF: ${res.status}`);
    return res.json();
  }

  // ─── Directorio de contribuyentes ────────────────────────────────────────

  async consultarDirectorio(rnc: string): Promise<{
    rnc: string;
    urlRecepcion?: string;
    urlAprobacionComercial?: string;
    urlAutenticacion?: string;
  }> {
    const url = `${this.baseUrl}/emisorreceptor/api/EmisorReceptor/${rnc}`;
    const res = await fetch(url, { headers: this.getAuthHeaders() });
    if (!res.ok) return { rnc };
    return res.json();
  }
}
