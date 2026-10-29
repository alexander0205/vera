/**
 * Las notificaciones de pagos: qué tipos hay, quién las ve y cuándo cuenta una
 * como «no leída».
 *
 * Todo puro y sin base de datos, para que lo importen igual el servidor (que
 * decide a quién avisar) y la campana (que decide si se muestra), y para que
 * se pueda probar sin conectar nada.
 */

import type { Permission } from '@/lib/config/roles';

export type TipoNotificacion = 'comprobante' | 'pago_en_linea';

export const TIPOS_NOTIFICACION: readonly TipoNotificacion[] = ['comprobante', 'pago_en_linea'];

/**
 * Con qué permiso se entera cada tipo. Basta UNO de la lista.
 *
 * Se avisa a quien puede ACTUAR sobre el pago, no a quien solo puede mirar:
 *
 *  · `comprobante` → `administracion-escolar:pagos`. Es el permiso que exigen
 *    las rutas de aprobar y rechazar (`/api/administracion-escolar/comprobantes/[id]`).
 *    Lo tienen dueño, administrador y «Personal del colegio». El Auditor solo
 *    tiene `:ver` y ni siquiera entra al módulo, así que no recibe el aviso de
 *    algo que no puede resolver.
 *  · `pago_en_linea` → `pagos:ver` (dueño y administrador, que miran los
 *    cobros de Facturación) o `administracion-escolar:pagos` (el personal del
 *    colegio, que no tiene `pagos:ver` pero es quien concilia lo cobrado).
 */
export const PERMISOS_POR_TIPO: Record<TipoNotificacion, readonly Permission[]> = {
  comprobante: ['administracion-escolar:pagos'],
  pago_en_linea: ['pagos:ver', 'administracion-escolar:pagos'],
};

/** ¿Esta persona se entera de este tipo? */
export function veTipo(permisos: readonly Permission[], tipo: TipoNotificacion): boolean {
  return PERMISOS_POR_TIPO[tipo].some((p) => permisos.includes(p));
}

/** Los tipos que le tocan según sus permisos. Vacío = la campana no le sirve. */
export function tiposVisibles(permisos: readonly Permission[]): TipoNotificacion[] {
  return TIPOS_NOTIFICACION.filter((t) => veTipo(permisos, t));
}

/** Tipo válido recibido de fuera (base de datos o petición). */
export function esTipo(v: unknown): v is TipoNotificacion {
  return typeof v === 'string' && (TIPOS_NOTIFICACION as readonly string[]).includes(v);
}

/**
 * Cuántos días hacia atrás puede estar una notificación y aún contar como «no
 * leída». Sin este tope, alguien que entra por primera vez al colegio —sin
 * marca de lectura— vería un globo con todo lo que ha llegado desde siempre.
 */
export const VENTANA_NO_LEIDAS_DIAS = 14;

/**
 * Desde cuándo cuenta una notificación como no leída: lo MÁS RECIENTE entre la
 * última vez que la persona miró y el inicio de la ventana.
 */
export function umbralNoLeidas(leidoHasta: Date | null, ahora: Date): Date {
  const inicioVentana = new Date(ahora.getTime() - VENTANA_NO_LEIDAS_DIAS * 86_400_000);
  if (!leidoHasta) return inicioVentana;
  return leidoHasta.getTime() > inicioVentana.getTime() ? leidoHasta : inicioVentana;
}

/** La regla de «no leída»: creada DESPUÉS de la marca (o de la ventana). */
export function esNoLeida(creadoEn: Date, leidoHasta: Date | null, ahora: Date): boolean {
  return creadoEn.getTime() > umbralNoLeidas(leidoHasta, ahora).getTime();
}
