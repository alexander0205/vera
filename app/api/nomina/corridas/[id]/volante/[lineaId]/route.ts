import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { generarVolanteNominaPdf } from '@/lib/pdf/generar';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nomina/corridas/[id]/volante/[lineaId] — volante de pago (PDF) de un
 * empleado en una corrida. El scoping por team lo aplica el generador.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; lineaId: string }> },
) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  const { id, lineaId } = await params;
  const corridaId = Number(id);
  const lineaNum = Number(lineaId);
  if (!Number.isInteger(corridaId) || !Number.isInteger(lineaNum)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const pdf = await generarVolanteNominaPdf({ teamId: auth.teamId, corridaId, lineaId: lineaNum });
  if (!pdf) return NextResponse.json({ error: 'Volante no encontrado' }, { status: 404 });

  return new NextResponse(pdf.buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdf.filename}"`,
    },
  });
}
