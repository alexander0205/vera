/**
 * GET  /api/contabilidad/libro-diario  — asientos + cuántos faltan
 *   ?limit=50&offset=0&origenTipo=factura|pago|nota|anulacion
 *   &desde=YYYY-MM-DD&hasta=YYYY-MM-DD&cuentaId=12
 *
 * POST /api/contabilidad/libro-diario  — generar los asientos pendientes
 *
 * La generación es un POST explícito y no un efecto del GET: escribe
 * contabilidad, y una petición que escribe no debería poder dispararse por
 * recargar la página o por un prefetch del navegador.
 *
 * Permisos: `contabilidad:ver` para leer, `contabilidad:gestionar` para generar.
 * Generar no es configurar — es la operación del día a día.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import {
  listarAsientos, contarPendientes, generarAsientosPendientes, verificarCuadre,
  ORIGENES, type OrigenTipo,
} from '@/lib/contabilidad/libro-diario';
import { fechaValidaISO } from '@/lib/utils/format';

async function autorizar(permiso: 'contabilidad:ver' | 'contabilidad:gestionar') {
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };

  const teamId = await getTeamIdForUser();
  if (!teamId) return { error: NextResponse.json({ error: 'Sin equipo' }, { status: 403 }) };

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!await userCanForTeam(teamId, user.platformRole, member?.role, permiso)) {
    return { error: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) };
  }

  return { user, teamId };
}

export async function GET(req: NextRequest) {
  const auth = await autorizar('contabilidad:ver');
  if ('error' in auth) return auth.error;
  const { teamId } = auth;

  const { searchParams } = new URL(req.url);
  const limit  = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0);

  // La whitelist sale de ORIGENES en vez de repetir los valores a mano: cuando
  // el Paso 5 añadió 'nota' y 'anulacion', esta lista se quedó en
  // 'factura'|'pago' y filtrar por los nuevos se ignoraba en silencio —
  // devolvía el libro entero como si no hubiera filtro.
  const tipoRaw = searchParams.get('origenTipo');
  const origenTipo = ORIGENES.includes(tipoRaw as OrigenTipo)
    ? (tipoRaw as OrigenTipo)
    : undefined;

  const desde = fechaValidaISO(searchParams.get('desde'));
  const hasta = fechaValidaISO(searchParams.get('hasta'));

  const cuentaRaw = Number(searchParams.get('cuentaId'));
  const cuentaId = Number.isInteger(cuentaRaw) && cuentaRaw > 0 ? cuentaRaw : undefined;

  const [{ asientos, total, sumaCents }, pendientes, cuadre] = await Promise.all([
    listarAsientos(teamId, { limit, offset, origenTipo, desde, hasta, cuentaId }),
    contarPendientes(teamId),
    verificarCuadre(teamId),
  ]);

  return NextResponse.json({
    asientos, total, sumaCents, pendientes,
    descuadrados: cuadre.asientosDescuadrados,
  });
}

export async function POST() {
  const auth = await autorizar('contabilidad:gestionar');
  if ('error' in auth) return auth.error;
  const { user, teamId } = auth;

  const resumen = await generarAsientosPendientes(teamId, user.id);
  return NextResponse.json(resumen);
}
