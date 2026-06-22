/**
 * POST /api/facturas/[id]/anular
 * Anula un e-CF cambiando su estado a ANULADO.
 *
 * Body opcional:
 *   {
 *     tipoAnulacion?: '01' | '02' | '03' | '04' | '05',  // motivo DGII
 *     motivo?:        string,                             // notas internas
 *     force?:         boolean,                            // permitir aunque haya pagos (revierte estado pagos)
 *   }
 *
 * Reglas:
 *  - Si el e-CF tiene pagos registrados, bloquea (NCA-03) salvo `force=true`.
 *    Con `force=true`, marca los pagos como REVERTIDOS (no se eliminan, queda traza).
 *  - tipoAnulacion default '04' (cesación de operaciones) — antes era el único permitido.
 *  - Para ACEPTADOS, recordatorio que la anulación formal DGII requiere NC tipo 34.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, pagosRecibidos, teamMembers, users } from '@/lib/db/schema';
import { restaurarInventario } from '@/lib/inventario/devolucion';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { userCan } from '@/lib/config/roles';

const ESTADOS_ANULABLES = ['BORRADOR', 'EN_PROCESO', 'ACEPTADO', 'ACEPTADO_CONDICIONAL', 'RECHAZADO'];

const TIPOS_ANULACION = ['01', '02', '03', '04', '05'] as const;
const TIPOS_ANULACION_LABEL: Record<string, string> = {
  '01': 'Deterioro de Factura Pre-impresa',
  '02': 'Errores de Impresión (Factura Pre-impresa)',
  '03': 'Impresión Defectuosa',
  '04': 'Cesación de Operaciones',
  '05': 'Pérdida o Hurto de Talonarios',
};

const bodySchema = z.object({
  tipoAnulacion: z.enum(TIPOS_ANULACION).optional(),
  motivo:        z.string().max(500).optional(),
  force:         z.boolean().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  // ── Gate: facturas:anular ─────────────────────────────────────────────────
  const [[u], [m]] = await Promise.all([
    db.select({ platformRole: users.platformRole }).from(users).where(eq(users.id, user.id)).limit(1),
    db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId))).limit(1),
  ]);
  if (!userCan(u?.platformRole, m?.role, 'facturas:anular')) {
    return NextResponse.json({ error: 'Sin permiso para anular facturas' }, { status: 403 });
  }

  const { id } = await params;
  const docId = parseInt(id);
  if (isNaN(docId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  // Body opcional — anular sin body sigue funcionando
  let parsed: z.infer<typeof bodySchema> = {};
  try {
    const body = await req.json();
    const p = bodySchema.safeParse(body ?? {});
    if (!p.success) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: p.error.flatten() }, { status: 400 });
    }
    parsed = p.data;
  } catch {
    // sin body → ok, usa defaults
  }
  const tipoAnulacion = parsed.tipoAnulacion ?? '04';
  const force         = parsed.force === true;

  const [doc] = await db
    .select({
      id:            ecfDocuments.id,
      estado:        ecfDocuments.estado,
      encf:          ecfDocuments.encf,
      tipoEcf:       ecfDocuments.tipoEcf,
      pagoRecibido:  ecfDocuments.pagoRecibido,
      pagoValorCts:  ecfDocuments.pagoValorCts,
      lineasJson:    ecfDocuments.lineasJson,
      almacenId:     ecfDocuments.almacenId,
      stockDescontado: ecfDocuments.stockDescontado,
    })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)))
    .limit(1);

  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

  if (doc.estado === 'ANULADO') {
    return NextResponse.json({ error: 'El comprobante ya está anulado' }, { status: 409 });
  }

  if (!ESTADOS_ANULABLES.includes(doc.estado)) {
    return NextResponse.json(
      { error: `No se puede anular un comprobante en estado ${doc.estado}` },
      { status: 422 }
    );
  }

  // NCA-03: si hay pagos registrados, bloquear salvo force=true.
  // Dos fuentes: tabla pagos_recibidos (legacy nueva) + flag legacy en
  // ecf_documents.pagoRecibido='true' con pagoValorCts > 0.
  const pagos = await db
    .select({ id: pagosRecibidos.id, montoCentavos: pagosRecibidos.montoCentavos })
    .from(pagosRecibidos)
    .where(eq(pagosRecibidos.ecfDocumentId, docId));

  const legacyPagado = doc.pagoRecibido === 'true' && (doc.pagoValorCts ?? 0) > 0;
  const totalLegacy  = legacyPagado ? (doc.pagoValorCts ?? 0) : 0;
  const totalPagado  = pagos.reduce((s, p) => s + p.montoCentavos, 0) + totalLegacy;
  const tienePagos   = pagos.length > 0 || legacyPagado;

  if (tienePagos && !force) {
    return NextResponse.json(
      {
        error:    'La factura tiene pagos registrados',
        pagos:    pagos.length + (legacyPagado ? 1 : 0),
        montoPagadoCentavos: totalPagado,
        mensaje:  `Esta factura tiene pagos por ${(totalPagado / 100).toFixed(2)} DOP. Reenvía con force=true para anular y revertir los pagos.`,
      },
      { status: 409 },
    );
  }

  // Si force, revertir: eliminar filas pagos_recibidos + limpiar flags legacy
  if (tienePagos && force) {
    if (pagos.length > 0) {
      await db.delete(pagosRecibidos).where(eq(pagosRecibidos.ecfDocumentId, docId));
    }
    if (legacyPagado) {
      await db.update(ecfDocuments).set({
        pagoRecibido: 'false',
        pagoValorCts: 0,
        pagoMetodo:   null,
        pagoCuenta:   null,
        pagoFecha:    null,
        updatedAt:    new Date(),
      }).where(eq(ecfDocuments.id, docId));
    }
  }

  // Para comprobantes ACEPTADOS, la anulación formal requiere una Nota de Crédito (tipo 34)
  const esAceptado = doc.estado === 'ACEPTADO' || doc.estado === 'ACEPTADO_CONDICIONAL';

  await db
    .update(ecfDocuments)
    .set({
      estado:        'ANULADO',
      estadoPago:    'ANULADA',
      tipoAnulacion,
      stockDescontado: false,
      updatedAt:     new Date(),
    })
    .where(eq(ecfDocuments.id, docId));

  // Restaurar stock solo si este documento llegó a descontarlo. Ya no se basa
  // en `estado` porque ahora un BORRADOR también puede haber descontado stock
  // al guardarse (ver /api/ecf/emitir).
  if (doc.stockDescontado && doc.lineasJson) {
    try {
      const lineas = JSON.parse(doc.lineasJson) as Array<Record<string, unknown>>;
      const items = lineas.map(i => ({
        productoId:             i.productoId             ? Number(i.productoId)   : null,
        cantidadItem:           i.cantidadItem           ? Number(i.cantidadItem) : 1,
        indicadorBienoServicio: (i.indicadorBienoServicio === 1 || i.indicadorBienoServicio === '1') ? 1 : 2 as 1 | 2,
      }));
      restaurarInventario(teamId, user.id, docId, doc.encf, items, doc.almacenId ?? null)
        .catch((e) => console.error('[anular] stock restore failed', e));
    } catch {
      // lineasJson malformado — no bloquear la anulación
    }
  }

  return NextResponse.json({
    ok: true,
    encf: doc.encf,
    estado: 'ANULADO',
    tipoAnulacion,
    tipoAnulacionLabel: TIPOS_ANULACION_LABEL[tipoAnulacion],
    pagosRevertidos: force ? pagos.length : 0,
    nota: esAceptado
      ? 'Comprobante marcado como anulado localmente. Para anulación formal ante la DGII, emite una Nota de Crédito (tipo 34) referenciando este e-NCF.'
      : 'Comprobante anulado correctamente.',
  });
}
