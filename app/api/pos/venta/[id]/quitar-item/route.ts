/**
 * POST /api/pos/venta/[id]/quitar-item — quita UN ítem de un recibo POS ya
 * cobrado y devuelve lo pagado por él. Pensado para el cajero: quita una sola
 * línea desde el drawer del historial, sin entrar al editor completo.
 *
 * Gate: pos:quitar-item-pin. Si el que llama NO tiene pos:anular (no es
 * supervisor), debe adjuntar el PIN de un supervisor (admin/owner con PIN
 * configurado). Un admin/owner (pos:anular) no necesita PIN.
 *
 * Efecto: recomputa el total desde las líneas restantes, inserta una devolución
 * (pago negativo en efectivo, acotada a lo ya pagado) atada al mismo turno,
 * restaura el inventario del ítem y recalcula estadoPago. Solo tickets sin-ncf /
 * borrador / rechazado; un e-CF aceptado es inmutable (handoff a Nota de Crédito).
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { userCanForTeam } from '@/lib/auth/permissions';
import { logAudit, getIp } from '@/lib/audit';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, pagosRecibidos } from '@/lib/db/schema';
import { restaurarInventario } from '@/lib/inventario/devolucion';
import { calcularTotales, type EcfItemInput } from '@/lib/ecf/types';
import { hoyRD } from '@/lib/utils/format';
import { autorizarPorPin } from '@/lib/pos/pin';

const REQUIERE_NOTA_CREDITO = ['ACEPTADO', 'ACEPTADO_CONDICIONAL'];

const schema = z.object({
  lineaIndex: z.number().int().min(0),
  pin: z.string().optional(),
});

function tasaNum(t: string): number | undefined {
  if (t === '0.18') return 0.18;
  if (t === '0.16') return 0.16;
  if (t === '0') return 0;
  return undefined;
}
function indBien(v: string | number): 1 | 2 {
  return v === 1 || v === '1' ? 1 : 2;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('pos', 'pos:quitar-item-pin');
  if (!auth.ok) return auth.response;
  const { teamId, user, teamRole } = auth;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  const { lineaIndex, pin } = parsed.data;

  // ¿El que llama es supervisor (puede editar/anular)? Si no, exige PIN.
  const esSupervisor = await userCanForTeam(teamId, user.platformRole, teamRole, 'pos:anular');
  let autorizadoPor: { userId: number; nombre: string | null } | null = null;
  if (!esSupervisor) {
    const authz = await autorizarPorPin(teamId, pin ?? '');
    if (!authz) {
      return NextResponse.json({ error: 'PIN inválido o sin autorización de supervisor.' }, { status: 403 });
    }
    autorizadoPor = { userId: authz.userId, nombre: authz.nombre };
  }

  const [doc] = await db
    .select({
      id:          ecfDocuments.id,
      estado:      ecfDocuments.estado,
      encf:        ecfDocuments.encf,
      lineasJson:  ecfDocuments.lineasJson,
      montoTotal:  ecfDocuments.montoTotal,
      almacenId:   ecfDocuments.almacenId,
      turnoCajaId: ecfDocuments.turnoCajaId,
    })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, id), eq(ecfDocuments.teamId, teamId)))
    .limit(1);

  if (!doc) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
  if (doc.turnoCajaId == null) {
    return NextResponse.json({ error: 'Esta venta no es del POS.' }, { status: 422 });
  }
  if (doc.estado === 'ANULADO') {
    return NextResponse.json({ error: 'El recibo está anulado' }, { status: 409 });
  }
  if (doc.estado === 'EN_PROCESO') {
    return NextResponse.json({ error: 'Comprobante en proceso en la DGII; espera la respuesta.' }, { status: 409 });
  }
  if (REQUIERE_NOTA_CREDITO.includes(doc.estado)) {
    return NextResponse.json({
      requiereNotaCredito: true,
      redirectTo: `/dashboard/notas-credito/nueva?padreId=${doc.id}`,
      mensaje: 'Este comprobante fue aceptado por la DGII y no se puede editar. Su reversa formal es una Nota de Crédito (tipo 34).',
    });
  }

  let lineas: Array<Record<string, unknown>> = [];
  try { lineas = doc.lineasJson ? JSON.parse(doc.lineasJson) : []; } catch { lineas = []; }
  if (lineaIndex >= lineas.length) {
    return NextResponse.json({ error: 'El ítem ya no existe en el recibo.' }, { status: 409 });
  }

  const quitada     = lineas[lineaIndex];
  const conservadas = lineas.filter((_, i) => i !== lineaIndex);

  // Recomputar el total desde las líneas restantes (fuente canónica).
  const itemsMotor: EcfItemInput[] = conservadas.map((l) => {
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

  // Devolución = lo que baja el total, acotada a lo ya pagado (no devolver de más
  // en un recibo que no estaba pagado del todo).
  const [{ pagado }] = await db
    .select({ pagado: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)` })
    .from(pagosRecibidos)
    .where(and(eq(pagosRecibidos.ecfDocumentId, id), eq(pagosRecibidos.teamId, teamId)));
  const pagadoPrevio = Number(pagado);
  const baja = Math.max(0, doc.montoTotal - nuevoTotalCts);
  const devolucion = Math.min(baja, pagadoPrevio);   // en centavos, ≥ 0
  const pagadoTotal = pagadoPrevio - devolucion;
  const estadoPago = nuevoTotalCts <= 0 ? 'GRATUITA'
    : pagadoTotal >= nuevoTotalCts ? 'PAGADA'
    : pagadoTotal > 0 ? 'PARCIAL' : 'PENDIENTE';

  await db.update(ecfDocuments).set({
    lineasJson: JSON.stringify(conservadas),
    montoTotal: nuevoTotalCts,
    totalItbis: nuevoItbisCts,
    estadoPago,
    updatedBy: user.id,
    updatedAt: new Date(),
  }).where(eq(ecfDocuments.id, id));

  if (devolucion > 0) {
    await db.insert(pagosRecibidos).values({
      teamId, ecfDocumentId: id, montoCentavos: -devolucion, metodo: 'efectivo',
      fechaPago: hoyRD(), turnoCajaId: doc.turnoCajaId, createdBy: user.id,
    });
  }

  // Restaurar inventario del ítem quitado (bien con producto).
  restaurarInventario(
    teamId, user.id, id, doc.encf,
    [{
      productoId: Number(quitada.productoId) || null,
      variantId: Number(quitada.variantId) || null,
      cantidadItem: Number(quitada.cantidadItem) || 0,
      indicadorBienoServicio: indBien((quitada.indicadorBienoServicio as string | number) ?? '2'),
    }],
    doc.almacenId ?? null,
  ).catch((e) => console.error('[pos/quitar-item] restaurar stock falló', e));

  logAudit({
    teamId, userId: user.id, actor: user.email,
    action: 'POS_VENTA_QUITAR_ITEM', resource: `ecf:${id}`, ip: getIp(req),
    meta: {
      encf: doc.encf, item: String(quitada.nombreItem ?? ''), devolucionCts: devolucion,
      autorizadoPorPin: !esSupervisor, autorizadoPor: autorizadoPor?.userId ?? null,
    },
  });

  return NextResponse.json({ ok: true, estadoPago, devolucionCts: devolucion });
}
