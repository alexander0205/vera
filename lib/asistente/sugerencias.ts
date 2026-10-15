/**
 * Atajos que se muestran al abrir el chat. Dependen de lo que la empresa
 * tiene activo y de lo que la persona puede ver: un colegio ve matrículas, un
 * comercio con caja ve turnos. Todas se contestan sin IA (hay una prueba que
 * lo comprueba), así que el primer clic es instantáneo y no gasta cuota.
 */

import type { ModuleKey } from '@/lib/auth/modules';
import type { Permission } from '@/lib/config/roles';

export type IconoSugerencia =
  | 'ventas' | 'cartera' | 'cobros' | 'clientes' | 'itbis' | 'revisar'
  | 'borradores' | 'inventario' | 'escolar' | 'nomina' | 'caja' | 'guia';

export interface Sugerencia {
  texto: string;
  icono: IconoSugerencia;
  /** Intención local que la contesta (la comprueba la prueba). */
  intencion: string;
}

interface Capacidades {
  tieneModulo: (m: ModuleKey) => boolean;
  puede: (p: Permission) => boolean;
}

const MAXIMO = 6;

export function sugerenciasPara(c: Capacidades): Sugerencia[] {
  const propias: Sugerencia[] = [];
  if (c.tieneModulo('escolar') && c.puede('administracion-escolar:ver')) {
    propias.push({ texto: '¿Cuántos estudiantes están matriculados?', icono: 'escolar', intencion: 'matriculas' });
  }
  if (c.tieneModulo('pos') && c.puede('caja:ver')) {
    propias.push({ texto: '¿Hay turnos de caja abiertos?', icono: 'caja', intencion: 'turnos-caja' });
  }
  if (c.tieneModulo('nomina') && c.puede('empleados:ver')) {
    propias.push({ texto: '¿Cuántos empleados activos tengo?', icono: 'nomina', intencion: 'nomina' });
  }

  const base: Sugerencia[] = [
    { texto: '¿Cuánto he vendido este mes?', icono: 'ventas', intencion: 'ventas' },
  ];
  if (c.puede('facturas:ver')) base.push({ texto: '¿Quién me debe y cuánto?', icono: 'cartera', intencion: 'cartera' });
  base.push({ texto: '¿Cuáles son mis mejores clientes?', icono: 'clientes', intencion: 'mejores-clientes' });
  base.push({ texto: 'Resumen de ITBIS del mes', icono: 'itbis', intencion: 'itbis' });
  base.push({ texto: '¿Tengo facturas por revisar?', icono: 'revisar', intencion: 'por-revisar' });
  if (c.puede('facturas:ver')) base.push({ texto: '¿Cuántos borradores tengo?', icono: 'borradores', intencion: 'borradores' });
  if (c.puede('productos:ver')) base.push({ texto: '¿Qué productos están por agotarse?', icono: 'inventario', intencion: 'stock-bajo' });
  base.push({ texto: '¿Cómo van los cobros por método de pago?', icono: 'cobros', intencion: 'cobros-metodo' });
  if (c.puede('cotizaciones:ver')) base.push({ texto: '¿Dónde veo mis cotizaciones?', icono: 'guia', intencion: 'guia' });

  // Lo propio de la empresa primero (entre las dos primeras de siempre), luego el resto.
  const [ventas, ...resto] = base;
  return [ventas, ...propias, ...resto].slice(0, MAXIMO);
}
