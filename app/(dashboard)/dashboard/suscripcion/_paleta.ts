/**
 * La paleta de esta pantalla, en un solo sitio.
 *
 * Son los mismos siete colores de la maqueta y de zero.com.do/precios. Van
 * literales y no por el tema de MUI a propósito: el tema tiene `warning` y
 * `error` genéricos de Material, y con ellos los avisos salían naranja Google y
 * los bloqueos rojo semáforo — dos tonos que no existen en la marca y que al
 * lado de la página pública se ven de otro producto.
 *
 * Client-safe: solo constantes. Lo importan por igual el servidor que pinta la
 * tarjeta del plan y el cliente que pinta el diálogo.
 */

import type { NivelDeCambio } from '@/lib/config/suscripcion';
import type { EstadoSuscripcion } from '@/lib/suscripcion/estado';

export const AZUL  = '#3658e1';
export const NAVY  = '#102a72';
export const GRIS  = '#6b7280';
export const TINTA = '#0f1118';
export const ROJO  = '#b4232a';
export const AMBAR = '#8a5b00';
export const VERDE = '#0b7a4b';

/** Neutros de superficie: bordes, separadores y fondos de tabla. */
export const BORDE       = '#e6e8f0';
export const BORDE_TENUE = '#edeff5';
export const FILA_BORDE  = '#f2f4fa';
export const FONDO_TENUE = '#fafbfe';
export const TEXTO_MEDIO = '#3b4252';
export const TEXTO_SUAVE = '#4a5164';

/** Radio de las tarjetas grandes. Se repite tanto que vale la constante. */
export const RADIO = '16px';

// ─── El riesgo de un cambio de plan, en colores ──────────────────────────────

export interface TonoNivel {
  /** Borde y fondo de la tarjeta del plan. */
  borde: string;
  fondo: string;
  /** Pastilla de la esquina: qué le pasa a este plan de un vistazo. */
  chip: string;
  chipColor: string;
  chipFondo: string;
  /** La caja donde va la línea de `resumen`. */
  avisoFondo: string;
  avisoBorde: string;
  avisoColor: string;
}

/**
 * Un tono por nivel, con el texto del chip incluido.
 *
 * El chip dice qué te pasa a TI, no qué es el plan: «Pierdes algo» y «Solo
 * sumas» son la respuesta a la única pregunta que se hace quien mira esta
 * rejilla. «Recomendado» o «Más elegido» serían lenguaje de portada, y aquí ya
 * compró.
 */
export const TONO_NIVEL: Record<NivelDeCambio, TonoNivel> = {
  actual: {
    borde: AZUL, fondo: '#f7f9ff',
    chip: 'Plan actual', chipColor: AZUL, chipFondo: '#e7ecfd',
    avisoFondo: '#f2f5ff', avisoBorde: '#dce4fa', avisoColor: TEXTO_MEDIO,
  },
  bloquea: {
    borde: '#f0d7d8', fondo: '#ffffff',
    chip: 'No disponible', chipColor: ROJO, chipFondo: '#fdecec',
    avisoFondo: '#fdf3f3', avisoBorde: '#f6dcdc', avisoColor: ROJO,
  },
  avisa: {
    borde: BORDE, fondo: '#ffffff',
    chip: 'Pierdes algo', chipColor: AMBAR, chipFondo: '#fff4e0',
    avisoFondo: '#fffaf0', avisoBorde: '#f5e6c8', avisoColor: AMBAR,
  },
  ok: {
    borde: '#cfe7da', fondo: '#ffffff',
    chip: 'Solo sumas', chipColor: VERDE, chipFondo: '#dff5e9',
    avisoFondo: '#f3fbf6', avisoBorde: '#d7ede1', avisoColor: VERDE,
  },
};

/** Tono de un motivo suelto dentro del diálogo. `ok` no viene del veredicto. */
export const TONO_MOTIVO = {
  bloquea: { fondo: '#fdf3f3', borde: '#f6dcdc', color: ROJO },
  avisa:   { fondo: '#fffaf0', borde: '#f5e6c8', color: AMBAR },
  ok:      { fondo: '#f3fbf6', borde: '#d7ede1', color: VERDE },
} as const;

export type ClaveMotivo = keyof typeof TONO_MOTIVO;

// ─── El estado de la suscripción, en un chip ─────────────────────────────────

/**
 * `sin-billing` sale como «Cuenta interna» porque dentro de ESTA pantalla solo
 * puede significar eso: con el billing apagado la página devuelve 404, así que
 * lo único que llega aquí con ese estado es un team con `subscription_status`
 * en 'admin' — acceso que damos nosotros, sin pasar por Stripe.
 */
export const TONO_ESTADO: Record<EstadoSuscripcion, { texto: string; color: string; fondo: string }> = {
  'activa':            { texto: 'Activa',            color: VERDE, fondo: '#dff5e9' },
  'prueba':            { texto: 'En prueba',         color: AZUL,  fondo: '#e7ecfd' },
  'prueba-por-vencer': { texto: 'Prueba por vencer', color: AMBAR, fondo: '#fff4e0' },
  'mora':              { texto: 'Pago pendiente',    color: ROJO,  fondo: '#fdecec' },
  'solo-lectura':      { texto: 'Solo lectura',      color: ROJO,  fondo: '#fdecec' },
  'cerrada':           { texto: 'Sin acceso',        color: ROJO,  fondo: '#fdecec' },
  'sin-billing':       { texto: 'Cuenta interna',    color: NAVY,  fondo: '#e7ecfd' },
  'sin-plan':          { texto: 'Sin plan',          color: ROJO,  fondo: '#fdecec' },
};

// ─── Formato ─────────────────────────────────────────────────────────────────

/** «US$1,950». Sin decimales: los precios del catálogo son enteros. */
export function usd(n: number): string {
  return `US$${n.toLocaleString('es-DO')}`;
}

/** Miles con punto, como se lee en República Dominicana. */
export function numero(n: number): string {
  return n.toLocaleString('es-DO');
}

export function fechaLarga(d: Date): string {
  return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function fechaCorta(d: Date): string {
  return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });
}
