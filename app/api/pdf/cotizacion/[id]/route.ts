/**
 * GET /api/pdf/cotizacion/[id]
 * Genera y devuelve el PDF de una cotización.
 * Solo accesible para el team propietario.
 *
 * La generación vive en `lib/pdf/generar` para que el servidor pueda producir el
 * mismo PDF sin pasar por HTTP (ver el envío por email).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { generarCotizacionPdf } from '@/lib/pdf/generar';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { id } = await params;
    const cotId = parseInt(id);
    if (isNaN(cotId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

    const pdf = await generarCotizacionPdf({ teamId, cotId });
    if (!pdf) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });

    return new NextResponse(pdf.buffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="${pdf.filename}"`,
        'Cache-Control':       'private, no-cache',
      },
    });
  } catch (err) {
    console.error('[PDF cotizacion] Error:', err);
    return NextResponse.json({ error: 'Error generando PDF' }, { status: 500 });
  }
}
