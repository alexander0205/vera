import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes, dependientes, clients } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { sincronizarSaldosDesdeFacturas } from '@/lib/administracion-escolar/queries';
import { estudianteConDependiente } from '@/lib/administracion-escolar/ficha-estudiante';
import { SEXOS_VALIDOS } from '@/lib/administracion-escolar/estudiante-utils';
import { limpiarCamposSigerd } from '@/lib/administracion-escolar/estudiante-sigerd-campos';
import { eq, and } from 'drizzle-orm';

const ESTADOS = ['activo', 'inactivo', 'retirado', 'graduado'];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  // Refleja el cobro de las facturas vinculadas antes de calcular la deuda.
  await sincronizarSaldosDesdeFacturas(teamId, parseInt(id));
  const estudiante = await estudianteConDependiente(teamId, parseInt(id));
  if (!estudiante) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ estudiante });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const body = await req.json();
  const { codigo, nombres, apellidos, sexo, fechaNacimiento, estado, dependienteId, sigerdId } = body;
  // Campos extra de la ficha: solo los que vengan en el cuerpo (update parcial).
  const extra = limpiarCamposSigerd(body, { soloPresentes: true });

  /**
   * El id del alumno en el padrón del MINERD, cuando la ficha se cruza con
   * SIGERD desde la pantalla de edición.
   *
   * Es lo que permite reconocer a este mismo niño en una sincronización futura
   * en vez de crear una segunda ficha. Se comprueba que no lo tenga ya otro
   * alumno: dos fichas con el mismo id de SIGERD hacen que la próxima
   * sincronización pise una con los datos de la otra.
   */
  let sigerdIdOk: number | null | undefined;
  if (sigerdId !== undefined) {
    sigerdIdOk = Number.isInteger(sigerdId) && sigerdId > 0 ? Number(sigerdId) : null;
    if (sigerdIdOk !== null) {
      const [ya] = await db.select({ id: adminEscolarEstudiantes.id })
        .from(adminEscolarEstudiantes)
        .where(and(
          eq(adminEscolarEstudiantes.teamId, teamId),
          eq(adminEscolarEstudiantes.sigerdId, sigerdIdOk),
        ))
        .limit(1);
      if (ya && ya.id !== parseInt(id)) {
        return NextResponse.json(
          { error: 'Ese alumno de SIGERD ya está registrado en este colegio.', estudianteId: ya.id },
          { status: 409 },
        );
      }
    }
  }

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
      ...(sexo !== undefined ? { sexo: SEXOS_VALIDOS.includes(sexo) ? sexo : null } : {}),
      ...(fechaNacimiento !== undefined ? { fechaNacimiento: fechaNacimiento || null } : {}),
      ...(estado !== undefined && ESTADOS.includes(estado) ? { estado } : {}),
      ...(dependienteId !== undefined ? { dependienteId } : {}),
      ...(sigerdIdOk !== undefined ? { sigerdId: sigerdIdOk } : {}),
      ...extra,
      updatedAt: new Date(),
    })
    .where(and(eq(adminEscolarEstudiantes.id, parseInt(id)), eq(adminEscolarEstudiantes.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ estudiante: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const [row] = await db.delete(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.id, parseInt(id)), eq(adminEscolarEstudiantes.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
