/**
 * GET /api/administracion-escolar/comprobantes/[id]/archivo
 *
 * Sirve el binario. Nunca se emite una presigned URL: el navegador no habla con
 * S3, esta ruta valida sesión y empresa antes de leer. Misma regla que los
 * comprobantes de facturación — ver lib/storage/comprobantes.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { leerArchivoComprobante } from '@/lib/administracion-escolar/comprobantes';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Id no válido' }, { status: 400 });

  const archivo = await leerArchivoComprobante(auth.teamId, id);
  if (!archivo) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  return new NextResponse(new Uint8Array(archivo.buffer), {
    headers: {
      'Content-Type': archivo.mime,
      // `inline`: el colegio quiere mirar la foto, no descargarla.
      'Content-Disposition': `inline; filename="${archivo.nombre.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
