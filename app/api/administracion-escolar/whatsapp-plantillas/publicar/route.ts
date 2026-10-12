/**
 * POST /api/administracion-escolar/whatsapp-plantillas/publicar   { id }
 *
 * Manda un borrador a Meta para aprobación. Es el paso que no se deshace: el
 * nombre queda ocupado y en revisión no se puede editar. Las pegas que Meta
 * rechazaría se validan antes (plantillas-servicio.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { publicarBorrador } from '@/lib/whatsapp/plantillas-servicio';

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar', { escritura: true });
  if (!auth.ok) return auth.response;

  const b = await req.json().catch(() => null);
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  const r = await publicarBorrador(auth.teamId, id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, estado: r.estado });
}
