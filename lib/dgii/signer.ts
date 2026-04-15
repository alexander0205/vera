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
    const token = result as unknown as string;
    const expiresAt = new Date(Date.now() + 55 * 60 * 1000); // 55 min
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
   * Convierte e-CF tipo 32 firmado a formato RFCE
   * Para facturas de consumo menores a DOP 250,000
   */
  toRfce(signedEcf32Xml: string): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (convertECF32ToRFCE as any)(signedEcf32Xml) as string;
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
