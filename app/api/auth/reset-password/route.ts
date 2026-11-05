import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { users, passwordResetTokens } from '@/lib/db/schema';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  const { token, password } = await req.json().catch(() => ({} as { token?: unknown; password?: unknown }));
  if (typeof token !== 'string' || typeof password !== 'string' || !token || password.length < 8) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  // Primero se mira que el enlace sirva, SIN gastarlo: calcular el hash cuesta
  // cientos de milisegundos de CPU y no se le regala a quien manda enlaces inventados.
  const [vigente] = await db.select({ id: passwordResetTokens.id }).from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.token, token), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);
  if (!vigente) return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 400 });

  const passwordHash = await hashPassword(password);

  // El enlace se CONSUME y la contraseña se cambia en una sola transacción, y el
  // consumo es un UPDATE condicionado (`used_at IS NULL` y sin vencer): de dos
  // peticiones con el mismo enlace solo una encuentra la fila, y si algo falla a
  // medias no queda el enlace gastado con la contraseña sin cambiar. Antes eran
  // una lectura y dos escrituras sueltas, y «un solo uso» no estaba garantizado.
  // Importa más desde que el equipo de Zero entra con un enlace así: da acceso a
  // todas las empresas.
  const cambiada = await db.transaction(async (tx) => {
    const [gastado] = await tx.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(
        eq(passwordResetTokens.token, token),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ))
      .returning({ userId: passwordResetTokens.userId });
    if (!gastado) return false;
    // Abrir el enlace que llegó al correo prueba que el correo es de esa persona.
    await tx.update(users)
      .set({ passwordHash, emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, gastado.userId));
    return true;
  });

  if (!cambiada) return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 400 });
  return NextResponse.json({ success: true });
}
