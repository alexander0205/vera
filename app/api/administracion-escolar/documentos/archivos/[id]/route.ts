/**
 * GET    /api/administracion-escolar/documentos/archivos/[id] — sirve el binario
 * DELETE /api/administracion-escolar/documentos/archivos/[id] — lo borra
 *
 * El binario se sirve por acá y solo por acá: nunca una presigned URL de S3.
 * Ver la cabecera de lib/storage/comprobantes.ts para las tres razones. El
 * archivo solo sale si hay sesión válida Y pertenece a la empresa activa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarDocumentoArchivos } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { leerArchivoPorId, borrarArchivoPorId } from '@/lib/administracion-escolar/documentos-archivo';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const archivoId = Number(id);
  if (!Number.isInteger(archivoId) || archivoId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  // Cabecera liviana primero (sin tocar S3): resuelve el 304 sin bajar el
  // binario, y de paso confirma que el archivo es de esta empresa antes de
  // pedirle nada al storage.
  const [cab] = await db
    .select({
      mime: adminEscolarDocumentoArchivos.mime,
      nombre: adminEscolarDocumentoArchivos.archivoNombre,
      sha256: adminEscolarDocumentoArchivos.sha256,
    })
    .from(adminEscolarDocumentoArchivos)
    .where(and(
      eq(adminEscolarDocumentoArchivos.id, archivoId),
      eq(adminEscolarDocumentoArchivos.teamId, auth.teamId),
    ))
    .limit(1);
  if (!cab) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const etag = `"${cab.sha256}"`;
  const cabeceras: Record<string, string> = {
    'Content-Type':        cab.mime,
    'Content-Disposition': `inline; filename="${cab.nombre ?? 'documento'}"`,
    // `private`: solo la caché del navegador. Es un documento de un menor, no
    // algo que deba pasar por una caché compartida ni un CDN.
    'Cache-Control':       'private, max-age=86400, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'Vary':                'Cookie',
    'ETag':                etag,
  };

  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: cabeceras });
  }

  let arch;
  try {
    arch = await leerArchivoPorId(auth.teamId, archivoId);
  } catch (e) {
    console.error(`[GET /api/administracion-escolar/documentos/archivos/${archivoId}]`, e);
    return NextResponse.json({ error: 'No se pudo leer el documento' }, { status: 502 });
  }
  if (!arch) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  return new NextResponse(new Uint8Array(arch.buffer), {
    headers: { ...cabeceras, 'Content-Length': String(arch.buffer.length) },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const archivoId = Number(id);
  if (!Number.isInteger(archivoId) || archivoId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const borrado = await borrarArchivoPorId(auth.teamId, archivoId);
  if (!borrado) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
