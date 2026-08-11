/**
 * GET    /api/pagos/adjuntos/[id] — sirve el binario del comprobante.
 * DELETE /api/pagos/adjuntos/[id] — lo borra (fila + objeto en S3).
 *
 * Este GET es el proxy que reemplaza a las presigned URLs. El archivo solo sale
 * si hay sesión válida Y el adjunto pertenece a la empresa activa; no existe
 * ninguna URL que funcione sin sesión, así que reenviar el link no filtra nada.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { leerAdjunto, leerCabeceraAdjunto, eliminarAdjunto } from '@/lib/pagos/adjuntos';
import { logAudit, getIp } from '@/lib/audit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('pagos:ver');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const adjuntoId = Number(id);
  if (!Number.isInteger(adjuntoId) || adjuntoId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const variante = req.nextUrl.searchParams.get('size') === 'thumb' ? 'thumb' : 'full';

  // El contenido de una llave nunca cambia (UUID nuevo por archivo), así que el
  // ETag es estable y el navegador puede quedarse con la copia. La cabecera se
  // resuelve contra Postgres: en un 304 no se toca S3 ni se baja el cuerpo.
  const cab = await leerCabeceraAdjunto(auth.teamId, adjuntoId, variante);
  if (!cab) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const cabeceras = {
    'Content-Type':        cab.mime,
    'Content-Disposition': `inline; filename="${cab.nombre}"`,
    'ETag':                cab.etag,
    // `private`: solo la caché del navegador, nunca una compartida ni un CDN.
    // Es evidencia de un cobro y la respuesta depende de quién la pide.
    'Cache-Control':       'private, max-age=86400, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'Vary':                'Cookie',
  };

  if (req.headers.get('if-none-match') === cab.etag) {
    return new NextResponse(null, { status: 304, headers: cabeceras });
  }

  let arch;
  try {
    arch = await leerAdjunto(auth.teamId, adjuntoId, variante);
  } catch (e) {
    // La fila existe pero S3 no respondió. Se distingue del 404 a propósito:
    // el comprobante no se perdió, el almacenamiento no contestó.
    console.error(`[GET /api/pagos/adjuntos/${adjuntoId}] lectura de storage`, e);
    return NextResponse.json({ error: 'No se pudo leer el comprobante' }, { status: 502 });
  }
  if (!arch) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  return new NextResponse(new Uint8Array(arch.buffer), {
    headers: { ...cabeceras, 'Content-Length': String(arch.buffer.length) },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('pagos:adjunto-eliminar');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const adjuntoId = Number(id);
  if (!Number.isInteger(adjuntoId) || adjuntoId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  let borrado: boolean;
  try {
    borrado = await eliminarAdjunto(auth.teamId, adjuntoId);
  } catch (e) {
    console.error(`[DELETE /api/pagos/adjuntos/${adjuntoId}]`, e);
    return NextResponse.json({ error: 'No se pudo eliminar el comprobante' }, { status: 500 });
  }
  if (!borrado) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  logAudit({
    teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email,
    action: 'COMPROBANTE_ELIMINADO', resource: `adjunto:${adjuntoId}`, ip: getIp(req),
  });

  return NextResponse.json({ ok: true });
}
