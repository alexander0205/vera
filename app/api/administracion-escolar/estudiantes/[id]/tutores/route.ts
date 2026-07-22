import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarEstudiantes,
  adminEscolarEstudianteTutores,
  adminEscolarTutores,
  clients,
  dependientes,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

const RELACIONES = ['padre', 'madre', 'tutor', 'cuidador', 'otro'];

/** Tutores asociados a un estudiante. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
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
    .innerJoin(adminEscolarTutores, and(
      eq(adminEscolarEstudianteTutores.tutorId, adminEscolarTutores.id),
      eq(adminEscolarTutores.teamId, teamId),
    ))
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
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const estudianteId = parseInt(id);
  const { tutorId, relacion, responsablePago } = await req.json();
  if (!tutorId) return NextResponse.json({ error: 'tutorId requerido' }, { status: 400 });

  // Validar que estudiante y tutor pertenezcan al team.
  const [est] = await db.select({
    id: adminEscolarEstudiantes.id,
    nombres: adminEscolarEstudiantes.nombres,
    apellidos: adminEscolarEstudiantes.apellidos,
    dependienteId: adminEscolarEstudiantes.dependienteId,
  }).from(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, teamId)))
    .limit(1);
  if (!est) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
  const [tut] = await db.select({ id: adminEscolarTutores.id, clientId: adminEscolarTutores.clientId })
    .from(adminEscolarTutores)
    .where(and(eq(adminEscolarTutores.id, tutorId), eq(adminEscolarTutores.teamId, teamId)))
    .limit(1);
  if (!tut) return NextResponse.json({ error: 'Tutor no encontrado' }, { status: 404 });

  const esResponsable = responsablePago ?? false;

  // Regla: el tutor responsable de pago ES el contacto fiscal → debe tener un
  // cliente vinculado (el comprador de las facturas). Sin él no se puede facturar.
  if (esResponsable && !tut.clientId) {
    return NextResponse.json({
      error: 'El tutor responsable de pago debe estar vinculado a un contacto/cliente para poder facturar.',
    }, { status: 400 });
  }

  const row = await db.transaction(async (tx) => {
    if (esResponsable) {
      await tx.update(adminEscolarEstudianteTutores)
        .set({ responsablePago: false, updatedAt: new Date() })
        .where(and(
          eq(adminEscolarEstudianteTutores.teamId, teamId),
          eq(adminEscolarEstudianteTutores.estudianteId, estudianteId),
        ));

      // Coherencia forzada: el estudiante debe ser dependiente del MISMO cliente
      // que paga (para que la factura pueda armar el beneficiario). Si su
      // dependiente actual no está bajo ese cliente, se reutiliza uno con el
      // mismo nombre o se crea, y se re-apunta estudiante.dependienteId.
      let depCoherente = false;
      if (est.dependienteId) {
        const [dep] = await tx.select({ clientId: dependientes.clientId })
          .from(dependientes).where(eq(dependientes.id, est.dependienteId)).limit(1);
        depCoherente = dep?.clientId === tut.clientId;
      }
      if (!depCoherente) {
        const [existente] = await tx.select({ id: dependientes.id }).from(dependientes)
          .where(and(
            eq(dependientes.teamId, teamId),
            eq(dependientes.clientId, tut.clientId!),
            eq(dependientes.nombre, est.nombres),
            eq(dependientes.apellido, est.apellidos),
          )).limit(1);
        let depId = existente?.id;
        if (!depId) {
          const [creado] = await tx.insert(dependientes).values({
            teamId, clientId: tut.clientId!,
            nombre: est.nombres, apellido: est.apellidos,
          }).returning({ id: dependientes.id });
          depId = creado.id;
        }
        await tx.update(adminEscolarEstudiantes)
          .set({ dependienteId: depId, updatedAt: new Date() })
          .where(eq(adminEscolarEstudiantes.id, estudianteId));
      }
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
