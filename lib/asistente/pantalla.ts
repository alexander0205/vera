/**
 * La pantalla en la que está la persona cuando le pregunta al asistente.
 *
 * El navegador manda la ruta (solo el pathname). Aquí se valida contra las
 * pantallas reales —las del mapa y los patrones de registro— y se deduce de
 * qué registro se trata. Es una PISTA para entender «esta factura», «¿está
 * pagada?»: los datos igual se piden por la API con la sesión de la persona,
 * que es la que impone empresa y permisos. Una ruta inventada no abre nada.
 */

import { MAPA_SISTEMA } from './mapa-sistema';
import { PATRONES_REGISTRO, rutaLimpia } from './enlaces';

export type TipoRegistro = 'factura' | 'cotizacion' | 'compra' | 'producto' | 'recurrente' | 'estudiante';

export interface PantallaActual {
  ruta: string;
  /** Título de la pantalla en el mapa; null en la de un registro. */
  titulo: string | null;
  menu: string | null;
  registro?: { tipo: TipoRegistro; id: number };
}

const TIPOS: { prefijo: string; tipo: TipoRegistro }[] = [
  { prefijo: '/dashboard/facturas-recurrentes/', tipo: 'recurrente' },
  { prefijo: '/dashboard/facturas/', tipo: 'factura' },
  { prefijo: '/dashboard/cotizaciones/', tipo: 'cotizacion' },
  { prefijo: '/dashboard/compras/local/', tipo: 'compra' },
  { prefijo: '/dashboard/productos/', tipo: 'producto' },
  { prefijo: '/escolar/estudiantes/', tipo: 'estudiante' },
];

export const NOMBRE_REGISTRO: Record<TipoRegistro, string> = {
  factura: 'una factura',
  cotizacion: 'una cotización',
  compra: 'una compra',
  producto: 'un producto',
  recurrente: 'una factura recurrente',
  estudiante: 'un estudiante',
};

export function interpretarPantalla(cruda: unknown): PantallaActual | null {
  // Solo rutas del propio sitio, nunca una URL con otro origen.
  if (typeof cruda !== 'string' || cruda.length > 200 || !cruda.startsWith('/') || cruda.startsWith('//')) return null;
  const ruta = rutaLimpia(cruda);
  if (!ruta) return null;

  if (PATRONES_REGISTRO.some((p) => p.patron.test(ruta))) {
    const hallado = TIPOS.find((t) => ruta.startsWith(t.prefijo));
    const id = hallado ? Number(ruta.slice(hallado.prefijo.length)) : NaN;
    if (hallado && Number.isSafeInteger(id) && id > 0) {
      return { ruta, titulo: null, menu: null, registro: { tipo: hallado.tipo, id } };
    }
    return null;
  }

  const e = MAPA_SISTEMA.find((x) => x.ruta === ruta);
  return e ? { ruta, titulo: e.titulo, menu: e.menu } : null;
}
