/**
 * GET /api/pdf/cotizacion/[id]
 * Genera y devuelve el PDF de una cotización.
 * Solo accesible para el team propietario.
 */
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { db } from '@/lib/db/drizzle';
import { cotizaciones, teams } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { CotizacionPDF, type CotizacionPDFData } from '@/lib/pdf/CotizacionPDF';

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

    const [row] = await db
      .select({ cot: cotizaciones, team: teams })
      .from(cotizaciones)
      .innerJoin(teams, eq(teams.id, cotizaciones.teamId))
      .where(and(eq(cotizaciones.id, cotId), eq(cotizaciones.teamId, teamId)))
      .limit(1);

    if (!row) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });

    const { cot, team } = row;

    // Parsear ítems
    // Soporta el shape rico (ItemLinea, cotizaciones nuevas) y el viejo.
    let parsedItems: Array<Record<string, unknown>> = [];
    try {
      if (cot.items) parsedItems = JSON.parse(cot.items);
    } catch { /* ignore */ }

    const items = parsedItems.map(it => {
      const descripcion = String((it.nombreItem ?? it.descripcion) ?? '');
      const precio      = Number(it.precioUnitarioItem ?? it.precio ?? 0);
      const cantidad    = Number(it.cantidadItem ?? it.cantidad ?? 1);
      return {
      descripcion,
      precio,
      cantidad,
      total:       precio * cantidad,
      };
    });

    const montoTotalDOP = cot.montoTotal / 100;
    const subtotalDOP   = cot.montoSubtotal / 100;

    const pdfData: CotizacionPDFData = {
      numero:    cot.numero,
      estado:    cot.estado,
      fechaEmision: new Date(cot.fechaEmision).toLocaleDateString('es-DO', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
      fechaVencimiento: cot.fechaVencimiento
        ? new Date(cot.fechaVencimiento).toLocaleDateString('es-DO', {
            year: 'numeric', month: 'long', day: 'numeric',
          })
        : undefined,
      emisor: {
        razonSocial:      team.razonSocial ?? team.name,
        nombreComercial:  team.nombreComercial ?? undefined,
        rnc:              team.rnc ?? undefined,
        direccion:        team.direccion ?? undefined,
        telefono:         team.telefono ?? undefined,
        sitioWeb:         team.sitioWeb ?? undefined,
        emailFacturacion: team.emailFacturacion ?? undefined,
        logo:             team.logo ?? undefined,
        colorPrimario:    team.colorPrimario ?? '#1e40af',
      },
      comprador: {
        razonSocial: cot.razonSocialComprador ?? undefined,
        rnc:         cot.rncComprador ?? undefined,
        email:       cot.emailComprador ?? undefined,
      },
      items,
      subtotal:   subtotalDOP,
      montoTotal: montoTotalDOP,
      notas:               cot.notas,
      terminosCondiciones: cot.terminosCondiciones,
    };

    const pdfBuffer = await renderToBuffer(
      createElement(CotizacionPDF, { data: pdfData }) as any
    );

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="cotizacion-${cot.numero}.pdf"`,
        'Cache-Control':       'private, no-cache',
      },
    });
  } catch (err) {
    console.error('[PDF cotizacion] Error:', err);
    return NextResponse.json({ error: 'Error generando PDF' }, { status: 500 });
  }
}
