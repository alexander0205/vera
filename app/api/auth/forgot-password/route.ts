import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { users, passwordResetTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendPasswordResetEmail } from '@/lib/email';
import { randomBytes } from 'crypto';

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });

  const user = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  // Always return success to avoid user enumeration
  if (!user[0]) return NextResponse.json({ success: true });

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokens).values({
    userId: user[0].id,
    token,
    expiresAt,
  });

  try {
    await sendPasswordResetEmail(email, token, user[0].name);
  } catch (e) {
    console.error('Error sending reset email:', e);
  }

  return NextResponse.json({ success: true });
}
