/**
 * GET /api/pdf/factura/[id]
 * Genera y devuelve el PDF de un e-CF. Solo disponible para el team propietario.
 */
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { eq, and } from 'drizzle-orm';
import { createElement } from 'react';
import QRCode from 'qrcode';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { FacturaPDF, type FacturaPDFData } from '@/lib/pdf/FacturaPDF';

const TIPO_NOMBRE: Record<string, string> = {
  '31': 'Factura Fiscal',
  '32': 'Factura de Consumo',
  '33': 'Nota de Débito',
  '34': 'Nota de Crédito',
  '41': 'Compras',
  '43': 'Gastos Menores',
  '44': 'Regímenes Especiales',
  '45': 'Gubernamental',
  '46': 'Exportaciones',
  '47': 'Pagos al Exterior',
};

const TIPO_PAGO_NOMBRE: Record<number, string> = {
  1: 'Contado',
  2: 'Crédito',
  3: 'Gratuito',
  4: 'Uso o Consumo',
};

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
    const docId = parseInt(id);
    if (isNaN(docId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    // Obtener teamId activo del usuario
    const teamId = await getTeamIdForUser();
    if (!teamId) {
      return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });
    }

    // Obtener documento + team juntos
    const [row] = await db
      .select({ doc: ecfDocuments, team: teams })
      .from(ecfDocuments)
      .innerJoin(teams, eq(teams.id, ecfDocuments.teamId))
      .where(
        and(
          eq(ecfDocuments.id, docId),
          eq(ecfDocuments.teamId, teamId)
        )
      )
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    const { doc, team } = row;

    // Generar QR con la URL de validación DGII
    const qrText = `https://dgii.gov.do/e-CF?encf=${doc.encf}&rnc=${team.rnc ?? ''}`;
    const qrDataUrl = await QRCode.toDataURL(qrText, {
      width: 128,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    // Reconstruir items desde xmlOriginal si hay; sino crear resumen
    // Por simplicidad usamos los datos almacenados (monto total)
    const subtotal = doc.montoTotal - doc.totalItbis;
    const items = [
      {
        nombreItem: 'Ver XML para detalle de líneas',
        cantidadItem: 1,
        precioUnitarioItem: subtotal,
        subtotalConItbis: doc.montoTotal,
        tasaItbis: doc.totalItbis > 0 ? doc.totalItbis / subtotal : undefined,
      },
    ];

    const pdfData: FacturaPDFData = {
      encf: doc.encf,
      tipoEcf: doc.tipoEcf,
      tipoEcfNombre: TIPO_NOMBRE[doc.tipoEcf] ?? `Tipo ${doc.tipoEcf}`,
      fechaEmision: new Date(doc.fechaEmision).toLocaleDateString('es-DO', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
      tipoPagoNombre: 'Contado',
      estado: doc.estado,
      codigoSeguridad: doc.codigoSeguridad ?? undefined,
      trackId: doc.trackId ?? undefined,

      emisor: {
        razonSocial: team.razonSocial ?? team.name,
        nombreComercial: team.nombreComercial ?? undefined,
        rnc: team.rnc ?? '',
        direccion: team.direccion ?? undefined,
        telefono: (team as any).telefono ?? undefined,
        sitioWeb: (team as any).sitioWeb ?? undefined,
        emailFacturacion: (team as any).emailFacturacion ?? undefined,
        logo: (team as any).logo ?? undefined,
        firma: (team as any).firma ?? undefined,
        colorPrimario: (team as any).colorPrimario ?? '#1e40af',
      },

      comprador: {
        razonSocial: doc.razonSocialComprador ?? undefined,
        rnc: doc.rncComprador ?? undefined,
        email: doc.emailComprador ?? undefined,
      },

      items,
      subtotal,
      totalItbis: doc.totalItbis,
      montoTotal: doc.montoTotal,
      qrDataUrl,
      pieFactura: doc.pieFactura ?? undefined,
    };

    // Renderizar PDF — cast necesario por incompatibilidad de tipos con react-pdf
    const pdfBuffer = await renderToBuffer(
      createElement(FacturaPDF, { data: pdfData }) as any
    );

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="factura-${doc.encf}.pdf"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    console.error('[PDF] Error generando factura:', err);
    return NextResponse.json({ error: 'Error generando PDF' }, { status: 500 });
  }
}
