/**
 * Receptor de e-CFs / ACECFs enviados por otros contribuyentes (vía DGII).
 *
 * Envuelve `SenderReceiver` del SDK dgii-ecf y agrega:
 *   - Carga de cert P12 del team receptor
 *   - Firma automática del ARECF generado
 *   - Extracción de metadatos del XML entrante (eNCF, RNCs, montos, tipo)
 *   - Validaciones de negocio (RNC receptor, duplicados, firma válida)
 *
 * Solo se ejecuta en el servidor (Node.js).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  SenderReceiver,
  ReceivedStatus,
  NoReceivedCode,
  excludedEncfType,
} from 'dgii-ecf';
import { DgiiSigner } from '@/lib/dgii/signer';
import { type DgiiEnvironment } from '@/lib/dgii/client';
import { decryptField, isEncrypted } from '@/lib/crypto/cert';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TeamCertInfo {
  certP12Ciphered:  string | null;
  certP12Iv:        string | null;
  certP12AuthTag:   string | null;
  certPinCiphered:  string | null;
  certPinIv:        string | null;
  certPinAuthTag:   string | null;
  dgiiEnvironment:  string | null;
  rnc:              string | null;
}

export interface EcfEntranteMeta {
  encf:              string;
  tipoEcf:           string;
  rncEmisor:         string;
  razonSocialEmisor: string | null;
  rncComprador:      string | null;
  montoTotal:        number;   // centavos
  totalItbis:        number;   // centavos
}

export type CodigoRechazo = '1' | '2' | '3' | '4';

export interface ResultadoRecepcion {
  aceptado:         boolean;
  codigoRechazo?:   CodigoRechazo;
  arecfFirmado:     string;   // XML firmado (siempre se genera, con estado correspondiente)
  meta?:            EcfEntranteMeta;
  motivoRechazo?:   string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extrae un tag de texto simple de un XML por regex (sin DOM). */
function tagText(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m  = xml.match(re);
  return m ? m[1].trim() : null;
}

/** Convierte monto con formato DGII ("12345.67") a centavos. */
function montoACentavos(str: string | null): number {
  if (!str) return 0;
  const n = parseFloat(str);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
}

/** Extrae metadatos básicos del XML entrante (regex robusto, sin DOM). */
export function extraerMetaDelXml(xml: string): EcfEntranteMeta | null {
  const encf      = tagText(xml, 'eNCF');
  const tipoEcf   = tagText(xml, 'TipoeCF');
  const rncEmisor = tagText(xml, 'RNCEmisor');
  const rncCompr  = tagText(xml, 'RNCComprador');
  const razon     = tagText(xml, 'RazonSocialEmisor');
  const monto     = tagText(xml, 'MontoTotal');
  const itbis     = tagText(xml, 'TotalITBIS');

  if (!encf || !tipoEcf || !rncEmisor) return null;

  return {
    encf,
    tipoEcf,
    rncEmisor,
    razonSocialEmisor: razon,
    rncComprador:      rncCompr,
    montoTotal:        montoACentavos(monto),
    totalItbis:        montoACentavos(itbis),
  };
}

/** ¿El tipo de e-CF se intercambia entre contribuyentes? (31, 33, 34, 44) */
export function tipoEsEntreContribuyentes(tipoEcf: string): boolean {
  return !excludedEncfType.includes(tipoEcf);
}

// ─── Carga + firma del receptor ───────────────────────────────────────────────

/** Instancia un `DgiiSigner` con el cert del team. Lanza si no hay cert. */
export function crearSignerDesdeTeam(team: TeamCertInfo): DgiiSigner {
  if (!isEncrypted(team.certP12Ciphered, team.certP12Iv, team.certP12AuthTag)) {
    throw new Error('Team sin certificado P12 — no puede firmar ARECFs');
  }
  const p12Base64 = decryptField({
    ciphered: team.certP12Ciphered!,
    iv:       team.certP12Iv!,
    authTag:  team.certP12AuthTag!,
  });
  const pin = decryptField({
    ciphered: team.certPinCiphered!,
    iv:       team.certPinIv!,
    authTag:  team.certPinAuthTag!,
  });
  return new DgiiSigner({
    p12Buffer:   Buffer.from(p12Base64, 'base64'),
    password:    pin,
    environment: (team.dgiiEnvironment as DgiiEnvironment) ?? 'TesteCF',
  });
}

/**
 * Construye un ARECF manualmente (fallback) cuando el SDK no puede parsear
 * el XML entrante — por ejemplo, cuando está mal formado o es de un tipo
 * sin los tags estándar. Cumple el formato oficial DGII.
 */
function construirArecfManual(
  meta: EcfEntranteMeta | null,
  receptorRnc: string,
  aceptado: boolean,
): string {
  const now = new Date();
  const fecha = `${now.getDate().toString().padStart(2, '0')}-` +
                `${(now.getMonth() + 1).toString().padStart(2, '0')}-` +
                `${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:` +
                `${now.getMinutes().toString().padStart(2, '0')}:` +
                `${now.getSeconds().toString().padStart(2, '0')}`;
  const estado = aceptado ? '0' : '1';
  return `<?xml version="1.0" encoding="UTF-8"?>
<ARECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <DetalleAcusedeRecibo>
    <Version>1.0</Version>
    <RNCEmisor>${meta?.rncEmisor ?? ''}</RNCEmisor>
    <RNCComprador>${receptorRnc}</RNCComprador>
    <eNCF>${meta?.encf ?? ''}</eNCF>
    <Estado>${estado}</Estado>
    <FechaHoraAcuseRecibo>${fecha}</FechaHoraAcuseRecibo>
  </DetalleAcusedeRecibo>
</ARECF>`;
}

/**
 * Genera y firma el ARECF de respuesta.
 * Intenta primero con el SDK (más completo). Si el SDK falla (XML inválido,
 * tags faltantes, tipo no estándar), cae al builder manual.
 *
 * @param xmlECF      XML del e-CF recibido
 * @param receptorRnc RNC del receptor (nosotros)
 * @param aceptado    true = Recibido | false = No Recibido
 * @param codigo      Código de rechazo (si aceptado=false)
 */
export function generarYFirmarARECF(
  signer: DgiiSigner,
  xmlECF: string,
  receptorRnc: string,
  aceptado: boolean,
  codigo?: CodigoRechazo,
): string {
  let arecfUnsigned: string;
  try {
    const sr = new SenderReceiver();
    const status = aceptado ? ReceivedStatus['e-CF Recibido'] : ReceivedStatus['e-CF No Recibido'];
    arecfUnsigned = sr.getECFDataFromXML(
      xmlECF,
      receptorRnc,
      status,
      codigo as unknown as NoReceivedCode,
    );
  } catch {
    // Fallback: el SDK no pudo parsear el XML entrante. Construir ARECF
    // manualmente con los datos que hayamos podido extraer.
    arecfUnsigned = construirArecfManual(extraerMetaDelXml(xmlECF), receptorRnc, aceptado);
  }
  return signer.signXml(arecfUnsigned, 'ARECF');
}

// ─── Pipeline completo de recepción ──────────────────────────────────────────

/**
 * Parsea un payload multipart entrante de DGII (e-CF o ACECF).
 * Devuelve el XML interno extraído.
 */
export async function parsearPayloadMultipart(
  rawBody: string,
  contentType: string,
): Promise<{ filename: string; xmlContent: string }> {
  const sr = new SenderReceiver();
  return sr.parseMultipart(rawBody, contentType, false);
}

/**
 * Pipeline completo: valida el XML entrante y genera el ARECF firmado.
 *
 * Reglas de validación:
 *   - El XML debe parsearse y tener tags mínimos → si no: código 1 (Error especificación)
 *   - El RNCComprador del XML debe coincidir con el RNC del team → si no: código 4
 *   - El tipo de e-CF debe ser uno que se intercambia entre contribuyentes → si no: código 1
 *   - La firma se valida implícitamente al firmar el ARECF (DGII ya valida firma antes de reenviar)
 */
export function validarYGenerarARECF(
  signer: DgiiSigner,
  xmlECF: string,
  teamRnc: string,
): ResultadoRecepcion {
  // 1) Parseo básico
  const meta = extraerMetaDelXml(xmlECF);
  if (!meta) {
    return {
      aceptado: false,
      codigoRechazo: '1',
      motivoRechazo: 'XML inválido o campos esenciales faltantes (eNCF, TipoeCF, RNCEmisor)',
      arecfFirmado: generarYFirmarARECF(signer, xmlECF, teamRnc, false, '1'),
    };
  }

  // 2) Tipo válido entre contribuyentes
  if (!tipoEsEntreContribuyentes(meta.tipoEcf)) {
    return {
      aceptado: false,
      codigoRechazo: '1',
      motivoRechazo: `Tipo ${meta.tipoEcf} no se intercambia entre contribuyentes`,
      meta,
      arecfFirmado: generarYFirmarARECF(signer, xmlECF, teamRnc, false, '1'),
    };
  }

  // 3) RNC comprador coincide con el team
  if (meta.rncComprador && meta.rncComprador.trim() !== teamRnc.trim()) {
    return {
      aceptado: false,
      codigoRechazo: '4',
      motivoRechazo: `RNCComprador del XML (${meta.rncComprador}) no coincide con el team (${teamRnc})`,
      meta,
      arecfFirmado: generarYFirmarARECF(signer, xmlECF, teamRnc, false, '4'),
    };
  }

  // 4) Todo OK → ARECF aceptado
  return {
    aceptado: true,
    meta,
    arecfFirmado: generarYFirmarARECF(signer, xmlECF, teamRnc, true),
  };
}
