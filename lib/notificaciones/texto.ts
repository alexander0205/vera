/**
 * El texto de cada notificación de pago y lo que lleva el aviso push.
 *
 * Puro y sin base de datos: recibe los datos ya leídos y devuelve el título, el
 * detalle y el enlace. Así lo que ve el colegio se puede probar sin conectar
 * nada, y la ruta que sube el comprobante solo tiene que pasar sus datos.
 */

import { fmtDOP } from '@/lib/utils/format';
import type { TipoDeEmpresa } from './tipos';

export interface NotificacionNueva {
  tipo: TipoDeEmpresa;
  titulo: string;
  detalle: string | null;
  /** Ruta relativa de la pantalla donde se encuentra el pago. */
  enlace: string;
  /** El comprobante o el enlace de pago de origen: la llave contra repetidos. */
  refId: number;
  montoCentavos: number;
}

/** `RD$4,000` si son pesos redondos, `RD$4,000.50` si no. */
export function montoCorto(centavos: number): string {
  return fmtDOP(centavos).replace(/\.00$/, '');
}

/** Une los trozos que existan con « · ». */
const unir = (...partes: Array<string | null | undefined>) =>
  partes.map((p) => (p ?? '').trim()).filter(Boolean).join(' · ');

/**
 * Los nombres de los hijos para el detalle: hasta dos, y «+N» si hay más. Una
 * familia con cuatro hijos desbordaba el renglón de la campana.
 */
export function nombresDeHijos(estudiantes: readonly string[]): string {
  const limpios = estudiantes.map((e) => e.trim()).filter(Boolean);
  if (limpios.length <= 2) return limpios.join(', ');
  return `${limpios.slice(0, 2).join(', ')} +${limpios.length - 2}`;
}

// ── Comprobante que sube una familia ─────────────────────────────────────────

export interface DatosComprobante {
  id: number;
  montoCentavos: number;
  /** El responsable de pago, como lo conoce el colegio. */
  responsable: string | null;
  estudiantes: readonly string[];
  referencia: string | null;
}

/**
 * Dónde se revisa un comprobante: la cola de «Pagos › Comprobantes», con el
 * comprobante resaltado (`?comprobante=`, lo lee `_comprobantes-client.tsx`).
 */
export const enlaceDeComprobante = (id: number) =>
  `/escolar/pagos?tab=comprobantes&comprobante=${id}`;

export function notificacionDeComprobante(d: DatosComprobante): NotificacionNueva {
  const familia = d.responsable?.trim() ? `Familia ${d.responsable.trim()}` : 'Una familia';
  return {
    tipo: 'comprobante',
    titulo: `Comprobante de pago · ${montoCorto(d.montoCentavos)}`,
    detalle: unir(familia, nombresDeHijos(d.estudiantes), d.referencia ? `ref. ${d.referencia}` : null) || null,
    enlace: enlaceDeComprobante(d.id),
    refId: d.id,
    montoCentavos: d.montoCentavos,
  };
}

// ── Pago con tarjeta por un enlace de pago ───────────────────────────────────

export interface DatosPagoEnLinea {
  /** El `payment_links.id`: una notificación por enlace pagado. */
  linkId: number;
  montoCentavos: number;
  cliente: string | null;
  /** FA-2026-000629, o el e-NCF si la factura no tiene código propio. */
  documento: string | null;
  ecfDocumentId: number | null;
  cotizacionId: number | null;
  /** Autorización de la pasarela; es lo que el cobro lleva como referencia. */
  referencia: string | null;
  proveedor: string | null;
  /** La factura es de un cargo escolar: el personal del colegio la busca en «Pagos». */
  escolar: boolean;
}

/**
 * Dónde se encuentra un pago en línea.
 *
 *  · De un cargo escolar → «Pagos» del colegio, buscando por la autorización
 *    (`?buscar=`, lo lee `_page-client.tsx`). El personal del colegio no entra
 *    a Facturación, así que mandarlo a la factura lo dejaría en «sin acceso».
 *  · Una factura que no es escolar → su ficha en Facturación.
 *  · Una cotización → su ficha.
 */
export function enlaceDePagoEnLinea(d: Pick<DatosPagoEnLinea,
  'escolar' | 'referencia' | 'ecfDocumentId' | 'cotizacionId'>): string {
  if (d.escolar) {
    return d.referencia ? `/escolar/pagos?buscar=${encodeURIComponent(d.referencia)}` : '/escolar/pagos';
  }
  if (d.ecfDocumentId) return `/dashboard/facturas/${d.ecfDocumentId}`;
  if (d.cotizacionId) return `/dashboard/cotizaciones/${d.cotizacionId}`;
  return '/dashboard/pagos';
}

export function notificacionDePagoEnLinea(d: DatosPagoEnLinea): NotificacionNueva {
  return {
    tipo: 'pago_en_linea',
    titulo: `Pago con tarjeta · ${montoCorto(d.montoCentavos)}`,
    detalle: unir(
      d.cliente ?? 'Un cliente',
      d.documento,
      d.referencia ? `aut. ${d.referencia}` : null,
    ) || null,
    enlace: enlaceDePagoEnLinea(d),
    refId: d.linkId,
    montoCentavos: d.montoCentavos,
  };
}

// ── Lo que pasa en una tarea por revisar (personal) ──────────────────────────

export type CambioTarea = 'creada' | 'mensaje' | 'adjunto' | 'en_proceso' | 'revision' | 'completada' | 'reabierta' | 'urgente';

export interface DatosTarea {
  cambio: CambioTarea;
  tareaId: number;
  /** El título de la tarea. */
  titulo: string;
  /** Quien hizo el cambio, como firma en la conversación. */
  autor: string;
  /** Lo que escribió, o el nombre del archivo. */
  texto: string | null;
}

const QUE_HIZO: Record<CambioTarea, string> = {
  creada: 'te asignó una tarea',
  mensaje: 'respondió',
  adjunto: 'subió un archivo',
  en_proceso: 'tomó la tarea',
  revision: 'pasó a revisión',
  completada: 'completó',
  reabierta: 'volvió a abrir',
  urgente: '',
};

/** El enlace del correo, el mismo: abre la tarea en «Por revisar». */
export const enlaceDeTarea = (id: number) => `/escolar/por-revisar?tarea=${id}`;

/** «Soporte IT · Zero respondió» / «Saber: Te dejamos un video…». */
export function notificacionDeTarea(d: DatosTarea): { titulo: string; detalle: string; enlace: string } {
  const texto = d.texto?.trim() ? (d.cambio === 'adjunto' ? `📎 ${d.texto.trim()}` : d.texto.trim()) : null;
  const detalle = texto ? `${d.titulo}: ${texto}` : d.titulo;
  return {
    titulo: (d.cambio === 'urgente' ? 'URGENTE: 24 horas sin respuesta' : `${d.autor} ${QUE_HIZO[d.cambio]}`).slice(0, 160),
    detalle: detalle.length > 280 ? `${detalle.slice(0, 279).trimEnd()}…` : detalle,
    enlace: enlaceDeTarea(d.tareaId),
  };
}

// ── Aviso push ───────────────────────────────────────────────────────────────

export interface PayloadPush {
  title: string;
  body: string;
  /** Ruta relativa: el service worker la abre contra su propio origen. */
  url: string;
  /** Un mismo pago avisado dos veces en el mismo dispositivo se reemplaza, no se apila. */
  tag: string;
}

/**
 * Lo que recibe el service worker. El nombre de la empresa va en el cuerpo
 * porque una persona con varias empresas necesita saber de CUÁL es el pago
 * antes de abrirlo.
 */
export function payloadPush(n: NotificacionNueva, empresa: string | null): PayloadPush {
  return {
    title: n.titulo,
    body: unir(empresa, n.detalle),
    url: n.enlace,
    tag: `pago-${n.tipo}-${n.refId}`,
  };
}

// ── Hora legible en la campana ───────────────────────────────────────────────

const ZONA = 'America/Santo_Domingo';

/**
 * «hoy 9:40», «ayer 4:15 p. m.» o «28 oct». La misma regla que `cuando()` de las
 * tareas; está aquí aparte porque ese archivo es un componente de pantalla y
 * esto se prueba solo.
 */
export function cuandoLlego(iso: string | Date, ahora: Date = new Date()): string {
  const f = typeof iso === 'string' ? new Date(iso) : iso;
  const hora = f.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit', timeZone: ZONA });
  const dia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: ZONA });
  const ayer = new Date(ahora.getTime() - 86_400_000);
  if (dia(f) === dia(ahora)) return `hoy ${hora}`;
  if (dia(f) === dia(ayer)) return `ayer ${hora}`;
  return f.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', timeZone: ZONA });
}
