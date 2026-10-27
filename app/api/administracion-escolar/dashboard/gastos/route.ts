import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarPeriodos } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { userHasModule } from '@/lib/auth/modules';
import { userCanForTeam } from '@/lib/auth/permissions';
import { hoyRD } from '@/lib/utils/format';
import { gastosDelPeriodo } from '@/lib/administracion-escolar/panorama-gastos-datos';

/**
 * Lo que salió en el año escolar, para las vistas Gastos y Ganancias del
 * Panorama. Va aparte del panorama de ingresos (`../route.ts`) porque se pide
 * solo al abrir esas vistas y porque lo ve menos gente:
 *
 *   - Pide `compras:ver`: es lo que deja ver la pantalla de Gastos. La
 *     secretaria ve lo que se cobra, no lo que el colegio paga.
 *   - La nómina solo entra con el módulo Nómina y `empleados:ver`; si no, la
 *     cifra iría sin ella (y la pantalla lo dice) en vez de dejar deducirla.
 *
 * Solo lectura. `?periodoId=` como el Panorama; sin él, el año activo.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'compras:ver');
  if (!auth.ok) return auth.response;
  const { teamId, user, teamRole } = auth;

  const pedido = Number(req.nextUrl.searchParams.get('periodoId'));
  const periodos = await db
    .select({ id: adminEscolarPeriodos.id, activo: adminEscolarPeriodos.activo })
    .from(adminEscolarPeriodos)
    .where(eq(adminEscolarPeriodos.teamId, teamId))
    .orderBy(desc(adminEscolarPeriodos.activo), desc(adminEscolarPeriodos.fechaInicio));
  if (periodos.length === 0) return NextResponse.json({ datos: null });
  const periodoId = periodos.some((p) => p.id === pedido)
    ? pedido
    : (await db.select({ id: adminEscolarPeriodos.id }).from(adminEscolarPeriodos)
      .where(and(eq(adminEscolarPeriodos.teamId, teamId), eq(adminEscolarPeriodos.activo, true))).limit(1))[0]?.id
      ?? periodos[0].id;

  const [moduloNomina, verEmpleados] = await Promise.all([
    userHasModule(teamId, user.platformRole, teamRole, 'nomina'),
    userCanForTeam(teamId, user.platformRole, teamRole, 'empleados:ver'),
  ]);

  const datos = await gastosDelPeriodo(teamId, periodoId, hoyRD(), moduloNomina && verEmpleados);
  return NextResponse.json({ datos });
}
