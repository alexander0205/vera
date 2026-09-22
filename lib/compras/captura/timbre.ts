/**
 * El QR impreso de un e-CF («timbre»). Pura, sin BD.
 *
 * La representación impresa de todo e-CF lleva un QR con la URL de consulta de
 * la DGII, y esa URL ya trae los datos que identifican el comprobante. Leerla
 * da el RNC del emisor, el e-NCF y el total EXACTOS, sin adivinar nada de la foto:
 *
 *   https://ecf.dgii.gov.do/ecf/consultatimbre?rncemisor=…&RncComprador=…
 *     &encf=E31…&fechaemision=15-09-2026&montototal=3200.00
 *     &fechafirma=15-09-2026%2015%3A14%3A02&codigoseguridad=…
 *
 *   https://fc.dgii.gov.do/ecf/consultatimbrefc?rncemisor=…&encf=E32…
 *     &montototal=5300&codigoseguridad=…          (consumo < RD$250,000)
 *
 * Los nombres de los parámetros llegan en minúsculas o con mayúsculas según
 * quién imprimió (`RncComprador`), así que se leen sin distinguir. El entorno
 * va en la ruta: `/ecf/` producción, `/certecf/` certificación, `/testecf/`
 * pruebas. El ITBIS NO viene en el QR: solo el total.
 */

import { analizarNcf } from '../fiscal';

export interface TimbreEcf {
  url: string;
  ambiente: 'produccion' | 'certificacion' | 'pruebas';
  /** Factura de consumo menor de RD$250,000: su QR no trae comprador ni fechas. */
  consumo: boolean;
  rncEmisor: string | null;
  rncComprador: string | null;
  encf: string | null;
  /** YYYY-MM-DD */
  fechaEmision: string | null;
  montoTotalCents: number | null;
  fechaFirma: string | null;
  codigoSeguridad: string | null;
}

const soloDigitos = (v: string | null) => {
  const d = (v ?? '').replace(/\D/g, '');
  return d.length === 9 || d.length === 11 ? d : null;
};

/** dd-MM-yyyy → yyyy-MM-dd, o null si no es una fecha real. */
export function fechaDgii(v: string | null): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})/.exec((v ?? '').trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const iso = `${yyyy}-${mm}-${dd}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

function montoCents(v: string | null): number | null {
  const limpio = (v ?? '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  return Math.round(Number(limpio) * 100);
}

/** Lee el texto de un QR. Devuelve null si no es un timbre de la DGII. */
export function leerTimbre(texto: string | null | undefined): TimbreEcf | null {
  const bruto = (texto ?? '').trim();
  if (!bruto) return null;
  let url: URL;
  try { url = new URL(bruto); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !(host === 'dgii.gov.do' || host.endsWith('.dgii.gov.do'))) return null;
  const ruta = url.pathname.toLowerCase();
  if (!/\/consultatimbre(fc)?$/.test(ruta)) return null;

  const p = new Map<string, string>();
  url.searchParams.forEach((valor, clave) => p.set(clave.toLowerCase(), valor));
  const get = (k: string) => p.get(k) ?? null;

  const encfInfo = analizarNcf(get('encf'));
  return {
    url: bruto,
    ambiente: ruta.includes('/testecf/') ? 'pruebas' : ruta.includes('/certecf/') ? 'certificacion' : 'produccion',
    consumo: ruta.endsWith('fc'),
    rncEmisor: soloDigitos(get('rncemisor')),
    rncComprador: soloDigitos(get('rnccomprador')),
    encf: encfInfo.valido && encfInfo.electronico ? encfInfo.ncf : null,
    fechaEmision: fechaDgii(get('fechaemision')),
    montoTotalCents: montoCents(get('montototal')),
    fechaFirma: get('fechafirma'),
    codigoSeguridad: get('codigoseguridad'),
  };
}
