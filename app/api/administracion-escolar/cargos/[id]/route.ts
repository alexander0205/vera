import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCargos, ecfDocuments } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

/**
 * Vincula/desvincula el cargo a una factura (e-CF) YA EXISTENTE. No crea ni
 * emite facturas — eso vive en el motor de facturación (/api/ecf/emitir).
 * El cargo sigue siendo la fuente de verdad de la deuda (saldoCentavos); esto
 * solo guarda la referencia al documento fiscal que lo cubre.
 */
/**
 * DESVINCULA el cargo de su factura (ecfDocumentId = null).
 *
 * Solo desvincula. VINCULAR va por POST /cargos/[id]/saldar-con-factura, que
 * además comprueba que la factura sea del cliente del tutor responsable del
 * estudiante. Aquí se aceptaba también vincular, con un permiso más laxo
 * ('gestionar' en vez de 'pagos') y sin esa comprobación: era una segunda
 * puerta, más débil, al mismo campo — bastaba con mandar el id de cualquier
 * factura del team para colgarla del cargo de otro estudiante y, de paso,
 * mostrar sus pagos en el perfil equivocado.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:pagos');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const cargoId = parseInt(id, 10);
  if (!Number.isInteger(cargoId) || cargoId <= 0) {
    return NextResponse.json({ error: 'Cargo inválido' }, { status: 400 });
  }

  const { ecfDocumentId } = await req.json().catch(() => ({}));
  if (ecfDocumentId != null) {
    return NextResponse.json(
      { error: 'Para vincular una factura usa /cargos/[id]/saldar-con-factura; aquí solo se desvincula.' },
      { status: 400 },
    );
  }

  const [row] = await db.update(adminEscolarCargos)
    .set({ ecfDocumentId: null, updatedAt: new Date() })
    .where(and(eq(adminEscolarCargos.id, cargoId), eq(adminEscolarCargos.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'Cargo no encontrado' }, { status: 404 });
  return NextResponse.json({ cargo: row });
}

/**
 * Anula un cargo puesto por error (soft-delete: estado='anulado', saldo=0). NO
 * hace hard-delete — el cargo queda como registro histórico. Los cargos
 * `anulado` ya están excluidos de todas las sumas de deuda (ESTADOS_DEUDA) y de
 * `sincronizarSaldosDesdeFacturas`, así que dejan de inflar la deuda.
 *
 * Guardas (respeta la regla unidireccional cargo↔factura):
 *  - Un cargo con factura vinculada NO se anula directo: primero hay que
 *    desvincular la factura (PATCH ecfDocumentId=null) o anular la factura en
 *    el motor fiscal. Así el cobro sigue viviendo en la factura, no aquí.
 *  - Un cargo ya `anulado` es no-op idempotente.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;

  const [cargo] = await db.select({
      id: adminEscolarCargos.id,
      estado: adminEscolarCargos.estado,
      ecfDocumentId: adminEscolarCargos.ecfDocumentId,
    })
    .from(adminEscolarCargos)
    .where(and(eq(adminEscolarCargos.id, parseInt(id)), eq(adminEscolarCargos.teamId, teamId)))
    .limit(1);
  if (!cargo) return NextResponse.json({ error: 'Cargo no encontrado' }, { status: 404 });

  if (cargo.estado === 'anulado') return NextResponse.json({ cargo });

  if (cargo.ecfDocumentId != null) {
    return NextResponse.json(
      { error: 'El cargo tiene una factura vinculada. Desvincula o anula la factura antes de anular el cargo.' },
      { status: 409 },
    );
  }

  const [row] = await db.update(adminEscolarCargos)
    .set({ estado: 'anulado', saldoCentavos: 0, updatedAt: new Date() })
    .where(and(eq(adminEscolarCargos.id, parseInt(id)), eq(adminEscolarCargos.teamId, teamId)))
    .returning();
  return NextResponse.json({ cargo: row });
}
