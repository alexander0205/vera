import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { users, passwordResetTokens } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  if (!token || !password || password.length < 8) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const resetToken = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.token, token), isNull(passwordResetTokens.usedAt)))
    .limit(1);

  if (!resetToken[0] || resetToken[0].expiresAt < new Date()) {
    return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  await Promise.all([
    db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, resetToken[0].userId)),
    db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, resetToken[0].id)),
  ]);

  return NextResponse.json({ success: true });
}
