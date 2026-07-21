/**
 * POST /api/facturas/[id]/nota-debito-mora
 * Genera manualmente una Nota de Débito (tipo 33) por mora para la factura.
 *
 * La ND es BORRADOR interna, EXENTA de ITBIS, atada al padre vía moraOrigenId.
 * No se envía a la DGII. Requiere permiso `facturas:crear`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teamMembers, users } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { generarNotaDebitoMora } from '@/lib/cobranza/nota-debito-mora';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  // ── Gate: facturas:crear ────────────────────────────────────────────────────
  const [[u], [m]] = await Promise.all([
    db.select({ platformRole: users.platformRole }).from(users).where(eq(users.id, user.id)).limit(1),
    db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId))).limit(1),
  ]);
  if (!await userCanForTeam(teamId, u?.platformRole, m?.role, 'facturas:crear')) {
    return NextResponse.json({ error: 'Sin permiso para crear documentos' }, { status: 403 });
  }

  const { id } = await params;
  const ecfDocumentId = Number(id);
  if (!Number.isInteger(ecfDocumentId) || ecfDocumentId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  // El generador recibe un ID global. Verificar pertenencia antes de mutar para
  // que un miembro de otro team no pueda generar mora por un ID adivinable.
  const [factura] = await db
    .select({ id: ecfDocuments.id })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, ecfDocumentId), eq(ecfDocuments.teamId, teamId)))
    .limit(1);
  if (!factura) return NextResponse.json({ error: 'Factura no encontrada.' }, { status: 404 });

  const res = await generarNotaDebitoMora(ecfDocumentId, { createdBy: user.id });

  if (res.ok) {
    return NextResponse.json({ ok: true, notaDebitoId: res.notaDebitoId });
  }

  switch (res.reason) {
    case 'not_found':
      return NextResponse.json({ error: 'Factura no encontrada.' }, { status: 404 });
    case 'ya_existe':
      return NextResponse.json({ error: 'Ya existe una nota de débito de mora para esta factura.' }, { status: 409 });
    case 'sin_saldo':
      return NextResponse.json({ error: 'La factura no tiene saldo pendiente.' }, { status: 422 });
    case 'es_nota_mora':
      return NextResponse.json({ error: 'No se puede generar mora sobre una nota de débito de mora.' }, { status: 400 });
    case 'anulada':
      return NextResponse.json({ error: 'La factura está anulada.' }, { status: 409 });
    case 'mora_cero':
      return NextResponse.json({ error: 'El recargo por mora calculado es cero.' }, { status: 422 });
    default:
      return NextResponse.json({ error: 'No se pudo generar la nota de débito.' }, { status: 400 });
  }
}
