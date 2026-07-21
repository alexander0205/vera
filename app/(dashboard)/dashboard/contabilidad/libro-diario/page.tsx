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
  listarAsientos, contarPendientes, verificarCuadre,
} from '@/lib/contabilidad/libro-diario';
import { LibroDiarioClient } from './_client';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

/**
 * Libro diario — Paso 4 del plan.
 *
 * Los asientos NO se generan al abrir esta página: hacerlo convertiría un GET en
 * una escritura contable, que se dispararía con cada recarga o prefetch. El
 * barrido es un botón explícito.
 */
export default async function LibroDiarioPage() {
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

  const [cfg, { asientos, total }, pendientes, cuadre] = await Promise.all([
    getConfig(teamId),
    listarAsientos(teamId, { limit: PAGE_SIZE }),
    contarPendientes(teamId),
    verificarCuadre(teamId),
  ]);

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
        pendientes={pendientes}
        descuadrados={cuadre.asientosDescuadrados}
        activa={cfg.activa}
        puedeGenerar={puedeGenerar}
      />
    </section>
  );
}
