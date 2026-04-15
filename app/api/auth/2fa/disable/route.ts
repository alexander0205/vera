import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { comparePasswords } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { password } = await req.json();
  const valid = await comparePasswords(password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 400 });

  await db.update(users)
    .set({ twoFactorEnabled: false, twoFactorSecret: null, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({ success: true });
}
