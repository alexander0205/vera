import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCargos, adminEscolarEstudianteTutores, adminEscolarTutores, ecfDocuments } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

/**
 * Cierra el loop del flujo "facturar un cargo": vincula el cargo a la factura
 * recién creada (setea `ecfDocumentId`). NO registra pago ni salda el cargo.
 *
 * Regla del negocio (Alex): todo cobro va atado a la factura y vive en el motor
 * de facturación (`pagos_recibidos`), no en un pago escolar paralelo. Tras
 * vincular, el saldo/estado del cargo se refleja de la factura vía
 * `sincronizarSaldosDesdeFacturas` (unidireccional). Para cobrar, el usuario va
 * a la factura. Idempotente: re-vincular la misma factura no cambia nada.
 */
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('administracion-escolar:pagos');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const cargoId = parseInt(id, 10);
  if (!Number.isInteger(cargoId) || cargoId <= 0) {
    return NextResponse.json({ error: 'Cargo inválido' }, { status: 400 });
  }

  const { ecfDocumentId } = await req.json().catch(() => ({}));
  if (!Number.isInteger(ecfDocumentId) || ecfDocumentId <= 0) {
    return NextResponse.json({ error: 'ecfDocumentId requerido' }, { status: 400 });
  }

  // La factura debe existir y ser del team.
  const [factura] = await db
    .select({ id: ecfDocuments.id, clientId: ecfDocuments.clientId })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, ecfDocumentId), eq(ecfDocuments.teamId, teamId)))
    .limit(1);
  if (!factura) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });

  try {
    const result = await db.transaction(async (tx) => {
      const [cargo] = await tx.select().from(adminEscolarCargos)
        .where(and(eq(adminEscolarCargos.id, cargoId), eq(adminEscolarCargos.teamId, teamId)))
        .for('update')
        .limit(1);
      if (!cargo) throw new HttpError(404, 'Cargo no encontrado');
      if (cargo.estado === 'anulado') throw new HttpError(400, 'El cargo está anulado');

      // Una factura escolar debe pertenecer al cliente del tutor responsable.
      // Sin este guard, un ID de factura válido del mismo team podía quedar
      // enlazado accidentalmente al cargo de otro estudiante/tutor.
      const [responsable] = await tx
        .select({ clientId: adminEscolarTutores.clientId })
        .from(adminEscolarEstudianteTutores)
        .innerJoin(adminEscolarTutores, eq(adminEscolarEstudianteTutores.tutorId, adminEscolarTutores.id))
        .where(and(
          eq(adminEscolarEstudianteTutores.teamId, teamId),
          eq(adminEscolarEstudianteTutores.estudianteId, cargo.estudianteId),
          eq(adminEscolarEstudianteTutores.responsablePago, true),
        ))
        .limit(1);
      if (!responsable?.clientId) {
        throw new HttpError(400, 'El estudiante no tiene un tutor responsable vinculado a un contacto');
      }
      if (factura.clientId !== responsable.clientId) {
        throw new HttpError(400, 'La factura pertenece a un contacto distinto al tutor responsable del estudiante');
      }

      // Solo vincula. El cobro se hace luego en la factura; el saldo/estado del
      // cargo se refleja de la factura al leer el perfil (sincronización).
      const [row] = await tx.update(adminEscolarCargos)
        .set({ ecfDocumentId, updatedAt: new Date() })
        .where(eq(adminEscolarCargos.id, cargo.id))
        .returning();

      return { cargo: row };
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
