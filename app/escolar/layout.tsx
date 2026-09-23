import { redirect } from 'next/navigation';
import { EscolarNavRail } from '@/components/escolar-nav-rail';
import { ModuleShell } from '@/components/module-shell';
import { ModuloEscolarInactivo } from '@/components/administracion-escolar/ModuloEscolarInactivo';
import { requireModule, requirePermission } from '@/lib/auth/page-guard';
import { teamHasModule } from '@/lib/auth/modules';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { exigirOnboarding } from '@/lib/onboarding/muro';

export const metadata = { title: 'Zero Administración Escolar' };

/**
 * Módulo Administración Escolar — su propio espacio, como Facturación y Punto
 * de Venta. Doble gate de servidor sobre TODO lo que cuelga de /escolar:
 *
 *   1. Suscripción → la empresa tiene el módulo escolar en su plan. Si NO,
 *      se muestra el muro «Activa el plan» en vez de rebotar sin decir nada:
 *      un colegio que nunca lo tuvo, o que se dio de baja, ve qué le falta.
 *   2. requireModule    → el rol tiene 'modulo:escolar' (la empresa ya lo
 *      tiene por el paso 1; aquí solo puede fallar el permiso del rol).
 *   3. requirePermission → ya dentro del módulo, el rol puede al menos mirar.
 *
 * Sub-rutas más estrictas (p. ej. configuracion) agregan su propio
 * requirePermission encima de este.
 */
export default async function EscolarLayout({ children }: { children: React.ReactNode }) {
  await exigirOnboarding();

  const user = await getUser();
  if (!user) redirect('/sign-in');
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/dashboard/empresas');

  // Gate por suscripción: sin el módulo escolar en el plan, muro con CTA.
  if (!(await teamHasModule(teamId, 'escolar'))) {
    return <ModuloEscolarInactivo />;
  }

  // La empresa sí tiene el módulo; aquí solo puede fallar el permiso del rol.
  await requireModule('escolar', '/sin-acceso');
  await requirePermission('administracion-escolar:ver');

  return (
    <ModuleShell
      current="escolar"
      user={user ?? null}
      rail={<EscolarNavRail />}
      railMovil={<EscolarNavRail variant="drawer" />}
    >
      {children}
    </ModuleShell>
  );
}
