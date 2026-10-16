import 'server-only';
import type { ClienteApi } from './api';
import {
  armarMensajeGuiado, avanzarGuiado, bloquePaso, detectarCreacionConversada, iniciarGuiado, leerEstado,
  type BuscadoresGuiado, type Opcion, type RespuestaGuiada,
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

export interface SalidaGuiada { contenido: string; chips: string[] }

/**
 * Si la conversación está en un flujo guiado (o el mensaje lo inicia), devuelve la
 * respuesta; `null` = no aplica y el mensaje sigue el camino de siempre.
 * `ultimoAsistente` es el mensaje del asistente INMEDIATAMENTE anterior al de la persona.
 */
export async function responderGuiado(texto: string, ultimoAsistente: string | null, api: ClienteApi): Promise<SalidaGuiada | null> {
  const estado = leerEstado(ultimoAsistente);
  const b = buscadoresGuiado(api);
  let r: RespuestaGuiada | null = null;
  if (estado) {
    try {
      r = await avanzarGuiado(estado, texto, b);
    } catch {
      return { contenido: `No pude consultar tus datos ahora. Intenta de nuevo en un momento.\n\n${bloquePaso(estado)}`, chips: ['Cancelar'] };
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
  return { contenido: armarMensajeGuiado(r), chips: r.chips.slice(0, 5) };
}
