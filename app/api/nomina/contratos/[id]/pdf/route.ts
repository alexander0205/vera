import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { generarContratoPdf } from '@/lib/pdf/generar';

export const dynamic = 'force-dynamic';

/** GET /api/nomina/contratos/[id]/pdf — PDF del contrato emitido. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  const contratoId = Number((await params).id);
  if (!Number.isInteger(contratoId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const pdf = await generarContratoPdf({ teamId: auth.teamId, contratoId });
  if (!pdf) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });

  return new NextResponse(pdf.buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdf.filename}"`,
    },
  });
}
