import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes, dependientes, clients } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { deudaEstudiante, sincronizarSaldosDesdeFacturas } from '@/lib/administracion-escolar/queries';
import { eq, and } from 'drizzle-orm';

const ESTADOS = ['activo', 'inactivo', 'retirado', 'graduado'];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await params;
  const [estudiante] = await db.select().from(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.id, parseInt(id)), eq(adminEscolarEstudiantes.teamId, teamId)))
    .limit(1);
  if (!estudiante) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  // Refleja el cobro de las facturas vinculadas antes de calcular la deuda.
  await sincronizarSaldosDesdeFacturas(teamId, estudiante.id);
  const deudaCentavos = await deudaEstudiante(teamId, estudiante.id);

  // Enlace opcional a Contactos (dependiente del cliente/tutor).
  let dependiente: { nombre: string; apellido: string; clienteId: number; clienteRazonSocial: string } | null = null;
  if (estudiante.dependienteId) {
    const [row] = await db
      .select({
        nombre: dependientes.nombre,
        apellido: dependientes.apellido,
        clienteId: clients.id,
        clienteRazonSocial: clients.razonSocial,
      })
      .from(dependientes)
      .innerJoin(clients, eq(dependientes.clientId, clients.id))
      .where(and(eq(dependientes.id, estudiante.dependienteId), eq(dependientes.teamId, teamId)))
      .limit(1);
    dependiente = row ?? null;
  }

  return NextResponse.json({ estudiante: { ...estudiante, deudaCentavos, dependiente } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const { codigo, nombres, apellidos, fechaNacimiento, estado, dependienteId } = await req.json();

  // dependienteId: null desvincula; si viene un id, debe pertenecer al team.
  if (dependienteId !== undefined && dependienteId !== null) {
    const [dep] = await db.select({ id: dependientes.id }).from(dependientes)
      .where(and(eq(dependientes.id, dependienteId), eq(dependientes.teamId, teamId)))
      .limit(1);
    if (!dep) return NextResponse.json({ error: 'Dependiente no encontrado' }, { status: 404 });
  }

  const [row] = await db.update(adminEscolarEstudiantes)
    .set({
      ...(codigo !== undefined ? { codigo: codigo?.trim() || null } : {}),
      ...(nombres !== undefined ? { nombres: nombres.trim() } : {}),
      ...(apellidos !== undefined ? { apellidos: apellidos.trim() } : {}),
      ...(fechaNacimiento !== undefined ? { fechaNacimiento: fechaNacimiento || null } : {}),
      ...(estado !== undefined && ESTADOS.includes(estado) ? { estado } : {}),
      ...(dependienteId !== undefined ? { dependienteId } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(adminEscolarEstudiantes.id, parseInt(id)), eq(adminEscolarEstudiantes.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ estudiante: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const [row] = await db.delete(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.id, parseInt(id)), eq(adminEscolarEstudiantes.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
