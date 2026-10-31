import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { whatsappConfig } from '@/lib/db/schema';
import { verificarFirma } from '@/lib/whatsapp/signature';
import { decryptField } from '@/lib/crypto/cert';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId: teamIdParam } = await params;
  const teamId = parseInt(teamIdParam, 10);
  if (!Number.isFinite(teamId)) {
    return NextResponse.json({ error: 'teamId inválido' }, { status: 400 });
  }

  const [config] = await db.select().from(whatsappConfig).where(eq(whatsappConfig.teamId, teamId)).limit(1);
  if (!config || !config.webhookSecretCiphered) {
    return NextResponse.json({ error: 'Team sin webhook configurado' }, { status: 404 });
  }

  const rawBody = await request.text();
  const secret = decryptField({
    ciphered: config.webhookSecretCiphered,
    iv: config.webhookSecretIv!,
    authTag: config.webhookSecretAuthTag!,
  });

  const firmaValida = verificarFirma(rawBody, secret, request.headers.get('x-crm-signature'));
  if (!firmaValida) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
  }

  // Las conversaciones son del colegio con sus familias: lo que escriben no se
  // guarda en Zero. De WhatsApp solo se usa si el aviso llegó y si lo leyeron.
  return NextResponse.json({ ok: true });
}
