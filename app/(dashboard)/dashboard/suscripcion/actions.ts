'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { teams, teamMembers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';

const VALID_PLANS = ['starter', 'business', 'pro'] as const;
type ValidPlan = (typeof VALID_PLANS)[number];

const PLAN_DISPLAY: Record<ValidPlan, string> = {
  starter:  'Starter',
  business: 'Business',
  pro:      'Pro',
};

export async function switchPlanAction(formData: FormData) {
  const user = await getUser();
  if (!user) throw new Error('No autorizado');

  const teamId = await getTeamIdForUser();
  if (!teamId) throw new Error('Sin equipo');

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(eq(teamMembers.userId, user.id))
    .limit(1);

  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    throw new Error('Sin permiso');
  }

  const planKey = formData.get('plan') as string;
  if (!VALID_PLANS.includes(planKey as ValidPlan)) throw new Error('Plan inválido');

  await db
    .update(teams)
    .set({ planName: PLAN_DISPLAY[planKey as ValidPlan] })
    .where(eq(teams.id, teamId));

  revalidatePath('/dashboard/suscripcion');
  revalidatePath('/dashboard', 'layout');
}
