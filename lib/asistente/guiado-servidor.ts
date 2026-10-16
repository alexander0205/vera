import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ClienteApi } from './api';
import {
  armarMensajeGuiado, avanzarGuiado, bloquePaso, detectarCreacionConversada, iniciarGuiado, leerEstado,
  type BuscadoresGuiado, type Estado, type Opcion, type RespuestaGuiada,
} from './guiado';
import { leerLineas, prefillDeBorrador, prefillDeNota } from './formulario';

const TASAS = ['0.18', '0.16', '0', 'exento'] as const;
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

/** Búsquedas de lectura sobre la empresa de la persona, por la misma API que usa la pantalla. */
export function buscadoresGuiado(api: ClienteApi): BuscadoresGuiado {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
  return {
    hoy,
    async clientes(q) {
      const d = await api.get<{ clientes?: { id: number; razonSocial: string; rnc?: string | null; email?: string | null }[] }>('/api/clientes', { q, limit: 8 });
      return (d.clientes ?? []).slice(0, 8).map((c): Opcion => ({ id: c.id, nombre: c.razonSocial, rnc: c.rnc ?? undefined, email: c.email ?? undefined }));
    },
    async productos(q) {
      const d = await api.get<{ productos?: { id: number; nombre: string; precioDOP?: number; tasaItbis?: string; tipo?: string }[] }>('/api/productos', { contexto: 'facturacion', q, limit: 8 });
      return (d.productos ?? []).slice(0, 8).map((p): Opcion => ({
        id: p.id, nombre: p.nombre, precio: num(p.precioDOP), tasa: TASAS.find((t) => t === p.tasaItbis) ?? '0.18', bien: p.tipo === 'bien',
      }));
    },
    async facturas(q, soloBorradores) {
      const d = await api.get<{ docs?: { id: number; codigo?: string | null; encf?: string | null; razonSocialComprador?: string | null; montoTotal: number; pagado?: number }[] }>(
        '/api/facturas', { search: q, limit: 8, ...(soloBorradores ? { estado: 'BORRADOR' } : {}) });
      return (d.docs ?? []).slice(0, 8).map((f): Opcion => ({
        id: f.id, nombre: `${f.encf || f.codigo || `Factura ${f.id}`} - ${f.razonSocialComprador ?? 'consumo final'}`,
        saldo: Math.max(0, (num(f.montoTotal) - num(f.pagado)) / 100), total: num(f.montoTotal) / 100,
      }));
    },
    async cotizaciones(q) {
      const d = await api.get<{ cotizaciones?: { id: number; numero: string; razonSocialComprador?: string | null; montoTotal: number; estado: string }[] }>('/api/cotizaciones', { q });
      return (d.cotizaciones ?? [])
        .filter((c) => ['borrador', 'enviada', 'aceptada'].includes(c.estado))
        .slice(0, 8)
        .map((c): Opcion => ({ id: c.id, nombre: `${c.numero} - ${c.razonSocialComprador ?? 'sin cliente'}`, total: num(c.montoTotal) / 100 }));
    },
    async detalleFactura(id, modo) {
      const d = await api.get<unknown>(`/api/facturas/${id}`);
      const p = modo === 'borrador' ? prefillDeBorrador(d) : prefillDeNota(d, modo === 'credito');
      return { error: p.error, lineas: leerLineas(p.valores.lineas) };
    },
  };
}

// ── Firma del estado ───────────────────────────────────────────────────────
// El estado de la conversación viaja en el texto del mensaje. Se firma con HMAC (atado a empresa, persona y
// conversación) para que un texto que alguien logre meter en un mensaje del asistente no pueda hacerse pasar
// por un estado: sin la firma, el paso no se acepta. Además caduca.

const VIGENCIA_MS = 3 * 60 * 60_000;
const BLOQUE_PASO = /```paso\n([\s\S]*?)\n```/;

function secreto(): string | null {
  const s = process.env.AUTH_SECRET;
  return s && s.length >= 16 ? s : null;
}
const firmaDe = (clave: string, ctx: string, ts: number, json: string) => createHmac('sha256', clave).update(`paso|${ctx}|${ts}|${json}`).digest('hex');

/** Reemplaza el bloque ```paso del mensaje por uno firmado. Sin secreto configurado se quita (el flujo no continúa). */
export function firmarPaso(contenido: string, ctx: string, ahora = Date.now()): string {
  const m = contenido.match(BLOQUE_PASO);
  if (!m) return contenido;
  const clave = secreto();
  if (!clave) return contenido.replace(BLOQUE_PASO, '').trim();
  return contenido.replace(BLOQUE_PASO, () => '```paso\n' + `${ahora}.${firmaDe(clave, ctx, ahora, m[1])}\n${m[1]}` + '\n```');
}

/** El estado del mensaje, solo si la firma es válida para esta conversación y no caducó. */
export function abrirPaso(contenido: string | null | undefined, ctx: string, ahora = Date.now()): Estado | null {
  const clave = secreto();
  const m = (contenido ?? '').match(BLOQUE_PASO);
  if (!clave || !m) return null;
  const corte = m[1].indexOf('\n');
  if (corte < 0) return null;
  const [tsTxt, firma] = m[1].slice(0, corte).split('.');
  const json = m[1].slice(corte + 1);
  const ts = Number(tsTxt);
  if (!Number.isInteger(ts) || ahora - ts > VIGENCIA_MS || ts - ahora > 60_000 || !/^[0-9a-f]{64}$/.test(firma ?? '')) return null;
  const esperada = Buffer.from(firmaDe(clave, ctx, ts, json), 'hex');
  const recibida = Buffer.from(firma, 'hex');
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  return leerEstado('```paso\n' + json + '\n```');
}

export interface SalidaGuiada { contenido: string; chips: string[] }

/**
 * Si la conversación está en un flujo guiado (o el mensaje lo inicia), devuelve la
 * respuesta; `null` = no aplica y el mensaje sigue el camino de siempre.
 * `ultimoAsistente` es el mensaje del asistente INMEDIATAMENTE anterior al de la persona.
 */
export async function responderGuiado(texto: string, ultimoAsistente: string | null, api: ClienteApi, ctx: string): Promise<SalidaGuiada | null> {
  const estado = abrirPaso(ultimoAsistente, ctx);
  const b = buscadoresGuiado(api);
  let r: RespuestaGuiada | null = null;
  if (estado) {
    try {
      r = await avanzarGuiado(estado, texto, b);
    } catch {
      return { contenido: firmarPaso(`No pude consultar tus datos ahora. Intenta de nuevo en un momento.\n\n${bloquePaso(estado)}`, ctx), chips: ['Cancelar'] };
    }
    if (r.abandona) return null;
  } else {
    const det = detectarCreacionConversada(texto);
    if (!det) return null;
    r = iniciarGuiado(det.id, det.valores);
    // «Factura para Colegio X» / «cotización para X»: si ya dijo el cliente, se busca de una vez.
    if (det.id === 'cotizacion' && det.valores.clienteNombre && r.estado) {
      try {
        const sig = await avanzarGuiado(r.estado, det.valores.clienteNombre, b);
        if (!sig.abandona) r = { ...sig, texto: `${r.texto.split('\n\n')[0]}\n\n${sig.texto}` };
      } catch { /* se pregunta normal */ }
    }
  }
  return { contenido: firmarPaso(armarMensajeGuiado(r), ctx), chips: r.chips.slice(0, 5) };
}
