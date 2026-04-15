import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { apiKeys } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

export async function GET() {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const keys = await db
    .select({
      id: apiKeys.id,
      nombre: apiKeys.nombre,
      keyPrefix: apiKeys.keyPrefix,
      permisos: apiKeys.permisos,
      ultimoUsoAt: apiKeys.ultimoUsoAt,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.teamId, teamId), isNull(apiKeys.revokedAt)));

  return NextResponse.json(keys);
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });

  const { nombre, permisos } = await req.json();
  if (!nombre) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });

  const rawKey = `emdo_${randomBytes(24).toString('hex')}`;
  const keyPrefix = rawKey.slice(0, 12);
  const keyHash = await bcrypt.hash(rawKey, 10);

  const [key] = await db.insert(apiKeys).values({
    teamId,
    nombre,
    keyHash,
    keyPrefix,
    permisos: permisos ?? 'read',
  }).returning({ id: apiKeys.id, nombre: apiKeys.nombre, keyPrefix: apiKeys.keyPrefix });

  // Return the raw key only once
  return NextResponse.json({ ...key, rawKey }, { status: 201 });
}
