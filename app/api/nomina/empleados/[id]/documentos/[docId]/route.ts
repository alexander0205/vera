/**
 * GET    /api/nomina/empleados/[id]/documentos/[docId] — sirve el binario
 * DELETE /api/nomina/empleados/[id]/documentos/[docId] — lo borra
 *
 * El binario sale por acá y solo por acá (nunca presigned URL), y solo con
 * sesión válida de la empresa dueña del documento.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { leerDocumentoPorId, borrarDocumentoPorId } from '@/lib/nomina/documentos-empleado';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  const docId = Number((await params).docId);
  if (!Number.isInteger(docId) || docId <= 0) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  let arch;
  try {
    arch = await leerDocumentoPorId(auth.teamId, docId);
  } catch (e) {
    console.error(`[GET /api/nomina/empleados/documentos/${docId}]`, e);
    return NextResponse.json({ error: 'No se pudo leer el documento' }, { status: 502 });
  }
  if (!arch) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  return new NextResponse(new Uint8Array(arch.buffer), {
    headers: {
      'Content-Type': arch.mime,
      'Content-Disposition': `inline; filename="${arch.nombre}"`,
      'Cache-Control': 'private, max-age=86400, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Cookie',
      'Content-Length': String(arch.buffer.length),
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const docId = Number((await params).docId);
  if (!Number.isInteger(docId) || docId <= 0) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const borrado = await borrarDocumentoPorId(auth.teamId, docId);
  if (!borrado) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
