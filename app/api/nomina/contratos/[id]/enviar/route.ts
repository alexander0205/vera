import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { nominaContratos } from '@/lib/db/schema';
import { origenPublico } from '@/lib/http/origen-publico';
import { generarTokenFirma, hashTokenFirma } from '@/lib/nomina/firma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nomina/contratos/[id]/enviar — habilita el contrato para firma y
 * devuelve el enlace público. Genera un token nuevo (invalida el anterior si se
 * reenvía). No se puede reenviar uno ya firmado.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [contrato] = await db
    .select({ id: nominaContratos.id, estado: nominaContratos.estado })
    .from(nominaContratos)
    .where(and(eq(nominaContratos.id, id), eq(nominaContratos.teamId, auth.teamId)))
    .limit(1);

  if (!contrato) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });
  if (contrato.estado === 'firmado') {
    return NextResponse.json({ error: 'El contrato ya está firmado' }, { status: 409 });
  }

  const token = generarTokenFirma();
  await db
    .update(nominaContratos)
    .set({ tokenHash: hashTokenFirma(token), enviadoEn: new Date(), estado: 'enviado' })
    .where(eq(nominaContratos.id, id));

  return NextResponse.json({ url: `${origenPublico(req)}/firmar/${token}` });
}
