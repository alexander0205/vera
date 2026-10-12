/**
 * Archivo del Formato 606 (Norma General 07-2018): encabezado y líneas, pura.
 *
 *   606|RNC|AAAAMM|cantidad de registros
 *   una línea de 23 campos por comprobante (ver lineaFormato606)
 *
 * Separado por CRLF, sin fila de títulos. Se nombra DGII_F_606_{RNC}_{AAAAMM}.TXT.
 */

import { lineaFormato606, type CompraPara606 } from './fiscal';

export function construirFormato606(p: { rncEmpresa: string; periodo: string; compras: CompraPara606[] }) {
  const rnc = p.rncEmpresa.replace(/\D/g, '');
  const lineas = [
    `606|${rnc}|${p.periodo}|${p.compras.length}`,
    ...p.compras.map((c) => lineaFormato606(c, rnc)),
  ];
  return {
    nombreArchivo: `DGII_F_606_${rnc}_${p.periodo}.TXT`,
    contenido: lineas.join('\r\n'),
    registros: p.compras.length,
  };
}

/** Las retenciones que guarda una factura emitida (JSON en pesos) en centavos. */
export function retencionesDeJson(json: string | null | undefined): { itbisCents: number; isrCents: number } {
  let lista: unknown;
  try { lista = JSON.parse(json ?? '[]'); } catch { return { itbisCents: 0, isrCents: 0 }; }
  if (!Array.isArray(lista)) return { itbisCents: 0, isrCents: 0 };
  let itbisCents = 0;
  let isrCents = 0;
  for (const r of lista as { tipo?: string; monto?: number }[]) {
    const cents = Math.round(Number(r.monto ?? 0) * 100);
    if (!Number.isFinite(cents) || cents <= 0) continue;
    const tipo = String(r.tipo ?? '').toLowerCase();
    if (tipo === 'itbis') itbisCents += cents;
    else if (tipo === 'isr' || tipo === 'renta' || tipo === 'honorarios') isrCents += cents;
  }
  return { itbisCents, isrCents };
}
