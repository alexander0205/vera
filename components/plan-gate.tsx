import { redirect } from 'next/navigation';
import { getTeamIdForUser, getTeamProfile } from '@/lib/db/queries';
import { planHasFeature, type PlanFeature } from '@/lib/plans';

export async function PlanGate({ feature }: { feature: PlanFeature }) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return null;
  const team = await getTeamProfile(teamId);
  if (!planHasFeature(team?.planName, feature)) {
    redirect('/dashboard');
  }
  return null;
}
