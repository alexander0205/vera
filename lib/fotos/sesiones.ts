import { createHash, randomBytes } from 'crypto';

/**
 * Token de la sesión de captura: el permiso que viaja dentro del QR.
 *
 * Es lo único que autoriza al teléfono, que NO tiene sesión de usuario. Por eso
 * es corto de vida, de un solo uso y atado a (team, entidad, entidadId).
 *
 * Sin dependencias de base de datos ni de red a propósito: así se puede probar
 * la caducidad y el formato sin levantar nada.
 */

/** Minutos que vive el QR. Suficiente para caminar hasta el alumno y disparar;
 *  no tanto como para que una foto del QR en un pizarrón sirva mañana. */
export const MINUTOS_VIGENCIA = 10;

/** 32 bytes = 256 bits de entropía. Nada de ids correlativos: un token no se
 *  adivina ni se enumera probando el siguiente. */
export function generarToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Lo que se guarda en la base. Un volcado de `fotos_sesiones` no permite
 *  reconstruir ningún token ni abrir la cámara de nadie. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Forma esperada del token: 43 caracteres base64url. Descarta basura antes de
 *  tocar la base (y evita que un token gigante nos haga hashear 10 MB). */
export function formatoTokenValido(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function fechaExpiracion(desde: Date = new Date()): Date {
  return new Date(desde.getTime() + MINUTOS_VIGENCIA * 60_000);
}

export type EstadoSesion = 'valida' | 'expirada' | 'usada';

export interface SesionEvaluable {
  expiraEn: Date;
  usadaEn: Date | null;
}

/**
 * Estado de una sesión. "usada" gana sobre "expirada": si ya se tomó la foto,
 * lo que el escritorio tiene que saber es que llegó, no que el reloj corrió.
 */
export function estadoSesion(sesion: SesionEvaluable, ahora: Date = new Date()): EstadoSesion {
  if (sesion.usadaEn) return 'usada';
  if (sesion.expiraEn.getTime() <= ahora.getTime()) return 'expirada';
  return 'valida';
}

/** Segundos que le quedan al QR, para el contador del escritorio. */
export function segundosRestantes(sesion: SesionEvaluable, ahora: Date = new Date()): number {
  return Math.max(0, Math.floor((sesion.expiraEn.getTime() - ahora.getTime()) / 1000));
}
