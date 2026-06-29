/**
 * GET /api/pos/ticket/[id] — datos del recibo de una venta POS.
 * Requiere pos:vender. Devuelve empresa, líneas, totales y pagos.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, pagosRecibidos, teams, users } from '@/lib/db/schema';

interface LineaTicket {
  nombreItem: string;
  cantidadItem: number;
  precioUnitarioItem: number;  // pesos, base
  tasaItbis?: string;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('pos:vender');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [doc] = await db.select().from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, id), eq(ecfDocuments.teamId, teamId))).limit(1);
  if (!doc) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });

  const [empresa] = await db.select({ razonSocial: teams.razonSocial, name: teams.name, rnc: teams.rnc })
    .from(teams).where(eq(teams.id, teamId)).limit(1);

  const pagos = await db.select({ metodo: pagosRecibidos.metodo, montoCentavos: pagosRecibidos.montoCentavos })
    .from(pagosRecibidos)
    .where(and(eq(pagosRecibidos.teamId, teamId), eq(pagosRecibidos.ecfDocumentId, id)))
    .orderBy(asc(pagosRecibidos.id));

  let cajero: string | null = null;
  if (doc.createdBy) {
    const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, doc.createdBy)).limit(1);
    cajero = u?.name ?? u?.email ?? null;
  }

  let lineas: LineaTicket[] = [];
  if (doc.lineasJson) {
    try { lineas = JSON.parse(doc.lineasJson) as LineaTicket[]; } catch { lineas = []; }
  }

  return NextResponse.json({
    empresa: { nombre: empresa?.razonSocial || empresa?.name || 'Empresa', rnc: empresa?.rnc ?? null },
    doc: {
      encf: doc.encf, codigo: doc.codigo, tipoEcf: doc.tipoEcf,
      fechaEmision: doc.fechaEmision, montoTotal: doc.montoTotal, totalItbis: doc.totalItbis,
      cliente: doc.razonSocialComprador, dependiente: doc.dependienteNombre,
    },
    lineas, pagos, cajero,
  });
}
