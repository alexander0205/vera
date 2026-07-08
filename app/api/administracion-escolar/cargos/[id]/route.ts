import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCargos, ecfDocuments } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

/**
 * Vincula/desvincula el cargo a una factura (e-CF) YA EXISTENTE. No crea ni
 * emite facturas — eso vive en el motor de facturación (/api/ecf/emitir).
 * El cargo sigue siendo la fuente de verdad de la deuda (saldoCentavos); esto
 * solo guarda la referencia al documento fiscal que lo cubre.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const { ecfDocumentId } = await req.json();

  if (ecfDocumentId !== null && ecfDocumentId !== undefined) {
    const [factura] = await db.select({ id: ecfDocuments.id }).from(ecfDocuments)
      .where(and(eq(ecfDocuments.id, ecfDocumentId), eq(ecfDocuments.teamId, teamId)))
      .limit(1);
    if (!factura) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
  }

  const [row] = await db.update(adminEscolarCargos)
    .set({ ecfDocumentId: ecfDocumentId ?? null, updatedAt: new Date() })
    .where(and(eq(adminEscolarCargos.id, parseInt(id)), eq(adminEscolarCargos.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'Cargo no encontrado' }, { status: 404 });
  return NextResponse.json({ cargo: row });
}
