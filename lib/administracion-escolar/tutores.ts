/**
 * Vincular un tutor a un alumno.
 *
 * Vive aquí y no dentro de la ruta porque lo hacen dos sitios: el panel de
 * tutores de la ficha (uno a uno, sobre un alumno que ya existe) y el alta de
 * estudiante (varios de golpe, dentro de la misma transacción que crea al
 * alumno). Duplicarlo era garantizar que un día uno de los dos se olvidara de
 * re-apuntar el beneficiario y las facturas de ese alumno salieran sin él.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarEstudianteTutores,
  adminEscolarEstudiantes,
  adminEscolarTutores,
  dependientes,
} from '@/lib/db/schema';

/** La transacción de drizzle, tal como la entrega `db.transaction`. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const RELACIONES = ['padre', 'madre', 'tutor', 'cuidador', 'otro'] as const;

export interface VinculoTutor {
  tutorId: number;
  relacion: string;
  responsablePago: boolean;
}

export type ResultadoVinculo =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * Ata un tutor a un alumno dentro de una transacción ya abierta.
 *
 * Si el tutor es el responsable de pago hace dos cosas más, y las dos importan:
 * quita la marca a cualquier otro —solo puede haber uno— y deja al alumno
 * colgando de un beneficiario del MISMO cliente que paga. Eso último es lo que
 * permite que la factura lleve al alumno como beneficiario; con el beneficiario
 * de otro cliente, la emisión a la DGII la rechaza.
 */
export async function vincularTutor(
  tx: Tx,
  opts: { teamId: number; estudianteId: number } & VinculoTutor,
): Promise<ResultadoVinculo> {
  const { teamId, estudianteId, tutorId, responsablePago } = opts;
  const relacion = (RELACIONES as readonly string[]).includes(opts.relacion) ? opts.relacion : 'tutor';

  const [est] = await tx.select({
    id: adminEscolarEstudiantes.id,
    nombres: adminEscolarEstudiantes.nombres,
    apellidos: adminEscolarEstudiantes.apellidos,
    dependienteId: adminEscolarEstudiantes.dependienteId,
  }).from(adminEscolarEstudiantes)
    .where(and(
      eq(adminEscolarEstudiantes.id, estudianteId),
      eq(adminEscolarEstudiantes.teamId, teamId),
    ))
    .limit(1);
  if (!est) return { ok: false, error: 'Estudiante no encontrado', status: 404 };

  const [tut] = await tx.select({
    id: adminEscolarTutores.id,
    clientId: adminEscolarTutores.clientId,
  }).from(adminEscolarTutores)
    .where(and(eq(adminEscolarTutores.id, tutorId), eq(adminEscolarTutores.teamId, teamId)))
    .limit(1);
  if (!tut) return { ok: false, error: 'Tutor no encontrado', status: 404 };

  // El responsable de pago ES el contacto fiscal: sin cliente vinculado no hay
  // a quién facturarle.
  if (responsablePago && !tut.clientId) {
    return {
      ok: false,
      status: 400,
      error: 'El tutor responsable de pago debe estar vinculado a un contacto/cliente para poder facturar.',
    };
  }

  if (responsablePago) {
    await tx.update(adminEscolarEstudianteTutores)
      .set({ responsablePago: false, updatedAt: new Date() })
      .where(and(
        eq(adminEscolarEstudianteTutores.teamId, teamId),
        eq(adminEscolarEstudianteTutores.estudianteId, estudianteId),
      ));

    // El alumno tiene que ser beneficiario del mismo cliente que paga. Si su
    // beneficiario actual cuelga de otro, se reutiliza uno con el mismo nombre
    // bajo el cliente correcto o se crea, y se re-apunta el alumno.
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

  await tx.insert(adminEscolarEstudianteTutores).values({
    teamId, estudianteId, tutorId, relacion, responsablePago,
  }).onConflictDoUpdate({
    target: [adminEscolarEstudianteTutores.estudianteId, adminEscolarEstudianteTutores.tutorId],
    set: { relacion, responsablePago, updatedAt: new Date() },
  });

  return { ok: true };
}

/**
 * Valida la lista de tutores que llega en el alta de un estudiante.
 *
 * Un alumno sin tutor no se puede avisar, así que el alta lo exige.
 *
 * Ya NO se pide aquí un responsable de pago: dejó de ser un tutor marcado y
 * pasó a ser un contacto de Facturación colgado del alumno
 * (`facturar_a_client_id`). Eran la misma persona escrita dos veces, y sus
 * datos se separaban en cuanto alguien cambiaba un teléfono en Contactos.
 */
export function validarTutoresDeAlta(crudo: unknown):
  | { ok: true; tutores: VinculoTutor[] }
  | { ok: false; error: string } {
  if (!Array.isArray(crudo) || crudo.length === 0) {
    return { ok: false, error: 'El estudiante necesita al menos un tutor.' };
  }

  const tutores: VinculoTutor[] = [];
  const vistos = new Set<number>();
  for (const t of crudo as Record<string, unknown>[]) {
    const tutorId = Number(t?.tutorId);
    if (!Number.isInteger(tutorId) || tutorId <= 0) {
      return { ok: false, error: 'Hay un tutor sin identificar en la lista.' };
    }
    if (vistos.has(tutorId)) {
      return { ok: false, error: 'El mismo tutor aparece dos veces.' };
    }
    vistos.add(tutorId);
    tutores.push({
      tutorId,
      relacion: String(t?.relacion ?? 'tutor'),
      responsablePago: t?.responsablePago === true,
    });
  }

  return { ok: true, tutores };
}
