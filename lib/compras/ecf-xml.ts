/**
 * Lee un e-CF recibido (el XML firmado que manda el proveedor) para registrar
 * la compra sin volver a teclear nada. Pura y sin DOM: corre igual en el
 * servidor que en el navegador.
 *
 * Solo toma lo que hace falta para el registro: emisor, e-NCF, fechas, forma
 * de pago y líneas con su ITBIS (IndicadorFacturacion 1 = 18 %, 2 = 16 %,
 * 3 = 0 %, 4 = exento).
 */

import type { TasaItbis } from './fiscal';

export interface LineaEcfRecibido {
  descripcion: string;
  cantidad: number;
  costoUnitarioCents: number;
  itbisTasa: TasaItbis;
  esServicio: boolean;
}

export interface EcfRecibido {
  tipo: string | null;
  encf: string | null;
  rncEmisor: string | null;
  razonSocialEmisor: string | null;
  /** 'YYYY-MM-DD' */
  fechaEmision: string | null;
  formaPago: 'contado' | 'credito';
  fechaLimitePago: string | null;
  montoTotalCents: number | null;
  totalItbisCents: number | null;
  lineas: LineaEcfRecibido[];
}

const valor = (xml: string, tag: string): string | null => {
  const m = new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`, 'i').exec(xml);
  return m ? decodificar(m[1]) : null;
};

function decodificar(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

const aCentavos = (s: string | null): number | null => {
  if (s == null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/** El e-CF escribe las fechas dd-MM-yyyy. */
const aFechaYMD = (s: string | null): string | null => {
  const m = s ? /^(\d{2})-(\d{2})-(\d{4})$/.exec(s) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

const TASA_POR_INDICADOR: Record<string, TasaItbis> = { '1': '0.18', '2': '0.16', '3': '0', '4': 'exento' };

export function leerEcfRecibido(xml: string | null | undefined): EcfRecibido | null {
  if (!xml || !/<ECF[\s>]/i.test(xml)) return null;

  const lineas: LineaEcfRecibido[] = [];
  for (const m of xml.matchAll(/<Item>([\s\S]*?)<\/Item>/gi)) {
    const item = m[1];
    const cantidad = Number(valor(item, 'CantidadItem') ?? '1') || 1;
    const montoCents = aCentavos(valor(item, 'MontoItem')) ?? 0;
    const unitario = Math.round(montoCents / cantidad);
    // Con descuentos, precios de más de dos decimales o cantidades fraccionadas
    // (2.5 kg) el unitario no reproduce el monto: se registra una unidad por el
    // monto de la línea.
    const exacto = Number.isInteger(cantidad) && Math.round(unitario * cantidad) === montoCents;
    const nombre = valor(item, 'NombreItem') ?? 'Artículo';
    lineas.push({
      descripcion: exacto ? nombre : `${nombre} (${cantidad} × ${(unitario / 100).toFixed(2)})`,
      cantidad: exacto ? cantidad : 1,
      costoUnitarioCents: exacto ? unitario : montoCents,
      itbisTasa: TASA_POR_INDICADOR[valor(item, 'IndicadorFacturacion') ?? ''] ?? '0.18',
      esServicio: valor(item, 'IndicadorBienoServicio') === '2',
    });
  }

  return {
    tipo: valor(xml, 'TipoeCF'),
    encf: valor(xml, 'eNCF'),
    rncEmisor: valor(xml, 'RNCEmisor'),
    razonSocialEmisor: valor(xml, 'RazonSocialEmisor'),
    fechaEmision: aFechaYMD(valor(xml, 'FechaEmision')),
    formaPago: valor(xml, 'TipoPago') === '2' ? 'credito' : 'contado',
    fechaLimitePago: aFechaYMD(valor(xml, 'FechaLimitePago')),
    montoTotalCents: aCentavos(valor(xml, 'MontoTotal')),
    totalItbisCents: aCentavos(valor(xml, 'TotalITBIS')),
    lineas,
  };
}
