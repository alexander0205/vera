import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { outboundWebhooks } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { validateOutboundUrl } from '@/lib/security/ssrf';

// El secret HMAC solo se entrega completo una vez, en la respuesta del POST que
// lo crea. El listado expone únicamente sus últimos 4 caracteres (cortados en
// SQL, así el secret completo ni siquiera sale de la base).
export async function GET() {
  const auth = await requirePermission('configuracion:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const hooks = await db
    .select({
      id: outboundWebhooks.id,
      nombre: outboundWebhooks.nombre,
      url: outboundWebhooks.url,
      secretUltimos4: sql<string>`right(${outboundWebhooks.secret}, 4)`,
      eventos: outboundWebhooks.eventos,
      activo: outboundWebhooks.activo,
      ultimoDisparo: outboundWebhooks.ultimoDisparo,
      ultimoEstatus: outboundWebhooks.ultimoEstatus,
      createdAt: outboundWebhooks.createdAt,
      updatedAt: outboundWebhooks.updatedAt,
    })
    .from(outboundWebhooks)
    .where(eq(outboundWebhooks.teamId, teamId));
  return NextResponse.json(hooks);
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('configuracion:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { nombre, url, eventos } = await req.json();
  if (!nombre || !url) return NextResponse.json({ error: 'Nombre y URL requeridos' }, { status: 400 });

  const ssrfCheck = await validateOutboundUrl(url);
  if (!ssrfCheck.ok) {
    return NextResponse.json({ error: `URL no permitida: ${ssrfCheck.reason}` }, { status: 400 });
  }

  const secret = randomBytes(24).toString('hex');
  const [hook] = await db.insert(outboundWebhooks).values({
    teamId,
    nombre,
    url,
    secret,
    eventos: Array.isArray(eventos) ? eventos.join(',') : eventos ?? 'ecf.emitido',
  }).returning();

  // Única vez que se devuelve el secret completo: la UI lo muestra para copiar.
  return NextResponse.json({ ...hook, secretUltimos4: secret.slice(-4) }, { status: 201 });
}
