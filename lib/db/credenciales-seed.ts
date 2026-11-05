/**
 * Contraseñas de los scripts de siembra (`db:seed`, `db:reset`).
 *
 * Aquí NO hay ninguna contraseña. La del administrador sale de una variable de
 * entorno o, si no está, se genera al azar y se muestra UNA sola vez en la
 * consola; no se guarda en ningún archivo ni se vuelve a poder leer. El repo es
 * público: una clave escrita aquí la conoce todo el mundo.
 */

import { randomBytes } from 'node:crypto';

export interface CredencialSembrada {
  valor: string;
  /** true si se generó al azar (y hay que mostrarla una vez). */
  generada: boolean;
}

/** 24 caracteres aleatorios (≈143 bits), con mayúscula, minúscula, número y símbolo. */
export function contrasenaAleatoria(): string {
  return `${randomBytes(18).toString('base64url')}Aa1!`;
}

/** La contraseña de la variable `nombre`, o una aleatoria si no existe o es muy corta. */
export function credencialDeSiembra(
  nombre: string,
  env: Record<string, string | undefined> = process.env,
): CredencialSembrada {
  const dada = env[nombre]?.trim();
  if (dada && dada.length >= 12) return { valor: dada, generada: false };
  return { valor: contrasenaAleatoria(), generada: true };
}

/** Avisa de la contraseña generada, una sola vez, sin dejarla en ningún archivo. */
export function mostrarCredencialUnaVez(etiqueta: string, c: CredencialSembrada): void {
  if (!c.generada) {
    console.log(`  ${etiqueta}: contraseña tomada de la variable de entorno (no se muestra).`);
    return;
  }
  console.log(`  ${etiqueta}: contraseña GENERADA (se muestra solo ahora, anótala): ${c.valor}`);
}
