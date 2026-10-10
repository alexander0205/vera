/**
 * Archivo del Formato 606 (Norma General 07-2018): encabezado y líneas, pura.
 *
 *   606|RNC|AAAAMM|cantidad de registros
 *   una línea de 23 campos por comprobante (ver lineaFormato606)
 *
 * Separado por CRLF, sin fila de títulos. Se nombra DGII_F_606_{RNC}_{AAAAMM}.TXT.
 */

import { analizarNcf, lineaFormato606, type CompraPara606 } from './fiscal';

export function construirFormato606(p: { rncEmpresa: string; periodo: string; compras: CompraPara606[] }) {
  const rnc = p.rncEmpresa.replace(/\D/g, '');
  // Última barrera: al archivo solo llega lo que tiene un NCF válido que se
  // reporta. La ruta ya lo filtra al leer la base; se repite aquí para que un
  // gasto sin NCF no pueda acabar en un renglón con el campo 4 vacío —que la
  // DGII rechaza—, entre por donde entre. El conteo del encabezado sale de lo
  // que de verdad se escribe.
  const compras = p.compras.filter((c) => {
    const info = analizarNcf(c.ncf);
    return info.valido && info.reporta606;
  });
  const lineas = [
    `606|${rnc}|${p.periodo}|${compras.length}`,
    ...compras.map((c) => lineaFormato606(c, rnc)),
  ];
  return {
    nombreArchivo: `DGII_F_606_${rnc}_${p.periodo}.TXT`,
    contenido: lineas.join('\r\n'),
    registros: compras.length,
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
