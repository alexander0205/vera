import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { generarContratoPdf } from '@/lib/pdf/generar';
import { leerArchivoContrato } from '@/lib/nomina/contratos-subidos';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nomina/contratos/[id]/pdf — sirve el contrato.
 *
 * De plataforma: genera el PDF desde el cuerpo. Subido (firmado offline): sirve
 * el archivo archivado tal cual (puede ser PDF o imagen), nunca por presigned
 * URL.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  const contratoId = Number((await params).id);
  if (!Number.isInteger(contratoId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  // Contrato subido: sirve el binario archivado (leerArchivoContrato devuelve
  // null si el contrato es de plataforma, y ahí cae a la generación de PDF).
  const archivo = await leerArchivoContrato(auth.teamId, contratoId);
  if (archivo) {
    return new NextResponse(new Uint8Array(archivo.buffer), {
      headers: {
        'Content-Type': archivo.mime,
        'Content-Disposition': `inline; filename="${archivo.nombre}"`,
        'Cache-Control': 'private, max-age=86400, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'Vary': 'Cookie',
        'Content-Length': String(archivo.buffer.length),
      },
    });
  }

  const pdf = await generarContratoPdf({ teamId: auth.teamId, contratoId });
  if (!pdf) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });

  return new NextResponse(pdf.buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdf.filename}"`,
    },
  });
}
