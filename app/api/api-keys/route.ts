import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { apiKeys } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

// APIK-05: alinear permisos válidos con dropdown UI
const createSchema = z.object({
  nombre:   z.string().min(1, 'Nombre requerido').max(120),
  permisos: z.enum(['read', 'write', 'admin']).default('read'),
});

/**
 * Pide el mismo permiso que crear y revocar.
 *
 * Antes solo comprobaba que hubiera equipo, así que cualquier miembro
 * autenticado —aunque no tuviera acceso a Configuración— podía listar los
 * nombres, prefijos y niveles de permiso de las keys de la empresa. No expone
 * la key en sí (solo se guarda el hash), pero es el inventario de qué
 * integraciones hay y con cuánto permiso, y `POST`/`DELETE` de este mismo
 * recurso ya exigían `configuracion:gestionar`.
 */
export async function GET() {
  const auth = await requirePermission('configuracion:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

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
  const auth = await requirePermission('configuracion:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', detalles: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { nombre, permisos } = parsed.data;

  const rawKey = `emdo_${randomBytes(24).toString('hex')}`;
  const keyPrefix = rawKey.slice(0, 12);
  const keyHash = await bcrypt.hash(rawKey, 10);

  const [key] = await db.insert(apiKeys).values({
    teamId,
    nombre,
    keyHash,
    keyPrefix,
    permisos,
  }).returning({ id: apiKeys.id, nombre: apiKeys.nombre, keyPrefix: apiKeys.keyPrefix });

  // Return the raw key only once
  return NextResponse.json({ ...key, rawKey }, { status: 201 });
}
