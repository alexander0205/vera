/**
 * Firma digital de XMLs para la DGII usando el paquete dgii-ecf
 * XMLDSig RSA-SHA256 — solo ejecutar en el servidor (Node.js)
 */

import {
  ECF,
  P12Reader,
  Signature,
  ENVIRONMENT,
  getCodeSixDigitfromSignature,
  convertECF32ToRFCE,
} from 'dgii-ecf';

type DgiiEnv = 'TesteCF' | 'CerteCF' | 'eCF';

const ENV_MAP: Record<DgiiEnv, ENVIRONMENT> = {
  TesteCF: ENVIRONMENT.DEV,
  CerteCF: ENVIRONMENT.CERT,
  eCF: ENVIRONMENT.PROD,
};

export interface SignerConfig {
  p12Buffer: Buffer;
  password: string;
  environment?: DgiiEnv;
}

export class DgiiSigner {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ecf: any;
  private signature: Signature;
  private environment: DgiiEnv;

  constructor(config: SignerConfig) {
    this.environment = config.environment ?? 'TesteCF';

    const reader = new P12Reader(config.password);
    const base64 = config.p12Buffer.toString('base64');
    const certs = reader.getKeyFromStringBase64(base64);

    this.ecf = new ECF(certs, ENV_MAP[this.environment]);
    this.signature = new Signature(certs.key ?? '', certs.cert ?? '');
  }

  // ─── Autenticación ───────────────────────────────────────────────────────

  async authenticate(): Promise<{ token: string; expiresAt: Date }> {
    const result = await this.ecf.authenticate();
    if (!result) throw new Error('No se pudo obtener token de la DGII');

    // El SDK dgii-ecf devuelve: { token: string, expira: string, expedido: string }
    // Defender ambos formatos por compatibilidad.
    let token: string;
    let expiresAt: Date;

    if (typeof result === 'string') {
      token = result;
      expiresAt = new Date(Date.now() + 55 * 60 * 1000);
    } else if (typeof result === 'object' && result !== null) {
      const r = result as { token?: string; expira?: string; expedido?: string };
      if (!r.token) throw new Error('Token no presente en la respuesta de la DGII');
      token = r.token;
      // `expira` viene como ISO string; si no es parseable, default a 55 min
      const parsed = r.expira ? new Date(r.expira) : null;
      expiresAt = parsed && !isNaN(parsed.getTime())
        ? parsed
        : new Date(Date.now() + 55 * 60 * 1000);
    } else {
      throw new Error('Formato de token desconocido devuelto por la DGII');
    }

    return { token, expiresAt };
  }

  // ─── Firma digital ───────────────────────────────────────────────────────

  /**
   * Firma un XML usando XMLDSig RSA-SHA256
   * @param xmlContent  XML sin firmar
   * @param rootElement Elemento raíz: 'ECF' | 'RFCE' | 'ARECF' | 'ACECF' | 'ANECF'
   */
  signXml(
    xmlContent: string,
    rootElement: 'ECF' | 'RFCE' | 'ARECF' | 'ACECF' | 'ANECF' = 'ECF'
  ): string {
    return this.signature.signXml(xmlContent, rootElement);
  }

  /**
   * Extrae el código de seguridad (primeros 6 caracteres de la firma)
   * Requerido en la Representación Impresa y en el QR
   */
  extractSecurityCode(signedXml: string): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getCodeSixDigitfromSignature as any)(signedXml) as string;
  }

  /**
   * Convierte e-CF tipo 32 firmado a formato RFCE (sin firma).
   * Para facturas de consumo menores a DOP 250,000.
   *
   * Nota: el RFCE resultante es unsigned — usar signXml(rfce, 'RFCE') antes de enviar.
   */
  toRfce(signedEcf32Xml: string): string {
    // convertECF32ToRFCE devuelve { xml: string, securityCode: string }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (convertECF32ToRFCE as any)(signedEcf32Xml) as { xml: string; securityCode: string };
    return result.xml;
  }

  // ─── Envío directo usando el cliente integrado ────────────────────────────

  async sendDocument(signedXml: string, encf: string) {
    return this.ecf.sendElectronicDocument(signedXml, encf);
  }

  async sendSummary(signedRfceXml: string) {
    return this.ecf.sendSummary(signedRfceXml);
  }

  async getStatus(trackId: string) {
    return this.ecf.statusTrackId(trackId);
  }

  async voidEncf(signedAnecfXml: string) {
    return this.ecf.voidENCF(signedAnecfXml);
  }
}
