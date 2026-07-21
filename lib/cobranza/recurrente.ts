/**
 * lib/cobranza/recurrente.ts — Lógica de generación de factura desde recurrente.
 *
 * Función reutilizable usada tanto por el cron diario como por el endpoint
 * "Generar ahora" (disparo manual). Soporta generar un período específico del
 * schedule (no solo el próximo).
 */

import { db } from '@/lib/db/drizzle';
import { facturasRecurrentes, ecfDocuments } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { calcularTotales } from '@/lib/ecf/types';
import { generarCodigoFactura } from '@/lib/facturas/codigo';
import { calcularEstadoPago } from '@/lib/facturas/estado-pago';
import { reflejarFacturaRecurrenteEnCargo } from '@/lib/administracion-escolar/facturacion-recurrente';

export interface GenerarFacturaResult {
  ok: true;
  documentoId: number;
  encf: string;
}

export type GenerarFacturaError =
  | { ok: false; reason: 'no_sequence' }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'already_generated' }
  | { ok: false; reason: string };

/**
 * Avanza UNA fecha de cobro según la frecuencia (helper compartido).
 * - semanal   = +7 días
 * - quincenal = +15 días
 * - mensual   = +1 mes  (clamp de día a diaCobro / último día del mes)
 * - trimestral= +3 meses (idem clamp)
 * - anual     = +12 meses(idem clamp)
 * Entrada/salida en 'YYYY-MM-DD' (fechas locales, sin TZ shift).
 */
export function siguientePeriodo(
  fecha: string,
  frecuencia: string,
  diaCobro: number | null,
): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const next = new Date(y, m - 1, d);

  if (frecuencia === 'semanal') {
    next.setDate(next.getDate() + 7);
  } else if (frecuencia === 'quincenal') {
    next.setDate(next.getDate() + 15);
  } else {
    const monthOffset =
      frecuencia === 'mensual'    ? 1  :
      frecuencia === 'trimestral' ? 3  :
      frecuencia === 'anual'      ? 12 : 1;

    const targetMonth     = next.getMonth() + monthOffset;
    const targetYear      = next.getFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const lastDayTarget   = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    const desiredDay      = diaCobro ?? next.getDate();
    const clampedDay      = Math.min(desiredDay, lastDayTarget);
    next.setFullYear(targetYear, normalizedMonth, clampedDay);
  }

  return (
    `${next.getFullYear()}-` +
    `${String(next.getMonth() + 1).padStart(2, '0')}-` +
    `${String(next.getDate()).padStart(2, '0')}`
  );
}

/**
 * Genera una factura borrador a partir de una recurrente para un período dado.
 *
 * - period efectivo: opts.periodo ?? fr.proximaEmision.
 * - No genera si ya existe una factura no anulada para ese período (origen+período).
 * - Copia ítems (lineasJson) y recalcula totales.
 * - Marca origenRecurrenteId + periodoRecurrente; fechaEmision = ese período.
 * - Avanza la secuencia + facturasEmitidas.
 * - Recomputa proximaEmision = primer período del schedule aún sin generar
 *   (soporta generación fuera de orden). Si no queda ninguno → 'finalizada'.
 */
export async function generarFacturaDeRecurrente(
  fr: {
    id: number;
    teamId: number;
    clientId: number | null;
    tipoEcf: string;
    tipoPago: number;
    diasParaPago: number | null;
    frecuencia: string;
    diaCobro: number | null;
    fechaInicio: string;
    fechaFin: string | null;
    proximaEmision: string;
    items: string;
    totalEstimado: number;
    notas: string | null;
    nombre: string;
    facturasEmitidas: number;
    moraPorcentaje: number | null;
    moraDiasGracia: number | null;
  },
  opts?: { periodo?: string },
): Promise<GenerarFacturaResult | GenerarFacturaError> {
  const periodo = opts?.periodo ?? fr.proximaEmision;

  // Evitar duplicados: no generar si ya existe una factura no anulada para este período.
  const existentes = await db
    .select({ id: ecfDocuments.id })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.origenRecurrenteId, fr.id),
      eq(ecfDocuments.periodoRecurrente, periodo),
      ne(ecfDocuments.estado, 'ANULADO'),
    ))
    .limit(1);

  if (existentes[0]) {
    return { ok: false, reason: 'already_generated' };
  }

  // Parsear ítems y calcular totales
  let montoTotal = fr.totalEstimado;
  let totalItbis = 0;
  const lineasJson: string = fr.items;

  try {
    const items = JSON.parse(fr.items);
    if (Array.isArray(items) && items.length > 0) {
      const totales = calcularTotales(items);
      // calcularTotales devuelve DOP; la columna montoTotal/totalItbis es en centavos.
      const mt = Math.round(totales.montoTotal * 100);
      const ti = Math.round(totales.totalItbis * 100);
      // Guard: items con shape legacy/incompleto (p.ej. `precioUnitario` en vez
      // de `precioUnitarioItem`) hacen que calcularTotales devuelva NaN. En ese
      // caso caemos a `totalEstimado` (ya en centavos) en vez de insertar NaN y
      // romper con "invalid input syntax for type integer: NaN".
      if (Number.isFinite(mt)) montoTotal = mt;
      if (Number.isFinite(ti)) totalItbis = ti;
    }
  } catch {
    // fallback a totalEstimado si el JSON es inválido
  }

  // e-NCF de BORRADOR (igual que el flujo manual): NO consume secuencia ni asigna
  // un e-NCF fiscal real. El e-NCF real se asigna al "Enviar a DGII" (emitir-ecf).
  const encf = `BOR-${fr.tipoEcf}-${Date.now().toString(36).toUpperCase().slice(-8)}`;

  // Fecha límite de pago para crédito. Parte del período generado, no del día
  // en que corra el cron (un catch-up no debe mover el vencimiento escolar).
  let fechaLimitePago: string | null = null;
  if (fr.tipoPago === 2 && fr.diasParaPago && fr.diasParaPago > 0) {
    const [py, pm, pd] = periodo.split('-').map(Number);
    const limite = new Date(py, pm - 1, pd, 12, 0, 0);
    limite.setDate(limite.getDate() + fr.diasParaPago);
    fechaLimitePago = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}-${String(limite.getDate()).padStart(2, '0')}`;
  }

  const codigo     = await generarCodigoFactura(db, { teamId: fr.teamId, userId: null, tipoEcf: fr.tipoEcf });
  const estadoPago = calcularEstadoPago({
    estado: 'BORRADOR', tipoPago: fr.tipoPago, montoTotal, totalPagado: 0,
  });

  // Fecha de emisión = el período (mediodía local para evitar desfase TZ).
  const [py, pm, pd] = periodo.split('-').map(Number);
  const fechaEmision = new Date(py, pm - 1, pd, 12, 0, 0);

  // Insertar documento
  const [inserted] = await db
    .insert(ecfDocuments)
    .values({
      teamId: fr.teamId,
      clientId: fr.clientId,
      encf,
      codigo,
      tipoEcf: fr.tipoEcf,
      estado: 'BORRADOR',
      estadoPago,
      tipoPago: fr.tipoPago,
      fechaLimitePago,
      montoTotal,
      totalItbis,
      lineasJson,
      notas: fr.notas ?? `Factura recurrente: ${fr.nombre}`,
      origenRecurrenteId: fr.id,
      periodoRecurrente: periodo,
      moraPorcentaje: fr.moraPorcentaje ?? null,
      moraDiasGracia: fr.moraDiasGracia ?? null,
      fechaEmision,
    })
    .returning({ id: ecfDocuments.id });

  // Si plan pertenece a una matrícula, reflejar esta factura en el cargo exacto
  // de su mes. Recurrentes no escolares salen inmediatamente sin efecto.
  await reflejarFacturaRecurrenteEnCargo({
    facturaRecurrenteId: fr.id,
    documentoId: inserted.id,
    periodo,
    montoCentavos: montoTotal,
    fechaVencimiento: fechaLimitePago,
  });

  // NB: NO se avanza la secuencia — esto es un borrador. La secuencia se consume
  // al emitir a DGII (emitir-ecf), que asigna el e-NCF fiscal real.

  // ── Recalcular proximaEmision = primer período del schedule aún sin generar ──
  // Traer todos los períodos ya generados (no anulados) tras la inserción.
  const generados = await db
    .select({ periodo: ecfDocuments.periodoRecurrente })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.origenRecurrenteId, fr.id),
      ne(ecfDocuments.estado, 'ANULADO'),
    ));

  const generadosSet = new Set(
    generados.map((g) => g.periodo).filter((p): p is string => !!p),
  );

  // Recorrer el schedule desde fechaInicio hasta fechaFin (cap defensivo) y
  // tomar la primera fecha sin factura.
  const MAX_PASOS = 600; // cap defensivo (p.ej. semanal ~11 años)
  let proxima: string | null = null;
  let cursor = fr.fechaInicio;
  for (let i = 0; i < MAX_PASOS; i++) {
    if (fr.fechaFin && cursor > fr.fechaFin) break;
    if (!generadosSet.has(cursor)) {
      proxima = cursor;
      break;
    }
    cursor = siguientePeriodo(cursor, fr.frecuencia, fr.diaCobro);
    // Protección extra: si la frecuencia no avanzara, romper.
  }

  await db
    .update(facturasRecurrentes)
    .set({
      proximaEmision:   proxima ?? fr.proximaEmision,
      facturasEmitidas: fr.facturasEmitidas + 1,
      estado:           proxima ? 'activa' : 'finalizada',
      updatedAt:        new Date(),
    })
    .where(eq(facturasRecurrentes.id, fr.id));

  return { ok: true, documentoId: inserted.id, encf };
}
