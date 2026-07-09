import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarEstudiantes,
  adminEscolarEstudianteTutores,
  adminEscolarTutores,
  clients,
} from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

const RELACIONES = ['padre', 'madre', 'tutor', 'cuidador', 'otro'];

/** Tutores asociados a un estudiante. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await params;
  const estudianteId = parseInt(id);
  const rows = await db
    .select({
      id: adminEscolarEstudianteTutores.id,
      tutorId: adminEscolarTutores.id,
      nombre: adminEscolarTutores.nombre,
      documento: adminEscolarTutores.documento,
      telefono: adminEscolarTutores.telefono,
      email: adminEscolarTutores.email,
      imagen: adminEscolarTutores.imagen,
      clientId: adminEscolarTutores.clientId,
      clienteRazonSocial: clients.razonSocial,
      relacion: adminEscolarEstudianteTutores.relacion,
      responsablePago: adminEscolarEstudianteTutores.responsablePago,
    })
    .from(adminEscolarEstudianteTutores)
    .innerJoin(adminEscolarTutores, eq(adminEscolarEstudianteTutores.tutorId, adminEscolarTutores.id))
    .leftJoin(clients, eq(adminEscolarTutores.clientId, clients.id))
    .where(and(
      eq(adminEscolarEstudianteTutores.teamId, teamId),
      eq(adminEscolarEstudianteTutores.estudianteId, estudianteId),
    ))
    .orderBy(adminEscolarEstudianteTutores.responsablePago);
  return NextResponse.json({ tutores: rows });
}

/** Asocia un tutor existente al estudiante. Si responsablePago=true, se quita
 *  la marca de cualquier otro tutor del mismo estudiante (solo uno responsable). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const estudianteId = parseInt(id);
  const { tutorId, relacion, responsablePago } = await req.json();
  if (!tutorId) return NextResponse.json({ error: 'tutorId requerido' }, { status: 400 });

  // Validar que estudiante y tutor pertenezcan al team.
  const [est] = await db.select({ id: adminEscolarEstudiantes.id }).from(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, teamId)))
    .limit(1);
  if (!est) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
  const [tut] = await db.select({ id: adminEscolarTutores.id }).from(adminEscolarTutores)
    .where(and(eq(adminEscolarTutores.id, tutorId), eq(adminEscolarTutores.teamId, teamId)))
    .limit(1);
  if (!tut) return NextResponse.json({ error: 'Tutor no encontrado' }, { status: 404 });

  const esResponsable = responsablePago ?? false;
  const row = await db.transaction(async (tx) => {
    if (esResponsable) {
      await tx.update(adminEscolarEstudianteTutores)
        .set({ responsablePago: false, updatedAt: new Date() })
        .where(and(
          eq(adminEscolarEstudianteTutores.teamId, teamId),
          eq(adminEscolarEstudianteTutores.estudianteId, estudianteId),
        ));
    }
    const [inserted] = await tx.insert(adminEscolarEstudianteTutores).values({
      teamId,
      estudianteId,
      tutorId,
      relacion: RELACIONES.includes(relacion) ? relacion : 'tutor',
      responsablePago: esResponsable,
    })
      .onConflictDoUpdate({
        target: [adminEscolarEstudianteTutores.estudianteId, adminEscolarEstudianteTutores.tutorId],
        set: {
          relacion: RELACIONES.includes(relacion) ? relacion : 'tutor',
          responsablePago: esResponsable,
          updatedAt: new Date(),
        },
      })
      .returning();
    return inserted;
  });
  return NextResponse.json({ vinculo: row });
}
