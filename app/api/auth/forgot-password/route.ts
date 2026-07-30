import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { users, passwordResetTokens } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { sendPasswordResetEmail } from '@/lib/email';
import { randomBytes } from 'crypto';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  // Rate limit: 3/min/IP — defensa contra enumeración y spam de emails.
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  const rl = rateLimit(`forgot:${ip}`, 3, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intenta en 1 minuto.' },
      { status: 429 },
    );
  }

  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });

  // Measure work done in the "user exists" path so we can pad the
  // "user does not exist" path to a similar duration. This makes
  // timing-based account enumeration significantly harder.
  const startedAt = Date.now();

  // Comparación case-insensitive a propósito: normalizamos el email al
  // guardarlo, pero un registro viejo con mayúsculas dejaba de matchear aquí
  // y el reset fallaba en silencio (el handler siempre responde success).
  const needle = email.trim().toLowerCase();
  const user = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${needle}`)
    .limit(1);

  if (user[0]) {
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
  } else {
    // Pad the response so timing matches the existing-user path closely.
    // Target ~1.0-1.5s minimum total handler time.
    const elapsed = Date.now() - startedAt;
    const target = 1000 + Math.floor(Math.random() * 500);
    if (elapsed < target) {
      await new Promise((r) => setTimeout(r, target - elapsed));
    }
  }

  // Always return success to avoid user enumeration via response body / status.
  return NextResponse.json({ success: true });
}
