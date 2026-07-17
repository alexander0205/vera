/**
 * GET  /api/pagos/pasarelas — lista configs (sin secretos) del team.
 * PUT  /api/pagos/pasarelas — crea/actualiza la config de un proveedor.
 *
 * Permiso: configuracion:gestionar (solo owner/admin por defecto).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/api-guard';
import { listProviderConfigsSafe, upsertProviderConfig, PROVIDERS } from '@/lib/pagos/config';

export async function GET() {
  const auth = await requirePermission('configuracion:ver');
  if (!auth.ok) return auth.response;
  const configs = await listProviderConfigsSafe(auth.teamId);
  return NextResponse.json({ configs });
}

const putSchema = z.object({
  provider:   z.enum(PROVIDERS),
  merchantId: z.string().max(50).optional().nullable(),
  terminalId: z.string().max(50).optional().nullable(),
  authKeyPlain: z.string().max(500).optional(),
  apiKeyPlain:  z.string().max(500).optional(),
  ambiente:   z.enum(['sandbox', 'prod']),
  enabled:    z.boolean(),
});

export async function PUT(req: NextRequest) {
  const auth = await requirePermission('configuracion:gestionar');
  if (!auth.ok) return auth.response;

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalle: parsed.error.flatten() }, { status: 400 });
  }

  await upsertProviderConfig({ teamId: auth.teamId, ...parsed.data });
  return NextResponse.json({ ok: true });
}
