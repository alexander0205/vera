import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq } from 'drizzle-orm';
import { P12Reader } from 'dgii-ecf';

const schema = z.object({
  certP12: z.string().min(1),     // base64
  certPassword: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) {
      return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const { certP12, certPassword } = parsed.data;

    // Validar que el P12 se puede leer con la contraseña dada
    try {
      const reader = new P12Reader(certPassword);
      const certs = reader.getKeyFromStringBase64(certP12);
      if (!certs.key || !certs.cert) {
        return NextResponse.json(
          { error: 'El certificado no contiene clave privada o certificado público. Verifica el archivo y la contraseña.' },
          { status: 422 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'No se pudo leer el certificado. Verifica que el archivo y la contraseña sean correctos.' },
        { status: 422 }
      );
    }

    // Guardar en BD
    await db
      .update(teams)
      .set({ certP12, certPassword, updatedAt: new Date() })
      .where(eq(teams.id, teamId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[/api/equipo/certificado]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
