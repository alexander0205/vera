/**
 * GET /api/pdf/factura/[id]
 * Genera y devuelve el PDF de un e-CF. Solo disponible para el team propietario.
 *
 * La generación vive en `lib/pdf/generar` para que el servidor pueda producir el
 * mismo PDF sin pasar por HTTP (ver el envío por email).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { generarFacturaPdf, type FormatoFacturaPdf } from '@/lib/pdf/generar';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = await params;
    // El parámetro puede ser el ID numérico (legacy) o el código de factura
    // (F-YYYY-NNNNNN). El código NO es único global, pero el lookup va scopeado
    // por teamId → sin colisión entre empresas.
    const esNumerico = /^\d+$/.test(id);
    const docId     = esNumerico ? parseInt(id) : null;
    const codigo    = esNumerico ? null : decodeURIComponent(id);

    // Formato de impresión: 'grande' (A4, default) | 'tirilla' (80mm térmica)
    const formatoParam = req.nextUrl.searchParams.get('formato')?.toLowerCase();
    const formato: FormatoFacturaPdf =
      formatoParam === 'tirilla' || formatoParam === 'pequena' || formatoParam === 'pequeña' || formatoParam === '80mm'
        ? 'tirilla'
        : 'grande';

    // Obtener teamId activo del usuario
    const teamId = await getTeamIdForUser();
    if (!teamId) {
      return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });
    }

    const pdf = await generarFacturaPdf({ teamId, docId, codigo, formato });
    if (!pdf) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    return new NextResponse(pdf.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${pdf.filename}"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    console.error('[PDF] Error generando factura:', err);
    return NextResponse.json({ error: 'Error generando PDF' }, { status: 500 });
  }
}
