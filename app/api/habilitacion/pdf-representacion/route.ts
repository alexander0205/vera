/**
 * POST /api/habilitacion/pdf-representacion
 *
 * Genera el PDF de representación impresa para un tipo de e-CF del Set de Pruebas.
 * Busca el documento de prueba más reciente del tipo indicado en la BD y devuelve
 * el PDF usando el mismo motor que /api/pdf/factura/[id].
 *
 * Body:  { tipo: '31' | '32a' | '32b' | '33' | '34' | '41' | '43' | '44' | '45' | '46' | '47' }
 * Response: application/pdf
 *
 * '32a' = Factura de Consumo ≥ RD$250 000 (ECF normal — tiene trackId)
 * '32b' = Factura de Consumo <  RD$250 000 (RFCE — trackId vacío o null)
 */

import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import QRCode from 'qrcode';
import { z } from 'zod';
import { eq, and, ne, or, isNull, desc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { FacturaPDF, type FacturaPDFData } from '@/lib/pdf/FacturaPDF';
import { extraerItems } from '@/lib/pdf/extraerItems';

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIPOS_VALIDOS = ['31','32a','32b','33','34','41','43','44','45','46','47'] as const;
type TipoDisplay = (typeof TIPOS_VALIDOS)[number];

/** Tipo de pantalla → tipo real en la BD (tipoEcf = 2 dígitos) */
const TIPO_DB: Record<TipoDisplay, string> = {
  '31':'31','32a':'32','32b':'32','33':'33','34':'34',
  '41':'41','43':'43','44':'44','45':'45','46':'46','47':'47',
};

const TIPO_NOMBRE: Record<string, string> = {
  '31': 'Factura de Crédito Fiscal',
  '32': 'Factura de Consumo',
  '33': 'Nota de Débito',
  '34': 'Nota de Crédito',
  '41': 'Comprobante de Compras',
  '43': 'Gastos Menores de Monto',
  '44': 'Regímenes Especiales',
  '45': 'Gubernamental',
  '46': 'Exportaciones',
  '47': 'Pagos al Exterior',
};

const bodySchema = z.object({
  tipo: z.enum(TIPOS_VALIDOS),
});

// ─── Helper: extraer fecha de firma del XML ───────────────────────────────────

function extraerFechaFirma(xmlFirmado: string | null): string | null {
  if (!xmlFirmado) return null;
  const m1 = xmlFirmado.match(/<SigningTime[^>]*>([^<]+)<\/SigningTime>/i);
  const m2 = xmlFirmado.match(/<FechaFirma[^>]*>([^<]+)<\/FechaFirma>/i);
  const iso = (m1?.[1] ?? m2?.[1] ?? '').trim();
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd   = d.getDate().toString().padStart(2, '0');
  const mm   = (d.getMonth() + 1).toString().padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh   = d.getHours().toString().padStart(2, '0');
  const mi   = d.getMinutes().toString().padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

    const body   = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'tipo inválido' }, { status: 400 });
    }

    const { tipo } = parsed.data;
    const tipoDb  = TIPO_DB[tipo];

    // ── Construir el filtro de trackId para tipo 32 ──
    // 32a = ECF normal   → tiene trackId (no vacío y no null)
    // 32b = RFCE          → trackId es '' o null
    const trackFilter =
      tipo === '32a'
        ? and(ne(ecfDocuments.trackId, ''))
        : tipo === '32b'
          ? or(eq(ecfDocuments.trackId, ''), isNull(ecfDocuments.trackId))
          : undefined;

    const whereClause = trackFilter
      ? and(eq(ecfDocuments.teamId, teamId), eq(ecfDocuments.tipoEcf, tipoDb), trackFilter)
      : and(eq(ecfDocuments.teamId, teamId), eq(ecfDocuments.tipoEcf, tipoDb));

    // ── Buscar el e-CF de prueba más reciente de ese tipo ──
    const [row] = await db
      .select({ doc: ecfDocuments, team: teams })
      .from(ecfDocuments)
      .innerJoin(teams, eq(teams.id, ecfDocuments.teamId))
      .where(whereClause)
      .orderBy(desc(ecfDocuments.id))
      .limit(1);

    if (!row) {
      return NextResponse.json(
        { error: `No se encontró ningún e-CF de tipo ${tipo} en el Set de Pruebas.` },
        { status: 404 },
      );
    }

    const { doc, team } = row;

    // ── Generar QR ──
    const qrText   = `https://dgii.gov.do/e-CF?encf=${doc.encf}&rnc=${team.rnc ?? ''}`;
    const qrDataUrl = await QRCode.toDataURL(qrText, {
      width: 128, margin: 1, errorCorrectionLevel: 'M',
    });

    // ── Montos centavos → DOP ──
    const montoTotalDOP = doc.montoTotal / 100;
    const totalItbisDOP = doc.totalItbis / 100;
    const subtotalDOP   = montoTotalDOP - totalItbisDOP;

    const pdfData: FacturaPDFData = {
      encf:            doc.encf,
      tipoEcf:         tipoDb,
      tipoEcfNombre:   TIPO_NOMBRE[tipoDb] ?? `Tipo ${tipoDb}`,
      fechaEmision:    new Date(doc.fechaEmision).toLocaleDateString('es-DO', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
      tipoPagoNombre: 'Contado',
      estado:          doc.estado,
      esBorrador:      doc.estado === 'BORRADOR',
      codigoSeguridad: doc.codigoSeguridad ?? undefined,
      trackId:         doc.trackId ?? undefined,
      fechaFirma:      extraerFechaFirma(doc.xmlFirmado) ?? undefined,
      moneda:          'DOP',

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
      },

      items: extraerItems(doc.xmlOriginal, doc.lineasJson) ?? [{
        nombreItem:         TIPO_NOMBRE[tipoDb] ?? 'Servicio de prueba',
        cantidadItem:       1,
        precioUnitarioItem: subtotalDOP,
        subtotalConItbis:   montoTotalDOP,
        tasaItbis:          totalItbisDOP > 0 ? totalItbisDOP / subtotalDOP : undefined,
      }],

      subtotal:   subtotalDOP,
      totalItbis: totalItbisDOP,
      montoTotal: montoTotalDOP,
      qrDataUrl,
      pieFactura: doc.pieFactura ?? undefined,
    };

    // ── Renderizar PDF ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(createElement(FacturaPDF, { data: pdfData }) as any);

    const nombreArchivo = `representacion-e${tipoDb}-${doc.encf}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
        'Cache-Control':       'private, no-cache',
      },
    });
  } catch (err) {
    console.error('[habilitacion/pdf-representacion]', err);
    return NextResponse.json({ error: 'Error generando PDF de representación' }, { status: 500 });
  }
}
