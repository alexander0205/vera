import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCargos, adminEscolarPagos, ecfDocuments } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

/**
 * Cierra el loop del flujo "facturar un cargo": vincula el cargo a la factura
 * recién creada Y registra el pago que salda el cargo, atómicamente.
 *
 * El saldo se re-lee del lado servidor (no se confía en el que tenía el cliente
 * al iniciar el prefill) para evitar saldar de más si el cargo cambió. Idempotente:
 * si el cargo ya está saldado, solo asegura el vínculo y no duplica el pago.
 *
 * El cargo (saldoCentavos) sigue siendo la fuente de verdad de la deuda; la
 * factura es solo el documento fiscal referenciado (enlace unidireccional).
 */
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('administracion-escolar:pagos');
  if (!auth.ok) return auth.response;
  const { teamId, user } = auth;
  const { id } = await params;
  const cargoId = parseInt(id, 10);
  if (!Number.isInteger(cargoId) || cargoId <= 0) {
    return NextResponse.json({ error: 'Cargo inválido' }, { status: 400 });
  }

  const { ecfDocumentId } = await req.json().catch(() => ({}));
  if (!Number.isInteger(ecfDocumentId) || ecfDocumentId <= 0) {
    return NextResponse.json({ error: 'ecfDocumentId requerido' }, { status: 400 });
  }

  // La factura debe existir y ser del team. Traemos encf/codigo para la referencia.
  const [factura] = await db
    .select({ id: ecfDocuments.id, encf: ecfDocuments.encf, codigo: ecfDocuments.codigo })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, ecfDocumentId), eq(ecfDocuments.teamId, teamId)))
    .limit(1);
  if (!factura) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });

  const referencia = (factura.encf && /^E\d/.test(factura.encf) ? factura.encf : factura.codigo) ?? `#${factura.id}`;
  const hoy = new Date().toISOString().slice(0, 10);

  try {
    const result = await db.transaction(async (tx) => {
      const [cargo] = await tx.select().from(adminEscolarCargos)
        .where(and(eq(adminEscolarCargos.id, cargoId), eq(adminEscolarCargos.teamId, teamId)))
        .for('update')
        .limit(1);
      if (!cargo) throw new HttpError(404, 'Cargo no encontrado');
      if (cargo.estado === 'anulado') throw new HttpError(400, 'El cargo está anulado');

      let pagoRegistrado = false;
      const saldo = cargo.saldoCentavos;

      if (saldo > 0) {
        await tx.insert(adminEscolarPagos).values({
          teamId,
          estudianteId: cargo.estudianteId,
          matriculaId: cargo.matriculaId,
          cargoId: cargo.id,
          ecfDocumentId,
          montoCentavos: saldo,
          fechaPago: hoy,
          metodo: 'factura',
          referencia,
          notas: `Saldado al facturar (factura ${referencia}).`,
          createdBy: user.id,
        });
        pagoRegistrado = true;
      }

      const [row] = await tx.update(adminEscolarCargos)
        .set({
          ecfDocumentId,
          ...(saldo > 0 ? { saldoCentavos: 0, estado: 'pagado' as const } : {}),
          updatedAt: new Date(),
        })
        .where(eq(adminEscolarCargos.id, cargo.id))
        .returning();

      return { cargo: row, pagoRegistrado };
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
