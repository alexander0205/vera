import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarPeriodos } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { rangoPeriodoEsValido } from '@/lib/administracion-escolar/periodo-utils';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const rows = await db.select().from(adminEscolarPeriodos)
    .where(eq(adminEscolarPeriodos.teamId, teamId))
    .orderBy(desc(adminEscolarPeriodos.activo), desc(adminEscolarPeriodos.fechaInicio));
  return NextResponse.json({ periodos: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { nombre, fechaInicio, fechaFin, activo } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
  if ((fechaInicio || fechaFin) && !rangoPeriodoEsValido(fechaInicio, fechaFin)) {
    return NextResponse.json({ error: 'Fecha de inicio y fin requeridas; el fin no puede ser anterior al inicio' }, { status: 400 });
  }
  try {
    const [row] = await db.insert(adminEscolarPeriodos).values({
      teamId,
      nombre: nombre.trim(),
      fechaInicio: fechaInicio || null,
      fechaFin: fechaFin || null,
      activo: activo ?? true,
    }).returning();
    return NextResponse.json({ periodo: row });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json({ error: 'Ya existe un período con ese nombre.' }, { status: 409 });
    }
    throw err;
  }
}
