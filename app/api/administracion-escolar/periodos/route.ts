import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarPeriodos } from '@/lib/db/schema';
import { cachearPorTag, invalidarEstructura, tagEstructura } from '@/lib/cache/escolar';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { rangoPeriodoEsValido } from '@/lib/administracion-escolar/periodo-utils';
import { eq, and, desc } from 'drizzle-orm';

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const rows = await cachearPorTag(
    () => db.select().from(adminEscolarPeriodos)
      .where(eq(adminEscolarPeriodos.teamId, teamId))
      .orderBy(desc(adminEscolarPeriodos.activo), desc(adminEscolarPeriodos.fechaInicio)),
    ['escolar', 'periodos', String(teamId)],
    [tagEstructura(teamId)],
  )();
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
    // El año nuevo se prepara con calma mientras se sigue cobrando el que está
    // en curso, así que nace inactivo: solo el primero de todos arranca activo.
    // Cambiar de año es un acto aparte y explícito.
    const [yaHayActivo] = await db.select({ id: adminEscolarPeriodos.id })
      .from(adminEscolarPeriodos)
      .where(and(eq(adminEscolarPeriodos.teamId, teamId), eq(adminEscolarPeriodos.activo, true)))
      .limit(1);

    const [row] = await db.insert(adminEscolarPeriodos).values({
      teamId,
      nombre: nombre.trim(),
      fechaInicio: fechaInicio || null,
      fechaFin: fechaFin || null,
      activo: activo ?? !yaHayActivo,
    }).returning();
    invalidarEstructura(teamId);
    return NextResponse.json({ periodo: row });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      const detalle = String((err as { constraint?: string }).constraint ?? '');
      return NextResponse.json({
        error: detalle.includes('un_activo')
          ? 'Ya hay otro año escolar activo. Créalo y actívalo después.'
          : 'Ya existe un período con ese nombre.',
      }, { status: 409 });
    }
    throw err;
  }
}
