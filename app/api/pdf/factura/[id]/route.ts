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
import { ecfDocuments, teams, clients, pagosRecibidos } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { sql } from 'drizzle-orm';
import { FacturaPDF, type FacturaPDFData } from '@/lib/pdf/FacturaPDF';
import { FacturaTirillaPDF } from '@/lib/pdf/FacturaTirillaPDF';
import { extraerItems } from '@/lib/pdf/extraerItems';
import { emision, EcfApiError } from '@/lib/ecf-api/client';

/**
 * Extrae la fecha/hora de firma del XML firmado.
 * Busca `<SigningTime>` (XMLDSig estándar) o el `FechaFirma` en el cuerpo del e-CF.
 * Devuelve formato legible "DD/MM/YYYY HH:mm" — o null si no se encuentra.
 */
function extraerFechaFirma(xmlFirmado: string | null): string | null {
  if (!xmlFirmado) return null;
  // Intentar <SigningTime> del bloque XMLDSig
  const m1 = xmlFirmado.match(/<SigningTime[^>]*>([^<]+)<\/SigningTime>/i);
  // O <FechaFirma> que algunos formatos DGII incluyen
  const m2 = xmlFirmado.match(/<FechaFirma[^>]*>([^<]+)<\/FechaFirma>/i);
  const iso = (m1?.[1] ?? m2?.[1] ?? '').trim();
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso; // devolver el raw si no parsea
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = d.getHours().toString().padStart(2, '0');
  const mi = d.getMinutes().toString().padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

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
  'sin-ncf': 'Factura',
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

    // Formato de impresión: 'grande' (A4, default) | 'tirilla' (80mm térmica)
    const formatoParam = req.nextUrl.searchParams.get('formato')?.toLowerCase();
    const formato: 'grande' | 'tirilla' =
      formatoParam === 'tirilla' || formatoParam === 'pequena' || formatoParam === 'pequeña' || formatoParam === '80mm'
        ? 'tirilla'
        : 'grande';

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

    // Saldo real desde ledger pagos_recibidos (source of truth).
    // Fallback al campo inline legacy si el ledger está vacío (docs pre-migración).
    const [pagAgg] = await db
      .select({ sum: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)` })
      .from(pagosRecibidos)
      .where(eq(pagosRecibidos.ecfDocumentId, docId));
    const sumLedger = Number(pagAgg?.sum ?? 0);
    const inlineCts = doc.pagoRecibido === 'true' ? (doc.pagoValorCts ?? 0) : 0;
    const pagadoCts = sumLedger > 0 ? sumLedger : inlineCts;
    const saldoCts  = Math.max(0, doc.montoTotal - pagadoCts);

    // Cargar teléfono del cliente si existe referencia
    let telefonoComprador: string | undefined;
    if (doc.clientId) {
      const [cl] = await db
        .select({ telefono: clients.telefono })
        .from(clients)
        .where(eq(clients.id, doc.clientId))
        .limit(1);
      telefonoComprador = cl?.telefono ?? undefined;
    }

    // QR URL DGII — viene tal cual desde ecf-api (doc.urlVerificacion).
    // No reconstruimos client-side: ecf-api ya devuelve la URL canónica firmada.
    // Fallback legacy: facturas emitidas antes de persistir urlVerificacion → re-fetch
    // desde ecf-api usando ecfApiEmisionId y backfill en BD.
    let urlVerificacion = doc.urlVerificacion;
    let codigoSeguridad = doc.codigoSeguridad;
    let fechaFirma      = doc.fechaFirma;

    if (!urlVerificacion && doc.ecfApiEmisionId) {
      try {
        const remoto = await emision.get(doc.ecfApiEmisionId);
        const urlRemota = remoto.urlVerificacion ?? remoto.qrCodeData ?? null;
        const codRemoto = remoto.codigoSeguridad ?? null;
        const firmaRemota = remoto.fechaHoraFirma ?? null;

        if (urlRemota || codRemoto || firmaRemota) {
          urlVerificacion = urlRemota ?? urlVerificacion;
          codigoSeguridad = codRemoto ?? codigoSeguridad;
          fechaFirma      = firmaRemota ?? fechaFirma;

          // Backfill BD (best-effort, no bloquea respuesta)
          await db
            .update(ecfDocuments)
            .set({
              urlVerificacion: urlVerificacion ?? null,
              codigoSeguridad: codigoSeguridad ?? null,
              fechaFirma:      fechaFirma ?? null,
              updatedAt:       new Date(),
            })
            .where(eq(ecfDocuments.id, docId));
        }
      } catch (err) {
        if (err instanceof EcfApiError) {
          console.warn('[PDF] ecf-api fetch fallback fallo:', err.status, err.message);
        } else {
          console.warn('[PDF] fallback ecf-api err:', err);
        }
      }
    }

    const qrText = urlVerificacion ?? '';
    const qrDataUrl = qrText
      ? await QRCode.toDataURL(qrText, {
          width: 128,
          margin: 1,
          errorCorrectionLevel: 'M',
        })
      : undefined;

    // Montos en centavos → DOP (el PDF espera valores en pesos, no centavos)
    const montoTotalDOP  = doc.montoTotal / 100;
    const totalItbisDOP  = doc.totalItbis / 100;
    const subtotalDOP    = montoTotalDOP - totalItbisDOP;

    // Extraer ítems reales desde lineasJson (prioridad) o xmlOriginal.
    const items = extraerItems(doc.xmlOriginal, doc.lineasJson) ?? [
      {
        nombreItem:          doc.razonSocialComprador
          ? `Factura a ${doc.razonSocialComprador}`
          : 'Servicios / Productos',
        cantidadItem:        1,
        precioUnitarioItem:  subtotalDOP,
        subtotalConItbis:    montoTotalDOP,
        tasaItbis:           totalItbisDOP > 0 ? totalItbisDOP / subtotalDOP : undefined,
      },
    ];

    const pdfData: FacturaPDFData = {
      encf:          doc.encf,
      codigo:        doc.codigo ?? undefined,
      tipoEcf:       doc.tipoEcf,
      tipoEcfNombre: TIPO_NOMBRE[doc.tipoEcf] ?? `Tipo ${doc.tipoEcf}`,
      fechaEmision:  new Date(doc.fechaEmision).toLocaleDateString('es-DO', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
      tipoPagoNombre: TIPO_PAGO_NOMBRE[1] ?? 'Contado',
      estado:        doc.estado,
      // B3 fix: solo watermark BORRADOR si no tiene pago registrado.
      // Factura sin NCF pero con pago = documento final, no borrador real.
      esBorrador:    doc.estado === 'BORRADOR' && pagadoCts === 0,
      codigoSeguridad: codigoSeguridad ?? undefined,
      trackId:       doc.trackId ?? undefined,
      // Prefer columna persistida (rápido). Fallback: parsear XML firmado.
      fechaFirma:    fechaFirma ?? extraerFechaFirma(doc.xmlFirmado) ?? undefined,
      moneda:        'DOP',

      emisor: {
        razonSocial:      team.razonSocial ?? team.name,
        nombreComercial:  team.nombreComercial ?? undefined,
        rnc:              team.rnc ?? '',
        direccion:        team.direccion ?? undefined,
        telefono:         team.telefono ?? undefined,
        sitioWeb:         team.sitioWeb ?? undefined,
        emailFacturacion: team.emailFacturacion ?? undefined,
        logo:             team.logo ?? undefined,
        firma:            team.firma ?? undefined,
        colorPrimario:    team.colorPrimario ?? '#1e40af',
      },

      comprador: {
        razonSocial: doc.razonSocialComprador ?? undefined,
        rnc:         doc.rncComprador ?? undefined,
        email:       doc.emailComprador ?? undefined,
        telefono:    telefonoComprador,
      },

      items,
      subtotal:    subtotalDOP,
      totalItbis:  totalItbisDOP,
      montoTotal:  montoTotalDOP,
      saldo:       saldoCts / 100,  // B2 fix: saldo real (0 si pagada)
      qrDataUrl,
      pieFactura:          doc.pieFactura ?? undefined,
      terminosCondiciones: doc.terminosCondiciones ?? undefined,
      notas:               doc.notas ?? undefined,
      dependienteNombre:   doc.dependienteNombre ?? undefined,
    };

    // Renderizar PDF — cast necesario por incompatibilidad de tipos con react-pdf
    const Component = formato === 'tirilla' ? FacturaTirillaPDF : FacturaPDF;
    const pdfBuffer = await renderToBuffer(
      createElement(Component, { data: pdfData }) as any
    );

    const filename = formato === 'tirilla'
      ? `factura-${doc.encf}-tirilla.pdf`
      : `factura-${doc.encf}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    console.error('[PDF] Error generando factura:', err);
    return NextResponse.json({ error: 'Error generando PDF' }, { status: 500 });
  }
}
