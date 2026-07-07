import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarPagos,
  adminEscolarCargos,
  adminEscolarEstudiantes,
  adminEscolarConceptosPago,
} from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const estudianteId = req.nextUrl.searchParams.get('estudianteId');

  const where = [eq(adminEscolarPagos.teamId, teamId)];
  if (estudianteId) where.push(eq(adminEscolarPagos.estudianteId, parseInt(estudianteId)));

  const rows = await db
    .select({
      id: adminEscolarPagos.id,
      estudianteId: adminEscolarPagos.estudianteId,
      estudiante: adminEscolarEstudiantes.nombres,
      estudianteApellidos: adminEscolarEstudiantes.apellidos,
      cargoId: adminEscolarPagos.cargoId,
      concepto: adminEscolarConceptosPago.nombre,
      mes: adminEscolarCargos.mes,
      anio: adminEscolarCargos.anio,
      montoCentavos: adminEscolarPagos.montoCentavos,
      fechaPago: adminEscolarPagos.fechaPago,
      metodo: adminEscolarPagos.metodo,
      referencia: adminEscolarPagos.referencia,
      notas: adminEscolarPagos.notas,
      createdAt: adminEscolarPagos.createdAt,
    })
    .from(adminEscolarPagos)
    .leftJoin(adminEscolarEstudiantes, eq(adminEscolarPagos.estudianteId, adminEscolarEstudiantes.id))
    .leftJoin(adminEscolarCargos, eq(adminEscolarPagos.cargoId, adminEscolarCargos.id))
    .leftJoin(adminEscolarConceptosPago, eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id))
    .where(and(...where))
    .orderBy(desc(adminEscolarPagos.fechaPago), desc(adminEscolarPagos.id));
  return NextResponse.json({ pagos: rows });
}

/**
 * Registra un pago. Si trae cargoId, se aplica al cargo dentro de una
 * transacción: reduce saldo y actualiza estado (parcial/pagado). No se permite
 * pagar más que el saldo pendiente.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission('administracion-escolar:pagos');
  if (!auth.ok) return auth.response;
  const { teamId, user } = auth;
  const body = await req.json();
  const { cargoId, montoCentavos, fechaPago, metodo, referencia, notas, ecfDocumentId, pagoRecibidoId } = body;
  let { estudianteId, matriculaId } = body;

  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    return NextResponse.json({ error: 'montoCentavos debe ser un entero positivo' }, { status: 400 });
  }
  if (!fechaPago) return NextResponse.json({ error: 'fechaPago requerida' }, { status: 400 });

  try {
    const pago = await db.transaction(async (tx) => {
      if (cargoId) {
        const [cargo] = await tx.select().from(adminEscolarCargos)
          .where(and(eq(adminEscolarCargos.id, cargoId), eq(adminEscolarCargos.teamId, teamId)))
          .for('update')
          .limit(1);
        if (!cargo) throw new HttpError(404, 'Cargo no encontrado');
        if (cargo.estado === 'anulado') throw new HttpError(400, 'El cargo está anulado');
        if (montoCentavos > cargo.saldoCentavos) {
          throw new HttpError(400, `El pago (${montoCentavos}) excede el saldo pendiente (${cargo.saldoCentavos}).`);
        }
        const nuevoSaldo = cargo.saldoCentavos - montoCentavos;
        await tx.update(adminEscolarCargos)
          .set({
            saldoCentavos: nuevoSaldo,
            estado: nuevoSaldo === 0 ? 'pagado' : 'parcial',
            updatedAt: new Date(),
          })
          .where(eq(adminEscolarCargos.id, cargo.id));
        // Derivar estudiante/matrícula del cargo si no vinieron.
        estudianteId = estudianteId ?? cargo.estudianteId;
        matriculaId = matriculaId ?? cargo.matriculaId;
      }

      if (!estudianteId) throw new HttpError(400, 'estudianteId o cargoId requerido');

      const [row] = await tx.insert(adminEscolarPagos).values({
        teamId,
        estudianteId,
        matriculaId: matriculaId ?? null,
        cargoId: cargoId ?? null,
        ecfDocumentId: ecfDocumentId ?? null,
        pagoRecibidoId: pagoRecibidoId ?? null,
        montoCentavos,
        fechaPago,
        metodo: metodo?.trim() || null,
        referencia: referencia?.trim() || null,
        notas: notas?.trim() || null,
        createdBy: user.id,
      }).returning();
      return row;
    });
    return NextResponse.json({ pago });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
