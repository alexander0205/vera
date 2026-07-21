import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser, getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { getConfig } from '@/lib/contabilidad/config';
import {
  listarAsientos, contarPendientes, verificarCuadre, cuentasConMovimientos,
  ORIGENES, type OrigenTipo,
} from '@/lib/contabilidad/libro-diario';
import { LibroDiarioClient } from './_client';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

/** Igual que en la API: formato y existencia en el calendario. */
function fechaValida(v: string | undefined): string | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v;
}

/**
 * Libro diario — Paso 4 del plan, con los filtros del Paso 6.
 *
 * Los asientos NO se generan al abrir esta página: hacerlo convertiría un GET en
 * una escritura contable, que se dispararía con cada recarga o prefetch. El
 * barrido es un botón explícito.
 *
 * **Los filtros viven en la URL, no en estado del cliente.** Así el servidor
 * hace el filtrado y la paginación (el libro puede tener miles de asientos y
 * traerlos todos al navegador para filtrarlos ahí es el bug que se arregló en
 * la cartera), y de paso una vista filtrada se puede compartir o guardar.
 */
export default async function LibroDiarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission('contabilidad:ver');

  const teamId = await getTeamIdForUser();
  const user = await getUser();
  if (!teamId || !user) redirect('/sign-in');

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  const puedeGenerar = await userCanForTeam(
    teamId, user.platformRole, member?.role, 'contabilidad:gestionar',
  );

  const sp = await searchParams;

  const origenTipo = ORIGENES.includes(sp.origenTipo as OrigenTipo)
    ? (sp.origenTipo as OrigenTipo)
    : undefined;
  const desde = fechaValida(sp.desde);
  const hasta = fechaValida(sp.hasta);
  const cuentaNum = Number(sp.cuentaId);
  const cuentaId = Number.isInteger(cuentaNum) && cuentaNum > 0 ? cuentaNum : undefined;
  const paginaNum = Number(sp.pagina);
  const pagina = Number.isInteger(paginaNum) && paginaNum > 0 ? paginaNum : 1;

  const filtros = { origenTipo, desde, hasta, cuentaId };

  const [cfg, primera, pendientes, cuadre, cuentas] = await Promise.all([
    getConfig(teamId),
    listarAsientos(teamId, { ...filtros, limit: PAGE_SIZE, offset: (pagina - 1) * PAGE_SIZE }),
    contarPendientes(teamId),
    verificarCuadre(teamId),
    cuentasConMovimientos(teamId),
  ]);

  // Una página fuera de rango (`?pagina=999` a mano, o un enlace viejo tras
  // borrarse asientos) devuelve cero filas sobre un libro que sí tiene datos, y
  // la pantalla acaba diciendo "todavía no hay asientos" — que es falso y
  // asusta. Se cae a la última página real.
  //
  // La consulta extra solo ocurre en ese caso anómalo: el camino normal sigue
  // siendo una sola, en paralelo con las demás.
  const paginaMax = Math.max(1, Math.ceil(primera.total / PAGE_SIZE));
  const paginaReal = Math.min(pagina, paginaMax);

  const { asientos, total, sumaCents } = paginaReal === pagina
    ? primera
    : await listarAsientos(teamId, {
        ...filtros, limit: PAGE_SIZE, offset: (paginaReal - 1) * PAGE_SIZE,
      });

  return (
    <section className="p-4 lg:p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">Libro diario</h1>
        <p className="text-sm text-gray-500">
          El registro contable que se genera solo a partir de tus facturas y cobros.
          Cada asiento tiene que cuadrar: lo que entra por un lado sale por el otro.
        </p>
      </header>

      {!cfg.activa && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>La contabilidad automática está apagada</strong>, así que no se
          genera ningún asiento.{' '}
          <Link href="/dashboard/contabilidad/configuracion" className="font-medium underline">
            Ve a la configuración
          </Link>{' '}
          para completarla y encenderla.
        </div>
      )}

      <LibroDiarioClient
        asientosIniciales={asientos}
        total={total}
        sumaCents={sumaCents}
        pendientes={pendientes}
        descuadrados={cuadre.asientosDescuadrados}
        activa={cfg.activa}
        puedeGenerar={puedeGenerar}
        cuentas={cuentas}
        filtros={{ ...filtros, pagina: paginaReal }}
        pageSize={PAGE_SIZE}
      />
    </section>
  );
}
