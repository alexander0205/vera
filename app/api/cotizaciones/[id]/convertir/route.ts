/**
 * POST /api/cotizaciones/[id]/convertir
 * Convierte una cotización en un borrador de factura (ecf_documents).
 * Copia los ítems y datos del comprador; el usuario termina de configurar
 * el e-NCF (tipo, pago, etc.) en el editor de borradores.
 * Redirige a /dashboard/facturas/[newId]/editar.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { cotizaciones, ecfDocuments } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { and, eq, desc } from 'drizzle-orm';
import { generarCodigoFactura } from '@/lib/facturas/codigo';
import { calcularEstadoPago } from '@/lib/facturas/estado-pago';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const auth = await requirePermission('cotizaciones:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const cotId = parseInt(id);
  if (isNaN(cotId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [cot] = await db
    .select()
    .from(cotizaciones)
    .where(and(eq(cotizaciones.id, cotId), eq(cotizaciones.teamId, teamId)))
    .limit(1);

  if (!cot) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });

  // Generar encf temporal tipo borrador (BOR-XXXXXXXX)
  const rand = Math.random().toString(36).substring(2, 10).toUpperCase();
  const encf = `BOR-${rand}`;

  // Mapear ítems de cotización a lineasJson del formulario de factura.
  // Las cotizaciones nuevas guardan el shape rico de ItemLinea (mismo que factura);
  // las viejas guardaban { descripcion, precio, cantidad }. Se soportan ambos.
  let lineasJson: string | null = null;
  try {
    const rawItems: Array<Record<string, unknown>> = cot.items ? JSON.parse(cot.items) : [];

    const lineas = rawItems.map((it, idx) => {
      const esViejo = it.descripcion !== undefined && it.nombreItem === undefined;
      return {
        id:                     idx + 1,
        nombreItem:             String(esViejo ? it.descripcion : (it.nombreItem ?? '')),
        referencia:             String(it.referencia ?? ''),
        descripcionItem:        String(it.descripcionItem ?? ''),
        cantidadItem:           Number(it.cantidad ?? it.cantidadItem ?? 1),
        precioUnitarioItem:     Number(it.precio ?? it.precioUnitarioItem ?? 0),
        descuentoPct:           Number(it.descuentoPct ?? 0),
        tasaItbis:              String(it.tasaItbis ?? 'exento'),
        indicadorBienoServicio: String(it.indicadorBienoServicio ?? '2'),
        unidadMedida:           String(it.unidadMedida ?? ''),
      };
    });

    lineasJson = JSON.stringify(lineas);
  } catch { /* sin ítems */ }

  const codigo     = await generarCodigoFactura(db, { teamId, userId: null, tipoEcf: '32' });
  const estadoPago = calcularEstadoPago({
    estado: 'BORRADOR', tipoPago: 1, montoTotal: cot.montoTotal, totalPagado: 0,
  });

  // Crear borrador en ecf_documents (tipo 32 por defecto — consumo)
  const [newDoc] = await db
    .insert(ecfDocuments)
    .values({
      teamId,
      clientId:             cot.clientId ?? null,
      encf,
      codigo,
      tipoEcf:              '32',
      estado:               'BORRADOR',
      estadoPago,
      rncComprador:         cot.rncComprador ?? null,
      razonSocialComprador: cot.razonSocialComprador ?? null,
      emailComprador:       cot.emailComprador ?? null,
      montoTotal:           cot.montoTotal,
      totalItbis:           cot.totalItbis ?? 0,
      notas:                cot.notas ?? null,
      terminosCondiciones:  cot.terminosCondiciones ?? null,
      retenciones:          cot.retenciones ?? null,
      comentario:           cot.comentario ?? null,
      pieFactura:           cot.pieFactura ?? null,
      lineasJson,
      tipoPago:             1,
    })
    .returning({ id: ecfDocuments.id });

  if (!newDoc) return NextResponse.json({ error: 'No se pudo crear el borrador' }, { status: 500 });

  return NextResponse.json({
    ok:      true,
    facturaId: newDoc.id,
    redirect: `/dashboard/facturas/${newDoc.id}/editar`,
  });
}
