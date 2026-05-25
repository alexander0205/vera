/**
 * Helpers server-side compartidos por las rutas /api/import/*.
 * Auth + permiso + lectura del archivo subido (multipart).
 */

import { NextRequest } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCan, type Permission } from '@/lib/config/roles';
import type { ImportMode } from './csv';

export class ImportError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Verifica sesión + equipo + permiso. Lanza ImportError si falla. */
export async function requireImport(permission: Permission) {
  const user = await getUser();
  if (!user) throw new ImportError(401, 'No autorizado');

  const teamId = await getTeamIdForUser();
  if (!teamId) throw new ImportError(403, 'Sin equipo');

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!userCan(user.platformRole, member?.role, permission)) {
    throw new ImportError(403, 'Sin permiso');
  }
  return { user, teamId };
}

/** Lee el archivo + mode del multipart form. */
export async function readUpload(req: NextRequest): Promise<{ buf: Buffer; mode: ImportMode; filename: string }> {
  const form = await req.formData();
  const file = form.get('file');
  const mode: ImportMode = form.get('mode') === 'commit' ? 'commit' : 'preview';
  if (!(file instanceof File)) throw new ImportError(400, 'Archivo requerido');
  const buf = Buffer.from(await file.arrayBuffer());
  return { buf, mode, filename: file.name };
}
