import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarConceptosPago } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, asc } from 'drizzle-orm';

const TIPOS = ['inscripcion', 'mensualidad', 'uniforme', 'actividad', 'otro'];

export async function GET() {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const rows = await db.select().from(adminEscolarConceptosPago)
    .where(eq(adminEscolarConceptosPago.teamId, teamId))
    .orderBy(asc(adminEscolarConceptosPago.nombre));
  return NextResponse.json({ conceptos: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { nombre, tipo, recurrente, activo } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
  const tipoNorm = TIPOS.includes(tipo) ? tipo : 'otro';
  const [row] = await db.insert(adminEscolarConceptosPago).values({
    teamId,
    nombre: nombre.trim(),
    tipo: tipoNorm,
    recurrente: recurrente ?? tipoNorm === 'mensualidad',
    activo: activo ?? true,
  }).returning();
  return NextResponse.json({ concepto: row });
}
