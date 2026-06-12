/**
 * POST /api/pdf/factura/preview
 * Renderiza el PDF de vista previa SIN crear la factura en la base de datos.
 *
 * Recibe el mismo payload que `/api/ecf/emitir` (el output de buildPayload) y
 * arma el `FacturaPDFData` en memoria — reusando `extraerItems` (mismos ítems que
 * el PDF guardado) y `calcularTotales` (mismos totales que al emitir). Cero INSERT.
 *
 * Esto evita el duplicado "vista previa → guardar": antes la vista previa creaba
 * un borrador real solo para tener un id que pasarle al PDF, y luego "Guardar"
 * creaba otra fila. Ahora la vista previa es 100% read-only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams, clients } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { FacturaPDF, type FacturaPDFData } from '@/lib/pdf/FacturaPDF';
import { FacturaTirillaPDF } from '@/lib/pdf/FacturaTirillaPDF';
import { extraerItems } from '@/lib/pdf/extraerItems';
import { calcularTotales } from '@/lib/ecf/types';

const TIPO_NOMBRE: Record<string, string> = {
  '31': 'Factura de Crédito Fiscal Electrónica',
  '32': 'Factura de Consumo Electrónica',
  '33': 'Nota de Débito Electrónica',
  '34': 'Nota de Crédito Electrónica',
  '41': 'Comprobante Electrónico de Compras',
  '43': 'Comprobante Electrónico para Gastos Menores',
  '44': 'Comprobante Electrónico para Regímenes Especiales',
  '45': 'Comprobante Electrónico Gubernamental',
  '46': 'Comprobante Electrónico para Exportaciones',
  '47': 'Comprobante Electrónico para Pagos al Exterior',
  'sin-ncf': 'Factura',
};

const TIPO_PAGO_NOMBRE: Record<number, string> = {
  1: 'Contado',
  2: 'Crédito',
  3: 'Gratuito',
  4: 'Uso o Consumo',
};

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });

    const body = await req.json();
    const tipoEcf: string = body?.tipoEcf ?? 'sin-ncf';

    // Formato: 'grande' (A4, default) | 'tirilla' (80mm)
    const formatoParam = req.nextUrl.searchParams.get('formato')?.toLowerCase();
    const formato: 'grande' | 'tirilla' =
      formatoParam === 'tirilla' || formatoParam === 'pequena' || formatoParam === 'pequeña' || formatoParam === '80mm'
        ? 'tirilla'
        : 'grande';

    // Ítems — mismo extractor que el PDF guardado (parity garantizada).
    const items = extraerItems(null, body?.lineasJson) ?? [];

    // Totales — misma función que usa /api/ecf/emitir al guardar.
    const tot = calcularTotales(Array.isArray(body?.items) ? body.items : []);
    const montoTotalDOP = tot.montoTotal;
    const totalItbisDOP = tot.totalItbis;
    const subtotalDOP   = montoTotalDOP - totalItbisDOP;

    // Teléfono del comprador si hay cliente referenciado (scopeado al team).
    let telefonoComprador: string | undefined;
    if (typeof body?.clientId === 'number' && body.clientId > 0) {
      const [cl] = await db
        .select({ telefono: clients.telefono })
        .from(clients)
        .where(eq(clients.id, body.clientId))
        .limit(1);
      telefonoComprador = cl?.telefono ?? undefined;
    }

    // Pago previsto (para mostrar saldo). Split (pagos[]) o single (pagoValor).
    const pagadoDOP = Array.isArray(body?.pagos)
      ? body.pagos.reduce((s: number, p: { valor?: number }) => s + (Number(p?.valor) || 0), 0)
      : (Number(body?.pagoValor) || 0);

    // 'YYYY-MM-DD' a mediodía local — new Date('YYYY-MM-DD') parsea UTC midnight
    // y en TZ negativas (Santo Domingo) mostraría el día anterior.
    const fechaEmision = typeof body?.fechaEmision === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.fechaEmision)
      ? new Date(`${body.fechaEmision}T12:00:00`)
      : new Date();

    const data: FacturaPDFData = {
      encf:          '',
      tipoEcf,
      tipoEcfNombre: TIPO_NOMBRE[tipoEcf] ?? `Tipo ${tipoEcf}`,
      fechaEmision:  fechaEmision.toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' }),
      tipoPagoNombre: TIPO_PAGO_NOMBRE[Number(body?.tipoPago) || 1] ?? 'Contado',
      estado:        'BORRADOR',
      esBorrador:    true,
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
        razonSocial: body?.razonSocialComprador ?? undefined,
        rnc:         body?.rncComprador ?? undefined,
        email:       body?.emailComprador ?? undefined,
        telefono:    telefonoComprador,
      },

      items,
      subtotal:   subtotalDOP,
      totalItbis: totalItbisDOP,
      montoTotal: montoTotalDOP,
      saldo:      Math.max(0, montoTotalDOP - pagadoDOP),

      pieFactura:          body?.pieFactura ?? undefined,
      terminosCondiciones: body?.terminosCondiciones ?? undefined,
      notas:               body?.notas ?? undefined,
      dependienteNombre:   body?.dependienteNombre ?? undefined,
    };

    const Component = formato === 'tirilla' ? FacturaTirillaPDF : FacturaPDF;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(createElement(Component, { data }) as any);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="vista-previa.pdf"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('[PDF preview] error:', err);
    return NextResponse.json({ error: 'No se pudo generar la vista previa' }, { status: 500 });
  }
}
