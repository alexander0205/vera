import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { users, emailVerificationTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Verificar el correo desde el enlace que llega por email.
 *
 * Los tres finales malos se distinguen, y no es cosmético: antes la consulta
 * filtraba por `usedAt IS NULL`, así que un enlace YA USADO no aparecía y caía
 * en la misma rama que uno caducado. Quien pulsaba dos veces —o abría el correo
 * otra vez, que es lo más normal del mundo— veía «expiró» con la cuenta ya
 * verificada, y se quedaba pensando que el registro había fallado.
 *
 * Pasó de verdad: la cuenta se verificó a los 22 segundos y el segundo clic
 * decía que había expirado.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.redirect(new URL('/sign-in?error=invalid', req.url));

  // Sin filtrar por `usedAt`: hace falta poder ver el usado para distinguirlo.
  const [record] = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.token, token))
    .limit(1);

  if (!record) {
    return NextResponse.redirect(new URL('/sign-in?error=invalid', req.url));
  }

  // Ya usado. No es un error: el correo está verificado y solo hay que entrar.
  if (record.usedAt) {
    return NextResponse.redirect(new URL('/sign-in?aviso=ya_verificado', req.url));
  }

  if (record.expiresAt < new Date()) {
    return NextResponse.redirect(new URL('/sign-in?error=expired', req.url));
  }

  await Promise.all([
    db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, record.userId)),
    db.update(emailVerificationTokens).set({ usedAt: new Date() }).where(eq(emailVerificationTokens.id, record.id)),
  ]);

  // A /bienvenida y no al panel: quien acaba de verificar viene del registro y
  // todavía no ha hecho el onboarding. Mandarlo al panel solo hace que el muro
  // lo rebote acto seguido, y esa redirección de más se ve como un parpadeo.
  // Si ya lo hizo, /bienvenida lo devuelve al panel por su cuenta.
  return NextResponse.redirect(new URL('/bienvenida?verificado=1', req.url));
}
