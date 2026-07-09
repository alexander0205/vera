/**
 * GET /api/caja/turnos/[id]/detalle — datos completos de un turno para impresión.
 *
 * Devuelve: turno, cajero, aprobador, desglose de cobros por método,
 * movimientos del turno y nombre del equipo.
 *
 * Accesible para cualquier miembro con caja:ver del equipo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/api-guard';
import { labelMetodo } from '@/lib/pagos/metodos';
import { db } from '@/lib/db/drizzle';
import {
  cajaTurnos, cajaMovimientos, pagosRecibidos,
  ecfDocuments, users, teams,
} from '@/lib/db/schema';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('caja:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const turnoId = Number(id);
  if (!Number.isInteger(turnoId) || turnoId <= 0) {
    return NextResponse.json({ error: 'Turno inválido' }, { status: 400 });
  }

  // Turno — verificar que pertenece al equipo
  const [turno] = await db
    .select()
    .from(cajaTurnos)
    .where(and(eq(cajaTurnos.id, turnoId), eq(cajaTurnos.teamId, teamId)))
    .limit(1);

  if (!turno) {
    return NextResponse.json({ error: 'Turno no encontrado' }, { status: 404 });
  }

  // Cargar todo en paralelo
  const [
    cajeroRows,
    aprobadorRows,
    teamRows,
    movimientos,
    pagosPorMetodo,
  ] = await Promise.all([
    // Cajero
    db.select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, turno.usuarioId))
      .limit(1),

    // Aprobador (puede ser null)
    turno.aprobadoPor
      ? db.select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, turno.aprobadoPor))
          .limit(1)
      : Promise.resolve([]),

    // Nombre del equipo
    db.select({ razonSocial: teams.razonSocial, nombreComercial: teams.nombreComercial })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1),

    // Movimientos del turno (el turno ya se validó del team; el filtro teamId
    // es defensa en profundidad).
    db.select()
      .from(cajaMovimientos)
      .where(and(
        eq(cajaMovimientos.teamId, teamId),
        eq(cajaMovimientos.turnoId, turnoId),
      ))
      .orderBy(cajaMovimientos.createdAt),

    // Pagos del turno agrupados por método. Se excluyen los cobros de
    // comprobantes ANULADOS (su fila pagos_recibidos puede seguir viva tras la
    // anulación) para que el desglose cuadre con lib/caja/core.
    db.select({
        metodo: pagosRecibidos.metodo,
        total:  sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)`,
        cuenta: pagosRecibidos.cuenta,
      })
      .from(pagosRecibidos)
      .innerJoin(ecfDocuments, eq(ecfDocuments.id, pagosRecibidos.ecfDocumentId))
      .where(and(
        eq(pagosRecibidos.teamId, teamId),
        eq(pagosRecibidos.turnoCajaId, turnoId),
        sql`${ecfDocuments.estado} <> 'ANULADO'`,
      ))
      .groupBy(pagosRecibidos.metodo, pagosRecibidos.cuenta),
  ]);

  const cajero   = cajeroRows[0]   ?? null;
  const aprobador = aprobadorRows[0] ?? null;
  const teamRow  = teamRows[0];
  const teamName = teamRow?.nombreComercial || teamRow?.razonSocial || `Equipo #${teamId}`;

  // Calcular desglose de efectivo manualmente desde los pagos
  const efectivoCentavos = pagosPorMetodo
    .filter(p => ['efectivo', 'cash'].includes((p.metodo ?? '').toLowerCase()))
    .reduce((s, p) => s + Number(p.total), 0);

  // Consolidar por etiqueta legible (fuente única lib/pagos/metodos; une efectivo/cash)
  const pagosConsolidados = new Map<string, number>();
  for (const p of pagosPorMetodo) {
    const key = labelMetodo(p.metodo);
    pagosConsolidados.set(key, (pagosConsolidados.get(key) ?? 0) + Number(p.total));
  }
  const pagos = Array.from(pagosConsolidados.entries())
    .map(([metodo, total]) => ({ metodo, totalCentavos: total }))
    .sort((a, b) => b.totalCentavos - a.totalCentavos);  // mayor a menor

  const totalCobrosCentavos = pagos.reduce((s, p) => s + p.totalCentavos, 0);

  return NextResponse.json({
    turno,
    cajero,
    aprobador,
    teamName,
    pagos,
    totalCobrosCentavos,
    movimientos,
  });
}
