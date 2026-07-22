import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser, getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers, categorias, products } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { listarCuentas } from '@/lib/contabilidad/cuentas';
import {
  getConfig, getMetodosConfigurados, getOverridesIngreso,
} from '@/lib/contabilidad/config';
import { getEstadoConfiguracion } from '@/lib/contabilidad/validacion';
import { ConfigClient } from './_client';

export const dynamic = 'force-dynamic';

/**
 * Configuración contable — Paso 3 del plan.
 *
 * Le dice al sistema qué cuenta usar para cada cosa, para que el Paso 4 pueda
 * generar asientos sin preguntar en cada factura.
 */
export default async function ConfiguracionContablePage() {
  await requirePermission('contabilidad:ver');

  const teamId = await getTeamIdForUser();
  const user = await getUser();
  if (!teamId || !user) redirect('/sign-in');

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  const puedeConfigurar = await userCanForTeam(
    teamId, user.platformRole, member?.role, 'contabilidad:configurar',
  );

  const [config, metodos, overrides, estado, cuentas, cats, prods] = await Promise.all([
    getConfig(teamId),
    getMetodosConfigurados(teamId),
    getOverridesIngreso(teamId),
    getEstadoConfiguracion(teamId),
    // Solo las imputables: apuntar la configuración a una cuenta de agrupación
    // produciría asientos sobre una cuenta que no los recibe.
    listarCuentas(teamId).then((cs) => cs.filter((c) => c.imputable && c.activa)),
    db.select({ id: categorias.id, nombre: categorias.nombre })
      .from(categorias).where(eq(categorias.teamId, teamId)).orderBy(asc(categorias.nombre)),
    db.select({ id: products.id, nombre: products.nombre })
      .from(products).where(eq(products.teamId, teamId)).orderBy(asc(products.nombre)).limit(500),
  ]);

  return (
    <section className="p-4 lg:p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
          Configuración contable
        </h1>
        <p className="text-sm text-gray-500">
          Qué cuenta usar para cada cosa, para que el sistema no te lo pregunte en
          cada factura. Todavía no se generan asientos — eso llega en el siguiente paso.
        </p>
      </header>

      {cuentas.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Todavía no hay cuentas en el catálogo.{' '}
          <Link href="/dashboard/contabilidad/cuentas" className="font-medium underline">
            Abre el catálogo de cuentas
          </Link>{' '}
          primero: se creará solo con la estructura estándar.
        </div>
      ) : (
        <ConfigClient
          configInicial={config}
          metodosIniciales={metodos}
          overridesIniciales={overrides}
          estadoInicial={estado}
          cuentas={cuentas}
          categorias={cats}
          productos={prods}
          puedeConfigurar={puedeConfigurar}
        />
      )}
    </section>
  );
}
