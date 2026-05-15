import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembers, users } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';

/**
 * Gate: solo owner o admin del team (o platform admin) ven /dashboard/configuracion.
 * Roles contador/vendedor/member se redirigen a /dashboard.
 *
 * Razón: configuración expone edición de RNC/razón social/dirección/firma — cambios
 * que afectan e-CF emitidos. Restringido a quienes administran el negocio.
 */
const ROLES_PERMITIDOS = ['owner', 'admin'] as const;

export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/dashboard');

  // Platform admin bypass
  const [u] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (u?.platformRole !== 'admin') {
    const [member] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
      .limit(1);

    if (!member || !(ROLES_PERMITIDOS as readonly string[]).includes(member.role)) {
      redirect('/dashboard');
    }
  }

  return <>{children}</>;
}
