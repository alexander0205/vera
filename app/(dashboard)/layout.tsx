import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Rutas de /dashboard que NO requieren plan activo.
 * El usuario sin plan puede ir a suscripción/perfil pero nada más.
 */
const PLAN_EXEMPT = [
  '/dashboard/suscripcion',
  '/dashboard/perfil',
  '/dashboard/empresas',
];

export default async function Layout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';

  // Solo aplicar el guard en rutas /dashboard
  if (pathname.startsWith('/dashboard')) {
    const isExempt = PLAN_EXEMPT.some(p => pathname.startsWith(p));

    if (!isExempt) {
      const teamId = await getTeamIdForUser();

      if (teamId) {
        const [team] = await db
          .select({ planName: teams.planName, subscriptionStatus: teams.subscriptionStatus })
          .from(teams)
          .where(eq(teams.id, teamId))
          .limit(1);

        // Tiene plan activo si: planName existe Y no está cancelado/sin pagar
        const hasActivePlan =
          !!team?.planName &&
          team.subscriptionStatus !== 'canceled' &&
          team.subscriptionStatus !== 'unpaid';

        if (!hasActivePlan) {
          redirect('/pricing?reason=no-plan');
        }
      }
    }
  }

  return <>{children}</>;
}
