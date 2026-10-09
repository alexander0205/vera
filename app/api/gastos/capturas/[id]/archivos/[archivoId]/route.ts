import { NextRequest, NextResponse } from 'next/server';
import { autorizarCapturas } from '@/lib/compras/captura/autorizar';
import { leerArchivo } from '@/lib/compras/captura/archivos';

export const dynamic = 'force-dynamic';

/**
 * El binario de una foto de factura. Pasa por aquí —con sesión y empresa
 * comprobadas— porque el bucket es privado y no se firman URLs.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; archivoId: string }> }) {
  const auth = await autorizarCapturas(false);
  if (!auth.ok) return auth.response;
  const archivoId = Number((await params).archivoId);
  if (!Number.isInteger(archivoId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  const archivo = await leerArchivo(auth.teamId, archivoId);
  if (!archivo) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return new NextResponse(new Uint8Array(archivo.buffer), {
    headers: {
      'Content-Type': archivo.mime,
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
