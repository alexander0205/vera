/**
 * POST /api/pos/venta/[id]/editar — modifica un recibo POS ya cobrado: añade
 * líneas y/o quita líneas ya facturadas, y reconcilia la DIFERENCIA (cobra si
 * sube, devuelve si baja). Gate: pos:anular.
 *
 * Modelo "editar la cuenta": se anexan las líneas nuevas y se quitan las
 * marcadas (por índice del lineasJson actual); el total se recomputa completo.
 * El cambio de cobro entra como filas de pagos_recibidos atadas al mismo turno
 * (positivas = cobro del delta, negativas = devolución), así la caja reconcilia
 * sola. Se descuenta inventario de lo nuevo y se restaura el de lo quitado.
 *
 * Límite fiscal: solo se editan tickets sin-ncf / borradores / rechazados. Un
 * e-CF YA ACEPTADO por la DGII es inmutable: se responde requiereNotaCredito +
 * la URL del formulario de NC, SIN mutar nada (mismo patrón que /anular).
 *
 * PIN para autorizar el quitado: pendiente (a decidir si solo-admin o cualquiera).
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, pagosRecibidos } from '@/lib/db/schema';
import { descontarInventario } from '@/lib/inventario/descuento';
import { restaurarInventario } from '@/lib/inventario/devolucion';
import { calcularTotales, type EcfItemInput } from '@/lib/ecf/types';
import { hoyRD } from '@/lib/utils/format';

// Estados aceptados por la DGII: su reversa/edición es una Nota de Crédito.
const REQUIERE_NOTA_CREDITO = ['ACEPTADO', 'ACEPTADO_CONDICIONAL'];

const itemSchema = z.object({
  productoId:             z.number().int().positive().nullable().optional(),
  // La talla vendida. No estaba en el esquema, así que al agregar una línea a
  // un recibo ya cobrado se perdía: el recibo salía sin decir qué talla y, al
  // anularlo después, la unidad no sabía a cuál volver.
  variantId:              z.number().int().positive().nullable().optional(),
  variantNombre:          z.string().nullable().optional(),
  nombreItem:             z.string().min(1),
  referencia:             z.string().optional(),
  cantidadItem:           z.number().positive(),
  precioUnitarioItem:     z.number().min(0),   // en PESOS (igual que lineasJson)
  tasaItbis:              z.string().default('exento'), // 'exento' | '0' | '0.16' | '0.18'
  indicadorBienoServicio: z.union([z.literal('1'), z.literal('2'), z.literal(1), z.literal(2)]).default('2'),
});

const schema = z.object({
  itemsNuevos: z.array(itemSchema).default([]),
  // Índices (en el lineasJson actual) de las líneas ya facturadas a quitar.
  itemsQuitados: z.array(z.number().int().min(0)).default([]),
  // valorCentavos puede ser NEGATIVO: una devolución al quitar líneas pagadas.
  pagos: z.array(z.object({
    metodo:        z.string().min(1),
    valorCentavos: z.number().int(),
  })).default([]),
});

/** 'exento' → undefined (no gravado); '0.18'/'0.16'/'0' → número para el motor. */
function tasaNum(t: string): number | undefined {
  if (t === '0.18') return 0.18;
  if (t === '0.16') return 0.16;
  if (t === '0') return 0;
  return undefined; // exento
}
/** Normaliza el indicador a 1 (bien) | 2 (servicio). */
function indBien(v: string | number): 1 | 2 {
  return v === 1 || v === '1' ? 1 : 2;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('pos:anular');
  if (!auth.ok) return auth.response;
  const { teamId, user } = auth;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  const { itemsNuevos, itemsQuitados, pagos } = parsed.data;
  if (itemsNuevos.length === 0 && itemsQuitados.length === 0) {
    return NextResponse.json({ error: 'No hay cambios que aplicar' }, { status: 400 });
  }

  const [doc] = await db
    .select({
      id:          ecfDocuments.id,
      estado:      ecfDocuments.estado,
      encf:        ecfDocuments.encf,
      tipoEcf:     ecfDocuments.tipoEcf,
      lineasJson:  ecfDocuments.lineasJson,
      montoTotal:  ecfDocuments.montoTotal,
      totalItbis:  ecfDocuments.totalItbis,
      almacenId:   ecfDocuments.almacenId,
      turnoCajaId: ecfDocuments.turnoCajaId,
    })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, id), eq(ecfDocuments.teamId, teamId)))
    .limit(1);

  if (!doc) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });

  // Solo ventas del POS (con turno). Una factura de Facturación se edita allá.
  if (doc.turnoCajaId == null) {
    return NextResponse.json({ error: 'Esta venta no es del POS; edítala desde Facturación.' }, { status: 422 });
  }
  if (doc.estado === 'ANULADO') {
    return NextResponse.json({ error: 'El recibo está anulado' }, { status: 409 });
  }
  // Enviado a la DGII y esperando respuesta: no se edita en vuelo.
  if (doc.estado === 'EN_PROCESO') {
    return NextResponse.json({ error: 'Comprobante en proceso en la DGII; espera la respuesta.' }, { status: 409 });
  }
  // e-CF fiscal aceptado → inmutable: handoff a la Nota de Crédito (no muta).
  if (REQUIERE_NOTA_CREDITO.includes(doc.estado)) {
    return NextResponse.json({
      requiereNotaCredito: true,
      redirectTo: `/dashboard/notas-credito/nueva?padreId=${doc.id}`,
      mensaje: 'Este comprobante fue aceptado por la DGII y no se puede editar. Su reversa formal es una Nota de Crédito (tipo 34).',
    });
  }

  // ── Líneas: quitar las marcadas (por índice) + anexar las nuevas ───────────
  let lineas: Array<Record<string, unknown>> = [];
  try { lineas = doc.lineasJson ? JSON.parse(doc.lineasJson) : []; } catch { lineas = []; }

  const quitadosSet = new Set(itemsQuitados);
  const quitadas    = lineas.filter((_, i) => quitadosSet.has(i));
  const conservadas = lineas.filter((_, i) => !quitadosSet.has(i));

  const maxId = conservadas.reduce((m, l) => Math.max(m, Number(l.id) || 0), 0);
  const lineasNuevas = itemsNuevos.map((it, i) => ({
    id: maxId + i + 1,
    productoId: it.productoId ?? 0,
    // Mismo par de campos que escribe la venta del POS, para que una línea
    // agregada al editar sea indistinguible de una vendida de primera.
    variantId: it.variantId ?? null,
    variantNombre: it.variantNombre ?? null,
    nombreItem: it.nombreItem,
    referencia: it.referencia ?? '',
    descripcionItem: '',
    cantidadItem: it.cantidadItem,
    precioUnitarioItem: it.precioUnitarioItem,
    descuentoPct: 0,
    tasaItbis: it.tasaItbis,
    indicadorBienoServicio: String(indBien(it.indicadorBienoServicio)),
  }));
  const lineasFinal = [...conservadas, ...lineasNuevas];

  // Recomputar el total COMPLETO desde el set final (fuente canónica, sin drift).
  // Se aplica el descuento por línea (descuentoPct) como descuentoMonto.
  const itemsMotor: EcfItemInput[] = lineasFinal.map((l) => {
    const precio = Number(l.precioUnitarioItem) || 0;
    const cant   = Number(l.cantidadItem) || 0;
    const pct    = Number(l.descuentoPct) || 0;
    const base   = precio * cant;
    return {
      nombreItem:             String(l.nombreItem ?? ''),
      cantidadItem:           cant,
      precioUnitarioItem:     precio,
      descuentoMonto:         pct > 0 ? base * (pct / 100) : undefined,
      tasaItbis:              tasaNum(String(l.tasaItbis ?? 'exento')),
      indicadorBienoServicio: indBien((l.indicadorBienoServicio as string | number) ?? '2'),
    };
  });
  const tot = calcularTotales(itemsMotor);
  const nuevoTotalCts = Math.round(tot.montoTotal * 100);
  const nuevoItbisCts = Math.round(tot.totalItbis * 100);

  // Estado de pago recalculado: pagos existentes + los del delta vs total nuevo.
  const [{ pagado }] = await db
    .select({ pagado: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)` })
    .from(pagosRecibidos)
    .where(and(eq(pagosRecibidos.ecfDocumentId, id), eq(pagosRecibidos.teamId, teamId)));
  const pagoDeltaCts = pagos.reduce((s, p) => s + p.valorCentavos, 0);
  const pagadoTotal = Number(pagado) + pagoDeltaCts;
  const estadoPago = pagadoTotal >= nuevoTotalCts ? 'PAGADA' : pagadoTotal > 0 ? 'PARCIAL' : 'PENDIENTE';

  // ── Aplicar ────────────────────────────────────────────────────────────────
  await db.update(ecfDocuments).set({
    lineasJson: JSON.stringify(lineasFinal),
    montoTotal: nuevoTotalCts,
    totalItbis: nuevoItbisCts,
    estadoPago,
    updatedBy: user.id,
    updatedAt: new Date(),
  }).where(eq(ecfDocuments.id, id));

  // Pagos del cambio: positivos (cobro del delta) o negativos (devolución al
  // quitar líneas pagadas). Ambos entran al turno para que la caja reconcilie.
  const pagosReales = pagos.filter((p) => p.valorCentavos !== 0);
  if (pagosReales.length > 0) {
    const hoy = hoyRD();
    await db.insert(pagosRecibidos).values(pagosReales.map((p) => ({
      teamId, ecfDocumentId: id, montoCentavos: p.valorCentavos, metodo: p.metodo,
      fechaPago: hoy, turnoCajaId: doc.turnoCajaId, createdBy: user.id,
    })));
  }

  // Descontar inventario de las líneas nuevas (bienes con producto)…
  if (itemsNuevos.length > 0) {
    descontarInventario(
      teamId, user.id, id, doc.encf,
      itemsNuevos.map((it) => ({
        productoId: it.productoId ?? null,
        // Qué talla entra y cuál sale: editar un recibo es un descuento y una
        // devolución a la vez, y las dos tienen que ir a la variante correcta.
        variantId: it.variantId ?? null,
        cantidadItem: it.cantidadItem,
        indicadorBienoServicio: indBien(it.indicadorBienoServicio),
      })),
      doc.almacenId ?? null,
    ).catch((e) => console.error('[pos/editar] descuento stock falló', e));
  }

  // …y restaurar el de las líneas quitadas (bienes con producto).
  if (quitadas.length > 0) {
    restaurarInventario(
      teamId, user.id, id, doc.encf,
      quitadas.map((l) => ({
        productoId: Number(l.productoId) || null,
        variantId: Number(l.variantId) || null,
        cantidadItem: Number(l.cantidadItem) || 0,
        indicadorBienoServicio: indBien((l.indicadorBienoServicio as string | number) ?? '2'),
      })),
      doc.almacenId ?? null,
    ).catch((e) => console.error('[pos/editar] restaurar stock falló', e));
  }

  logAudit({
    teamId, userId: user.id, actor: user.email,
    action: 'POS_VENTA_EDITAR', resource: `ecf:${id}`, ip: getIp(req),
    meta: { encf: doc.encf, lineasAgregadas: itemsNuevos.length, lineasQuitadas: quitadas.length, pagoDeltaCts },
  });

  return NextResponse.json({ ok: true, montoTotal: nuevoTotalCts, estadoPago });
}
