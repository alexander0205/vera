/**
 * Verificación del correo al registrarse.
 *
 * Solo aplica a quien entra con contraseña. Quien entra por Google llega con
 * `email_verified` en true desde `lib/auth/alta.ts`: Google ya comprobó que el
 * correo es suyo, y volvérselo a pedir sería hacerle demostrar dos veces lo
 * mismo.
 */

import { randomBytes } from 'crypto';
import { eq, and, isNull, gt, desc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { emailVerificationTokens } from '@/lib/db/schema';
import { sendEmailVerificationEmail } from '@/lib/email';

/** Un día. Suficiente para quien lo abre al otro día, corto para un enlace filtrado. */
const VIDA_MS = 24 * 60 * 60 * 1000;

/**
 * Crea el token y manda el correo.
 *
 * Devuelve si el envío salió, pero NO lanza: si Resend falla justo cuando
 * alguien se registra, la cuenta ya está creada y tumbar la petición dejaría a
 * esa persona sin cuenta y sin saber por qué. Se registra el fallo y la
 * pantalla siguiente ofrece reenviar.
 */
export async function mandarVerificacion(
  usuario: { id: number; email: string; name: string | null },
): Promise<boolean> {
  const token = randomBytes(32).toString('hex');

  await db.insert(emailVerificationTokens).values({
    userId: usuario.id,
    token,
    expiresAt: new Date(Date.now() + VIDA_MS),
  });

  try {
    await sendEmailVerificationEmail(usuario.email, token, usuario.name);
    return true;
  } catch (e) {
    console.error('[verificacion] no se pudo enviar el correo a', usuario.email, e);
    return false;
  }
}

/**
 * ¿Hay un enlace vivo ya mandado?
 *
 * Sirve para no volver a generar uno en cada carga de la pantalla de espera:
 * cada token nuevo es un correo más en la bandeja de alguien que ya tiene el
 * suyo, y termina pareciendo spam nuestro.
 */
export async function tieneEnlaceVivo(userId: number): Promise<boolean> {
  const [vivo] = await db
    .select({ id: emailVerificationTokens.id })
    .from(emailVerificationTokens)
    .where(and(
      eq(emailVerificationTokens.userId, userId),
      isNull(emailVerificationTokens.usedAt),
      gt(emailVerificationTokens.expiresAt, new Date()),
    ))
    .orderBy(desc(emailVerificationTokens.id))
    .limit(1);

  return !!vivo;
}
