import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleados } from '@/lib/db/schema';
import { origenPublico } from '@/lib/http/origen-publico';
import { generarTokenFirma, hashTokenFirma } from '@/lib/nomina/firma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nomina/empleados/[id]/horas-enlace — crea el enlace con el que el
 * empleado sube sus horas, sin cuenta en Zero. El token solo se devuelve ahora
 * (en la base queda su SHA-256) y generar otro invalida el anterior.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const token = generarTokenFirma();
  const [fila] = await db
    .update(empleados)
    .set({ horasTokenHash: hashTokenFirma(token), horasTokenCreado: new Date() })
    .where(and(eq(empleados.id, id), eq(empleados.teamId, auth.teamId)))
    .returning({ id: empleados.id });
  if (!fila) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });

  return NextResponse.json({ url: `${origenPublico(req)}/horas/${token}` });
}
