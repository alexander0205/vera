/**
 * Foto de una factura → borrador de compra.
 *
 * Dos caminos, uno detrás del otro:
 *  1. QR de la DGII (lo intenta el navegador, es gratis y determinista). Si trae
 *     los datos, no se llama a la IA.
 *  2. Si no hay QR utilizable, la foto va a un modelo de visión (Gemini Flash),
 *     que devuelve el mismo JSON.
 *
 * Sea cual sea el camino, la salida pasa por el MISMO normalizador: RNC a solo
 * dígitos, NCF validado, montos en centavos. Lo que sale es un borrador —nunca
 * entra a libros solo—, con avisos de lo que conviene revisar a mano.
 *
 * El extractor de IA está detrás de esta función a propósito: el día que Zero
 * tenga servidores propios, se cambia Gemini por PaddleOCR/Qwen aquí y el resto
 * del flujo (enlace, cámara, revisión) no se entera.
 */

import 'server-only';
import { z } from 'zod';
import type { CapturaExtraida } from '@/lib/db/schema';
import { analizarIdentificacion, analizarNcf } from '@/lib/compras/fiscal';
import { analizarImagen, GeminiError } from '@/lib/ia/gemini-vision';

const PROMPT = `Eres un extractor de facturas y tickets de compra de República Dominicana.
Mira la imagen y devuelve SOLO un JSON válido (sin markdown, sin explicación) con ESTA forma EXACTA, todos los campos presentes:
{
  "proveedorNombre": string|null,
  "proveedorRnc": string|null,
  "ncf": string|null,
  "fecha": string|null,
  "subtotalCents": number|null,
  "itbisCents": number|null,
  "totalCents": number|null,
  "lineas": [ { "descripcion": string, "cantidad": number, "costoUnitarioCents": number } ]
}
Reglas:
- proveedorRnc: solo dígitos (quita guiones y espacios). Es el RNC/cédula de QUIEN EMITE la factura, no del comprador.
- ncf: el comprobante fiscal tal cual (ej. B0100002381 o E310000000001).
- fecha: en formato YYYY-MM-DD.
- montos EN CENTAVOS enteros: RD$1,003.00 → 100300. Nunca decimales.
- Si un dato no aparece o no estás seguro, pon null (o [] en lineas). No inventes.
- itbis es el impuesto (ITBIS, ISC, "Ley 11-92", "impuesto"); subtotal es el gravado antes de impuesto; total es lo que se paga.`;

// Schema PLANO y tolerante: Gemini ignora uniones/oneOf, así que nada de eso.
// Sin `.default()` en los campos que decide el modelo (los volvería opcionales
// en el JSON-schema y el modelo los omitiría). Aceptamos number|string en los
// montos por si el modelo manda "1003.00" y lo saneamos nosotros.
const numeroLaxo = z.union([z.number(), z.string()]).nullable().optional();
const respuestaSchema = z.object({
  proveedorNombre: z.string().nullable().optional(),
  proveedorRnc:    z.string().nullable().optional(),
  ncf:             z.string().nullable().optional(),
  fecha:           z.string().nullable().optional(),
  subtotalCents:   numeroLaxo,
  itbisCents:      numeroLaxo,
  totalCents:      numeroLaxo,
  lineas: z.array(z.object({
    descripcion:       z.string().nullable().optional(),
    cantidad:          z.union([z.number(), z.string()]).nullable().optional(),
    costoUnitarioCents: numeroLaxo,
  })).nullable().optional(),
});

/** A entero de centavos: acepta number o string, tolera decimales y separadores. */
function aCentavos(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const limpio = String(v).replace(/[^\d.]/g, '');
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function aEntero(v: unknown): number | null {
  const c = aCentavos(v);
  return c == null ? null : c;
}

export interface ResultadoExtraccion {
  datos: CapturaExtraida;
  /** Cosas que el revisor debería mirar (RNC con formato raro, NCF inválido…). */
  avisos: string[];
}

/** Normaliza el JSON crudo (venga de IA o de QR) a la forma de la app. */
export function normalizarExtraccion(crudo: unknown): ResultadoExtraccion {
  const p = respuestaSchema.safeParse(crudo);
  const r = p.success ? p.data : {};
  const avisos: string[] = [];
  if (!p.success) avisos.push('La lectura vino incompleta; revisa todos los campos.');

  const rnc = r.proveedorRnc ? analizarIdentificacion(r.proveedorRnc) : null;
  if (r.proveedorRnc && rnc && !rnc.formatoValido) avisos.push('El RNC/cédula no tiene un formato válido.');

  const ncfInfo = r.ncf ? analizarNcf(r.ncf) : null;
  if (r.ncf && ncfInfo && !ncfInfo.valido) avisos.push('El NCF no parece válido; verifícalo.');

  const total = aCentavos(r.totalCents);
  if (total == null) avisos.push('No se detectó el total; escríbelo a mano.');

  const lineas = (r.lineas ?? [])
    .map((l) => ({
      descripcion: (l.descripcion ?? '').trim(),
      cantidad: Math.max(1, aEntero(l.cantidad) ?? 1),
      costoUnitarioCents: aCentavos(l.costoUnitarioCents) ?? 0,
    }))
    .filter((l) => l.descripcion || l.costoUnitarioCents > 0);

  return {
    datos: {
      proveedorNombre: r.proveedorNombre?.trim() || null,
      proveedorRnc: rnc?.limpio || null,
      ncf: r.ncf?.trim() || null,
      fecha: normalizarFecha(r.fecha),
      subtotalCents: aCentavos(r.subtotalCents),
      itbisCents: aCentavos(r.itbisCents),
      totalCents: total,
      lineas,
    },
    avisos,
  };
}

/** A YYYY-MM-DD. Acepta ya-ISO o DD/MM/YYYY. Devuelve null si no cuadra. */
function normalizarFecha(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/**
 * Camino QR: el QR de la representación impresa de un e-CF es una URL de la DGII
 * cuyo query string YA trae RNC emisor, e-NCF, fecha y monto total. Se parsea sin
 * tocar la red. Devuelve null si el texto no es un QR de e-CF con datos usables
 * (entonces se cae a la IA).
 */
export function parsearQrDgii(texto: string | null | undefined): ResultadoExtraccion | null {
  if (!texto) return null;
  let url: URL;
  try {
    url = new URL(texto.trim());
  } catch {
    return null;
  }
  if (!/dgii\.gov\.do/i.test(url.host)) return null;

  // Las claves varían entre versiones del timbre; se buscan sin distinguir mayúsculas.
  const q = new Map<string, string>();
  url.searchParams.forEach((v, k) => q.set(k.toLowerCase(), v));
  const get = (...claves: string[]) => {
    for (const c of claves) { const v = q.get(c); if (v) return v; }
    return null;
  };

  const rnc = get('rncemisor', 'rnc');
  const ncf = get('encf', 'ncf');
  const monto = get('montototal', 'monto');
  if (!rnc && !ncf) return null; // no es un QR de e-CF con datos

  // El QR da el monto en PESOS ("1180.00"); la app trabaja en centavos.
  const pesos = monto ? Number(String(monto).replace(/[^\d.]/g, '')) : NaN;
  const totalCents = Number.isFinite(pesos) ? Math.round(pesos * 100) : null;

  return normalizarExtraccion({
    proveedorNombre: null,
    proveedorRnc: rnc,
    ncf,
    fecha: get('fechaemision', 'fecha'),
    subtotalCents: null,
    itbisCents: null,
    totalCents,
    lineas: [],
  });
}

/**
 * Camino IA: manda la foto a Gemini y normaliza. Lanza GeminiError (sin-config,
 * límite, timeout…) para que la ruta responda un mensaje claro.
 */
export async function extraerConIa(imagenBase64: string, mime: string): Promise<ResultadoExtraccion> {
  const texto = await analizarImagen({ prompt: PROMPT, imagenBase64, mime, timeoutMs: 30_000 });
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    throw new GeminiError('La IA no devolvió un JSON legible', 'respuesta');
  }
  return normalizarExtraccion(crudo);
}
