/**
 * POST /api/facturas/[id]/anular
 * Anula un e-CF cambiando su estado a ANULADO.
 * Para anulaciones formales ante DGII se debe emitir una Nota de Crédito (tipo 34).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';

const ESTADOS_ANULABLES = ['BORRADOR', 'EN_PROCESO', 'ACEPTADO', 'ACEPTADO_CONDICIONAL', 'RECHAZADO'];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const docId = parseInt(id);
  if (isNaN(docId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [doc] = await db
    .select({ id: ecfDocuments.id, estado: ecfDocuments.estado, encf: ecfDocuments.encf, tipoEcf: ecfDocuments.tipoEcf })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)))
    .limit(1);

  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

  if (doc.estado === 'ANULADO') {
    return NextResponse.json({ error: 'El comprobante ya está anulado' }, { status: 409 });
  }

  if (!ESTADOS_ANULABLES.includes(doc.estado)) {
    return NextResponse.json(
      { error: `No se puede anular un comprobante en estado ${doc.estado}` },
      { status: 422 }
    );
  }

  // Para comprobantes ACEPTADOS, la anulación formal requiere una Nota de Crédito (tipo 34)
  const esAceptado = doc.estado === 'ACEPTADO' || doc.estado === 'ACEPTADO_CONDICIONAL';

  await db
    .update(ecfDocuments)
    .set({ estado: 'ANULADO', updatedAt: new Date() })
    .where(eq(ecfDocuments.id, docId));

  return NextResponse.json({
    ok: true,
    encf: doc.encf,
    estado: 'ANULADO',
    nota: esAceptado
      ? 'Comprobante marcado como anulado localmente. Para anulación formal ante la DGII, emite una Nota de Crédito (tipo 34) referenciando este e-NCF.'
      : 'Comprobante anulado correctamente.',
  });
}
