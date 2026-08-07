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
import { getAmbienteTenant } from '@/lib/ecf-api/ambiente';

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

  // Tipo del borrador resultante: e32 solo si la empresa está habilitada en
  // DGII. Fuera de Producción la factura nace sin comprobante fiscal, si no
  // sería un borrador que nunca se puede emitir.
  const ambiente    = await getAmbienteTenant(teamId);
  const tipoDestino = ambiente === 'Produccion' ? '32' : 'sin-ncf';

  // sin-ncf no reserva comprobante: encf vacío, igual que el alta manual.
  const rand = Math.random().toString(36).substring(2, 10).toUpperCase();
  const encf = tipoDestino === 'sin-ncf' ? '' : `BOR-${rand}`;

  // Mapear ítems de cotización a lineasJson del formulario de factura.
  // Las cotizaciones nuevas guardan el shape rico de ItemLinea (mismo que factura);
  // las viejas guardaban { descripcion, precio, cantidad }. Se soportan ambos.
  let lineasJson: string | null = null;
  // Resumen del beneficiario a nivel documento (lo que sale bajo los datos del
  // comprador en el PDF): el nombre si todas las líneas son del mismo, o
  // "Varios (N)" si son de distintos. Mismo criterio que el form de factura.
  let dependienteNombreResumen: string | null = null;
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
        // El beneficiario de cada línea pasa a la factura; volver a elegirlo
        // uno por uno en un colegio con 30 líneas no tiene sentido.
        dependienteId:          typeof it.dependienteId === 'number' ? it.dependienteId : null,
        dependienteNombre:      String(it.dependienteNombre ?? ''),
      };
    });

    lineasJson = JSON.stringify(lineas);

    const nombres = [...new Set(
      lineas.filter(l => l.dependienteId).map(l => l.dependienteNombre).filter(Boolean),
    )];
    if (nombres.length === 1) dependienteNombreResumen = nombres[0];
    else if (nombres.length > 1) dependienteNombreResumen = `Varios (${nombres.length})`;
  } catch { /* sin ítems */ }

  const codigo     = await generarCodigoFactura(db, { teamId, userId: null, tipoEcf: tipoDestino });
  const estadoPago = calcularEstadoPago({
    estado: 'BORRADOR', tipoPago: 1, montoTotal: cot.montoTotal, totalPagado: 0,
  });

  // Crear borrador en ecf_documents (e32 si hay habilitación DGII; si no, sin-ncf)
  const [newDoc] = await db
    .insert(ecfDocuments)
    .values({
      teamId,
      clientId:             cot.clientId ?? null,
      encf,
      codigo,
      tipoEcf:              tipoDestino,
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
      dependienteNombre:    dependienteNombreResumen,
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
