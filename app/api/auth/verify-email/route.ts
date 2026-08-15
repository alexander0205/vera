import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { users, emailVerificationTokens } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.redirect(new URL('/sign-in?error=invalid', req.url));

  const record = await db
    .select()
    .from(emailVerificationTokens)
    .where(and(eq(emailVerificationTokens.token, token), isNull(emailVerificationTokens.usedAt)))
    .limit(1);

  if (!record[0] || record[0].expiresAt < new Date()) {
    return NextResponse.redirect(new URL('/sign-in?error=expired', req.url));
  }

  await Promise.all([
    db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, record[0].userId)),
    db.update(emailVerificationTokens).set({ usedAt: new Date() }).where(eq(emailVerificationTokens.id, record[0].id)),
  ]);

  // A /bienvenida y no al panel: quien acaba de verificar viene del registro y
  // todavía no ha hecho el onboarding. Mandarlo al panel solo hace que el muro
  // lo rebote acto seguido, y esa redirección de más se ve como un parpadeo.
  // Si ya lo hizo, /bienvenida lo devuelve al panel por su cuenta.
  return NextResponse.redirect(new URL('/bienvenida?verificado=1', req.url));
}
