import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { emailVerificationTokens } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { sendEmailVerificationEmail } from '@/lib/email';
import { randomBytes } from 'crypto';

export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.insert(emailVerificationTokens).values({ userId: user.id, token, expiresAt });

  try {
    await sendEmailVerificationEmail(user.email, token, user.name);
  } catch (e) {
    console.error('Error sending verification email:', e);
  }

  return NextResponse.json({ success: true });
}
