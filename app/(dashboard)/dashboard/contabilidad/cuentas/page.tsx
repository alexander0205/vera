import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser, getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { sembrarCatalogoBase } from '@/lib/contabilidad/catalogo-base';
import { listarCuentasArbol } from '@/lib/contabilidad/cuentas';
import { CatalogoClient } from './_client';

export const dynamic = 'force-dynamic';

/**
 * Catálogo de cuentas contables — Paso 2 del plan.
 *
 * La siembra del catálogo base ocurre aquí, en el primer render: un team que
 * nunca abrió contabilidad no tiene cuentas hasta este momento. Es idempotente.
 */
export default async function CuentasPage() {
  await requirePermission('contabilidad:ver');

  const teamId = await getTeamIdForUser();
  const user = await getUser();
  if (!teamId || !user) redirect('/sign-in');

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  // Editar el catálogo es configuración, no gestión diaria: quien solo tiene
  // `contabilidad:ver` lo consulta en modo lectura.
  const puedeConfigurar = await userCanForTeam(
    teamId, user.platformRole, member?.role, 'contabilidad:configurar',
  );

  const sembradas = await sembrarCatalogoBase(teamId, user.id);
  const cuentas = await listarCuentasArbol(teamId, { incluirInactivas: true });

  return (
    <section className="p-4 lg:p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
          Catálogo de cuentas
        </h1>
        <p className="text-sm text-gray-500">
          El mapa contable de tu empresa: dónde se van a clasificar los movimientos.
          Todavía no hay asientos — eso llega en el siguiente paso.
        </p>
      </header>

      {sembradas > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Se creó un catálogo base de {sembradas} cuentas con la numeración estándar
          dominicana. Puedes renombrarlas, agregar las tuyas o desactivar las que no uses.
        </div>
      )}

      <CatalogoClient cuentasIniciales={cuentas} puedeConfigurar={puedeConfigurar} />
    </section>
  );
}
