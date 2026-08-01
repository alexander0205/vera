/**
 * GET    /api/facturas-recurrentes/[id]  — Detalle de una factura recurrente
 * PUT    /api/facturas-recurrentes/[id]  — Actualiza (pausa/reanuda/edita)
 * DELETE /api/facturas-recurrentes/[id]  — Elimina
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { facturasRecurrentes, ecfDocuments, clients } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and, ne, desc, sql } from 'drizzle-orm';
import { esTipoEcfRecurrenteValido } from '@/lib/ecf/categorias';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Calcula las próximas ~N fechas de emisión a partir de una fecha (incluida),
 * avanzando según frecuencia/diaCobro. Réplica de la lógica de avance de
 * lib/cobranza/recurrente.ts. Se detiene en fechaFin si existe.
 */
function calcularProximasFechas(
  desde: string,
  frecuencia: string,
  diaCobro: number | null,
  fechaFin: string | null,
  cantidad: number,
): string[] {
  const fechas: string[] = [];
  const [y0, m0, d0] = desde.split('-').map(Number);
  let actual = new Date(y0, m0 - 1, d0);

  const toStr = (date: Date) =>
    `${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, '0')}-` +
    `${String(date.getDate()).padStart(2, '0')}`;

  for (let i = 0; i < cantidad; i++) {
    const str = toStr(actual);
    if (fechaFin && str > fechaFin) break;
    fechas.push(str);

    // Avanzar a la siguiente fecha
    const siguiente = new Date(actual.getTime());
    if (frecuencia === 'semanal') {
      siguiente.setDate(siguiente.getDate() + 7);
    } else if (frecuencia === 'quincenal') {
      siguiente.setDate(siguiente.getDate() + 15);
    } else {
      const monthOffset =
        frecuencia === 'mensual'    ? 1  :
        frecuencia === 'trimestral' ? 3  :
        frecuencia === 'anual'      ? 12 : 1;
      const targetMonth     = siguiente.getMonth() + monthOffset;
      const targetYear      = siguiente.getFullYear() + Math.floor(targetMonth / 12);
      const normalizedMonth = ((targetMonth % 12) + 12) % 12;
      const lastDayTarget   = new Date(targetYear, normalizedMonth + 1, 0).getDate();
      const desiredDay      = diaCobro ?? siguiente.getDate();
      const clampedDay      = Math.min(desiredDay, lastDayTarget);
      siguiente.setFullYear(targetYear, normalizedMonth, clampedDay);
    }
    actual = siguiente;
  }

  return fechas;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [row] = await db
    .select()
    .from(facturasRecurrentes)
    .where(and(eq(facturasRecurrentes.id, numId), eq(facturasRecurrentes.teamId, teamId)));

  if (!row) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  // Facturas generadas desde esta recurrente (no anuladas), con período y saldo.
  const docs = await db
    .select({
      id:                ecfDocuments.id,
      codigo:            ecfDocuments.codigo,
      encf:              ecfDocuments.encf,
      fechaEmision:      ecfDocuments.fechaEmision,
      montoTotal:        ecfDocuments.montoTotal,
      estado:            ecfDocuments.estado,
      estadoPago:        ecfDocuments.estadoPago,
      periodoRecurrente: ecfDocuments.periodoRecurrente,
      // Subquery correlacionada: nombre literal de tabla para evitar que Drizzle
      // trate ${ecfDocuments.id} como parámetro reusado.
      pagado: sql<number>`coalesce((
        SELECT SUM(monto_centavos) FROM pagos_recibidos
        WHERE pagos_recibidos.ecf_document_id = ecf_documents.id
      ), 0)`,
    })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.origenRecurrenteId, numId),
      eq(ecfDocuments.teamId, teamId),
      ne(ecfDocuments.estado, 'ANULADO'),
    ))
    .orderBy(desc(ecfDocuments.fechaEmision));

  // Shape común de factura para el timeline.
  type FacturaTimeline = {
    id: number;
    codigo: string | null;
    encf: string;
    montoTotal: number;
    estadoPago: string;
    pagado: number;
    saldo: number;
  };

  const toTimeline = (d: (typeof docs)[number]): FacturaTimeline => {
    const pagado = Number(d.pagado) || 0;
    return {
      id:         d.id,
      codigo:     d.codigo,
      encf:       d.encf,
      montoTotal: d.montoTotal,
      estadoPago: d.estadoPago,
      pagado,
      saldo:      d.montoTotal - pagado,
    };
  };

  // Normalizar periodoRecurrente a 'YYYY-MM-DD' (puede venir como Date o string).
  const periodoStr = (p: unknown): string | null => {
    if (!p) return null;
    if (p instanceof Date) return p.toISOString().slice(0, 10);
    if (typeof p === 'string') return p.slice(0, 10);
    return null;
  };

  // Mapa período → factura. Las que no tienen período van a facturasSinPeriodo.
  const porPeriodo = new Map<string, FacturaTimeline>();
  const facturasSinPeriodo: FacturaTimeline[] = [];
  for (const d of docs) {
    const per = periodoStr(d.periodoRecurrente);
    if (per) {
      // En caso (raro) de duplicado por período, conservar el primero (más reciente).
      if (!porPeriodo.has(per)) porPeriodo.set(per, toTimeline(d));
    } else {
      facturasSinPeriodo.push(toTimeline(d));
    }
  }

  // Schedule completo fechaInicio → fechaFin. Si no hay fechaFin, cap ~24 pasos.
  const fechasSchedule = calcularProximasFechas(
    row.fechaInicio,
    row.frecuencia,
    row.diaCobro,
    row.fechaFin,
    24,
  );

  // Timeline unificado: cada fecha del schedule con su factura (o null).
  const periodos = fechasSchedule.map((fecha) => ({
    fecha,
    montoEstimado: row.totalEstimado,
    factura: porPeriodo.get(fecha) ?? null,
  }));

  // Nombre del cliente (sibling field; no se inyecta en `row` para no romper el editor)
  let clienteRazonSocial: string | null = null;
  if (row.clientId) {
    const [cli] = await db
      .select({ razonSocial: clients.razonSocial })
      .from(clients)
      .where(and(eq(clients.id, row.clientId), eq(clients.teamId, teamId)));
    clienteRazonSocial = cli?.razonSocial ?? null;
  }

  return NextResponse.json({ facturaRecurrente: row, clienteRazonSocial, periodos, facturasSinPeriodo });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requirePermission('facturas:crear');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json();

  // Validar estado contra whitelist (evita strings arbitrarios que confundan al cron/UI)
  const ESTADOS_VALIDOS = ['activa', 'pausada', 'finalizada'] as const;
  if (body.estado != null && !ESTADOS_VALIDOS.includes(body.estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 422 });
  }

  if (body.tipoEcf != null && !esTipoEcfRecurrenteValido(body.tipoEcf)) {
    return NextResponse.json({ error: 'Tipo de comprobante inválido' }, { status: 422 });
  }

  // diaCobro solo aplica para frecuencias mensual/trimestral/anual.
  // Si el body cambia frecuencia a semanal/quincenal, anular diaCobro automáticamente.
  // Si frecuencia no cambia, respetar el valor enviado pero validar contra la frecuencia actual.
  let diaCobroFinal: number | null | undefined = undefined;
  if (body.diaCobro !== undefined || body.frecuencia != null) {
    // Necesitamos saber la frecuencia efectiva. Si body.frecuencia viene, usar esa.
    // Si no, hay que leer la actual de la DB.
    let frecuenciaEfectiva: string | null = body.frecuencia ?? null;
    if (!frecuenciaEfectiva) {
      const [current] = await db
        .select({ frecuencia: facturasRecurrentes.frecuencia })
        .from(facturasRecurrentes)
        .where(and(eq(facturasRecurrentes.id, numId), eq(facturasRecurrentes.teamId, teamId)));
      frecuenciaEfectiva = current?.frecuencia ?? 'mensual';
    }
    const aplicaDiaCobro = ['mensual', 'trimestral', 'anual'].includes(frecuenciaEfectiva);
    if (!aplicaDiaCobro) {
      diaCobroFinal = null;
    } else if (body.diaCobro !== undefined) {
      diaCobroFinal = body.diaCobro != null
        ? Math.min(31, Math.max(1, parseInt(body.diaCobro)))
        : null;
    }
  }

  const [row] = await db
    .update(facturasRecurrentes)
    .set({
      ...(body.nombre        != null && { nombre: body.nombre }),
      ...(body.descripcion   !== undefined && {
        descripcion: body.descripcion?.trim() ? body.descripcion.trim().slice(0, 200) : null
      }),
      ...(body.tipoEcf       != null && { tipoEcf: body.tipoEcf }),
      ...(body.tipoPago      != null && { tipoPago: body.tipoPago }),
      ...(body.diasParaPago  !== undefined && { diasParaPago: body.diasParaPago ? parseInt(body.diasParaPago) : null }),
      ...(body.frecuencia    != null && { frecuencia: body.frecuencia }),
      ...(diaCobroFinal      !== undefined && { diaCobro: diaCobroFinal }),
      ...(body.fechaInicio   != null && { fechaInicio: body.fechaInicio }),
      ...(body.fechaFin      !== undefined && { fechaFin: body.fechaFin ?? null }),
      ...(body.proximaEmision != null && { proximaEmision: body.proximaEmision }),
      ...(body.estado        != null && { estado: body.estado }),
      ...(body.items         != null && { items: JSON.stringify(body.items) }),
      ...(body.notas         !== undefined && { notas: body.notas ?? null }),
      ...(body.clientId      !== undefined && { clientId: body.clientId ?? null }),
      ...(body.totalEstimado != null && { totalEstimado: Math.round(body.totalEstimado * 100) }),
      ...(body.facturasEmitidas != null && { facturasEmitidas: body.facturasEmitidas }),
      updatedAt: new Date(),
    })
    .where(and(eq(facturasRecurrentes.id, numId), eq(facturasRecurrentes.teamId, teamId)))
    .returning();

  if (!row) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ facturaRecurrente: row });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requirePermission('facturas:crear');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  await db
    .delete(facturasRecurrentes)
    .where(and(eq(facturasRecurrentes.id, numId), eq(facturasRecurrentes.teamId, teamId)));

  return NextResponse.json({ ok: true });
}
