import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarPeriodos } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { dashboardDelPeriodo, hoyRD } from '@/lib/administracion-escolar/dashboard';

/**
 * El panorama financiero del año escolar.
 *
 * Sin `periodoId` responde con el ACTIVO, que es el que el colegio quiere ver
 * el 99% de las veces. Se resuelve aquí y no en el cliente para que la pantalla
 * no tenga que pedir primero la lista de períodos y luego los números: eran dos
 * viajes en serie antes de pintar la primera cifra.
 *
 * Solo lectura. A diferencia del listado de estudiantes, NO llama a
 * `sincronizarSaldosDesdeFacturas`: esa función escribe, y un resumen que se
 * refresca solo no puede estar tocando miles de cargos cada vez que alguien
 * deja la pestaña abierta. Los saldos que enseña son los que dejó la última
 * pantalla que sí sincroniza.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const pedido = Number(req.nextUrl.searchParams.get('periodoId'));

  const periodos = await db
    .select({
      id: adminEscolarPeriodos.id,
      nombre: adminEscolarPeriodos.nombre,
      activo: adminEscolarPeriodos.activo,
    })
    .from(adminEscolarPeriodos)
    .where(eq(adminEscolarPeriodos.teamId, teamId))
    .orderBy(desc(adminEscolarPeriodos.activo), desc(adminEscolarPeriodos.fechaInicio));

  if (periodos.length === 0) {
    // Un colegio recién dado de alta todavía no tiene año escolar. Se responde
    // 200 con `datos: null` y no 404: no es un error, es una pantalla que
    // todavía no tiene nada que enseñar, y la diferencia decide si la UI pinta
    // «configura tu año escolar» o «algo falló».
    return NextResponse.json({ periodos: [], datos: null });
  }

  const [{ id: porDefecto }] = await db
    .select({ id: adminEscolarPeriodos.id })
    .from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.teamId, teamId), eq(adminEscolarPeriodos.activo, true)))
    .limit(1)
    .then((r) => (r.length ? r : [{ id: periodos[0].id }]));

  // El id pedido se valida contra los períodos del team y no se pasa a la
  // consulta a secas: es un número que llega por URL, y aunque las consultas
  // filtren por `team_id`, un id de otro colegio devolvería ceros en vez de un
  // error, que es mucho más difícil de diagnosticar.
  const periodoId = periodos.some((p) => p.id === pedido) ? pedido : porDefecto;

  const datos = await dashboardDelPeriodo(teamId, periodoId, hoyRD());

  return NextResponse.json({ periodos, datos });
}
