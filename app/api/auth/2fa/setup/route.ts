import { NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import * as OTPAuth from 'otpauth';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Defensa contra rotación silenciosa: si 2FA ya está habilitado, no permitir
  // generar un nuevo secret (eso invalidaría el authenticator del usuario y
  // podría abrir la puerta a un takeover). Hay que deshabilitar primero.
  if (user.twoFactorEnabled) {
    return NextResponse.json(
      { error: '2FA ya habilitado. Deshabilita primero para regenerar.' },
      { status: 400 },
    );
  }

  const totp = new OTPAuth.TOTP({
    issuer: 'Zero',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  const secret = totp.secret.base32;

  await db.update(users).set({ twoFactorSecret: secret }).where(eq(users.id, user.id));

  return NextResponse.json({ secret, uri: totp.toString() });
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { code } = await req.json();
  if (!user.twoFactorSecret) return NextResponse.json({ error: 'Setup no iniciado' }, { status: 400 });

  const totp = new OTPAuth.TOTP({
    issuer: 'Zero',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret),
  });

  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) return NextResponse.json({ error: 'Código inválido' }, { status: 400 });

  await db.update(users).set({ twoFactorEnabled: true, updatedAt: new Date() }).where(eq(users.id, user.id));

  return NextResponse.json({ success: true });
}
