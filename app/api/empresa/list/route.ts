import { NextResponse } from 'next/server';
import { getUserTeams, getTeamIdForUser } from '@/lib/db/queries';

export async function GET() {
  const [teams, activeTeamId] = await Promise.all([
    getUserTeams(),
    getTeamIdForUser(),
  ]);

  return NextResponse.json({ teams, activeTeamId });
}
