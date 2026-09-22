import 'server-only';
import { generateText, Output, type LanguageModel } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { CATEGORIAS_COMPRA } from '../categorias';
import { esquemaLecturaIa, type LecturaIa } from './datos';

/**
 * Lectura de la foto con IA: saca TODO lo que el registro necesita —proveedor,
 * comprobante, impuestos, líneas, categoría del catálogo, forma y método de
 * pago— para que revisar sea mirar la foto y pulsar «Registrar».
 *
 * Dos caminos, en este orden:
 *   · **Vercel AI Gateway**: en Vercel autentica solo con el token OIDC del
 *     despliegue (hay que habilitarlo en el proyecto); en local, con
 *     AI_GATEWAY_API_KEY.
 *   · **Llave de Anthropic** (ANTHROPIC_API_KEY): para probar sin gateway.
 *
 * Sin ninguna de las dos no se llama a nadie: el QR del e-CF sigue leyéndose y
 * lo demás queda para completarlo mirando la foto.
 */

/**
 * Leer una factura es OCR con formato fijo: no hace falta el modelo más caro.
 * Va Gemini Flash-Lite, que cuesta una décima parte que Haiku (US$0.0005 por
 * factura) y es de lo mejor leyendo documentos fotografiados, con **Haiku de
 * respaldo**: los modelos pequeños a veces no devuelven el JSON con la forma
 * pedida, y una factura no se puede quedar sin leer por eso. Si el primero
 * falla, se reintenta UNA vez con el segundo.
 *
 * Los dos se cambian sin tocar código con `CAPTURA_IA_MODELO` y
 * `CAPTURA_IA_MODELO_RESPALDO`.
 */
const MODELO = process.env.CAPTURA_IA_MODELO || 'google/gemini-2.5-flash-lite';
const RESPALDO = process.env.CAPTURA_IA_MODELO_RESPALDO || 'anthropic/claude-haiku-4.5';

const porGateway = () => Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);

function comoModelo(id: string): LanguageModel | null {
  if (!id) return null;
  if (porGateway()) return id;
  // Sin gateway solo se puede llamar a Anthropic, con su llave.
  if (process.env.ANTHROPIC_API_KEY && id.startsWith('anthropic/')) return anthropic(id.slice('anthropic/'.length));
  return null;
}

/**
 * El modelo con el que leer, o null si no hay forma de llamarlo. Con una llave
 * suelta de Anthropic —sin gateway— el principal no se puede llamar, así que
 * entra el respaldo: es lo que hace que funcione poniendo solo ANTHROPIC_API_KEY.
 */
export const modeloCaptura = (): LanguageModel | null => comoModelo(MODELO) ?? comoModelo(RESPALDO);

export const iaDisponible = (): boolean => modeloCaptura() !== null;

const CATALOGO = CATEGORIAS_COMPRA.map((c) => `  ${c.clave}: ${c.label} — ${c.ejemplo}`).join('\n');

const INSTRUCCIONES = `Eres asistente contable en República Dominicana. Lees la foto de la factura de un PROVEEDOR (algo que la empresa compró) y devuelves sus datos tal como están impresos, para registrarla sin teclear nada.
- El RNC o cédula que interesa es el de quien VENDE (el emisor), no el del comprador.
- NCF: B + 2 dígitos + 8 dígitos (B0100000123). e-NCF: E + 2 dígitos + 10 dígitos (E310000000045). Cópialo exacto.
- Montos en pesos como números, sin símbolo ni separador de miles.
- ITBIS es el impuesto (18 % o 16 %). La propina legal (10 %) es de restaurantes; no la sumes al ITBIS.
- precioUnitario va SIN ITBIS. En muchos recibos (supermercados) la columna de valor ya incluye el ITBIS y el ITBIS sale en otra columna: réstaselo.
- Los recibos de caja (supermercados, tiendas, farmacias) imprimen arriba el RNC del comercio, la autorización de la DGII («Res DGII: 02-2009  Del: 02/02/2009», «AUTORIZADO POR DGII»), la fecha y hora de la venta («09/08/22 10:09:38») y luego «NIF:… NCF:…». Cada cosa va en su campo: la resolución y su fecha en resolucionDgii y fechaResolucionDgii; la fecha de la venta en fecha; lo que sigue a «NCF:» en ncf; el NIF en nif. El RNC es el número que sigue a «RNC», aunque la foto corte la palabra.
- Fecha de emisión: la de la venta, que suele ir junto a la hora; nunca la de la resolución DGII. En RD las fechas van día/mes/año; un año de dos cifras es 20XX.
- Si la foto está cortada y no se ve el total, completa=false y total=null: nunca calcules ni supongas un total.
- Si la factura detalla retenciones de ITBIS o de ISR, ponlas; si no, deja null (se calculan después).
- Fecha de emisión en formato YYYY-MM-DD.
- tipoProveedor: rst solo si la factura dice Régimen Simplificado de Tributación; exterior si el proveedor es de otro país.
- metodoPago solo si la factura dice con qué se pagó.
- clase: "compra" solo si es mercancía o materia prima que ESTA empresa revende o usa para producir lo que vende; "gasto" si se consume en la operación (servicios, combustible, comida, artículos de higiene o limpieza, papelería de oficina, reparaciones...). Si dudas, "gasto".
- Clasifica el gasto con UNA de estas claves, la que mejor lo describa:
${CATALOGO}
  Clasifica cada línea y pon en "categoria" la del renglón de mayor monto.
- No inventes nada: lo que no se lea con seguridad va null.`;

/** A quién le compraron: con eso el modelo distingue gasto de mercancía. */
export interface ContextoLectura { empresa?: string | null }

export async function leerFacturaConIa(archivos: { buffer: Buffer; mime: string }[], ctx: ContextoLectura = {}): Promise<LecturaIa> {
  const modelo = modeloCaptura();
  if (!modelo) throw new Error('La lectura con IA no está configurada');
  try {
    return await leerCon(modelo, archivos, ctx);
  } catch (e) {
    const respaldo = comoModelo(RESPALDO);
    if (!respaldo || respaldo === modelo) throw e;
    console.warn(`[captura-factura] ${MODELO} no pudo leerla; se reintenta con ${RESPALDO}`, e);
    return leerCon(respaldo, archivos, ctx);
  }
}

async function leerCon(modelo: LanguageModel, archivos: { buffer: Buffer; mime: string }[], ctx: ContextoLectura): Promise<LecturaIa> {
  const { output } = await generateText({
    model: modelo,
    output: Output.object({ schema: esquemaLecturaIa }),
    instructions: INSTRUCCIONES,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            ctx.empresa ? `La empresa que compró es ${ctx.empresa}.` : '',
            archivos.length > 1 ? `La factura ocupa ${archivos.length} fotos, en orden.` : 'Esta es la factura.',
          ].filter(Boolean).join(' '),
        },
        ...archivos.map((a) => ({ type: 'file' as const, mediaType: a.mime, data: a.buffer })),
      ],
    }],
    abortSignal: AbortSignal.timeout(90_000),
  });
  return output;
}
