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
import { getTeamIdForUser } from '@/lib/db/queries';
import { and, eq, desc } from 'drizzle-orm';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

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

  // Mapear ítems de cotización a lineasJson del formulario de factura
  let lineasJson: string | null = null;
  try {
    const rawItems: Array<{ descripcion: string; precio: number; cantidad: number }> =
      cot.items ? JSON.parse(cot.items) : [];

    const lineas = rawItems.map((it, idx) => ({
      id:                  idx + 1,
      nombreItem:          it.descripcion,
      descripcionItem:     '',
      cantidadItem:        it.cantidad,
      precioUnitarioItem:  it.precio,
      descuentoPct:        0,
      tasaItbis:           'exento',
    }));

    lineasJson = JSON.stringify(lineas);
  } catch { /* sin ítems */ }

  // Crear borrador en ecf_documents (tipo 32 por defecto — consumo)
  const [newDoc] = await db
    .insert(ecfDocuments)
    .values({
      teamId,
      clientId:             cot.clientId ?? null,
      encf,
      tipoEcf:              '32',
      estado:               'BORRADOR',
      rncComprador:         cot.rncComprador ?? null,
      razonSocialComprador: cot.razonSocialComprador ?? null,
      emailComprador:       cot.emailComprador ?? null,
      montoTotal:           cot.montoTotal,
      totalItbis:           0,
      notas:                cot.notas ?? null,
      terminosCondiciones:  cot.terminosCondiciones ?? null,
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
