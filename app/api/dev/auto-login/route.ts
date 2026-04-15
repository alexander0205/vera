/**
 * SOLO DESARROLLO — Auto-login para facilitar testing local.
 * Solo disponible si NODE_ENV=development.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { setSession } from '@/lib/auth/session';

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email') ?? 'admin@emitedo.test';

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    return NextResponse.json({ error: `Usuario ${email} no encontrado` }, { status: 404 });
  }

  await setSession(user);

  return NextResponse.redirect(new URL('/dashboard', request.url));
}
