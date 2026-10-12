import { NextResponse } from 'next/server';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { nominaHoras } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nomina/horas/revisar — aprueba o rechaza horas. Body:
 * { ids: number[], estado: 'aprobada' | 'rechazada', motivo?: string }. Rechazar
 * pide motivo: el empleado lo ve en su enlace y puede corregir el día.
 */
export async function POST(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:correr');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const ids: number[] = Array.isArray(body?.ids) ? body.ids.filter((n: unknown) => Number.isInteger(n)) : [];
  if (ids.length === 0) return NextResponse.json({ error: 'Elige al menos un registro' }, { status: 400 });
  const estado = body?.estado;
  if (estado !== 'aprobada' && estado !== 'rechazada') {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }
  const motivo = String(body?.motivo ?? '').trim().slice(0, 300);
  if (estado === 'rechazada' && !motivo) {
    return NextResponse.json({ error: 'Escribe por qué se rechazan: el empleado lo verá' }, { status: 400 });
  }

  const filas = await db
    .update(nominaHoras)
    .set({
      estado,
      motivoRechazo: estado === 'rechazada' ? motivo : null,
      revisadoPor: auth.user.id,
      revisadoEn: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(nominaHoras.teamId, auth.teamId), inArray(nominaHoras.id, ids), ne(nominaHoras.estado, estado)))
    .returning({ id: nominaHoras.id });

  return NextResponse.json({ ok: true, revisadas: filas.length });
}
