import { redirect } from 'next/navigation';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { userCan } from '@/lib/config/roles';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import ReporteMaestrosClient from './_page-client';

export default async function Page() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!userCan(user.platformRole, member?.role, 'reportes:ver')) {
    redirect('/dashboard?error=sin_permiso');
  }

  return <ReporteMaestrosClient />;
}
