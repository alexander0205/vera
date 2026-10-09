import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { nominaContratos, teams } from '@/lib/db/schema';
import { formatoTokenValido, hashTokenFirma, selloFirma, firmaValida } from '@/lib/nomina/firma';

export const dynamic = 'force-dynamic';

/**
 * Endpoint PÚBLICO de firma. Sin sesión: el token de la URL es toda la
 * autorización. Devuelve/acepta la firma de UN contrato, ubicado por el
 * SHA-256 del token. Un token inválido o inexistente responde 404 sin pistas.
 */

async function contratoPorToken(token: string) {
  const [row] = await db
    .select({ contrato: nominaContratos, empresa: teams.razonSocial, empresaName: teams.name })
    .from(nominaContratos)
    .innerJoin(teams, eq(teams.id, nominaContratos.teamId))
    .where(eq(nominaContratos.tokenHash, hashTokenFirma(token)))
    .limit(1);
  return row ?? null;
}

/** GET — datos del contrato para mostrar y firmar (o el estado si ya se firmó). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!formatoTokenValido(token)) return NextResponse.json({ error: 'Enlace inválido' }, { status: 404 });

  const row = await contratoPorToken(token);
  if (!row) return NextResponse.json({ error: 'Enlace inválido o vencido' }, { status: 404 });

  const c = row.contrato;
  return NextResponse.json({
    titulo: c.titulo,
    cuerpo: c.cuerpo,
    empresa: row.empresa ?? row.empresaName,
    estado: c.estado,
    firmanteNombre: c.firmanteNombre,
    firmadoEn: c.firmadoEn,
  });
}

/** POST — registra la firma. Body: { firmanteNombre, firma (PNG data URL) }. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!formatoTokenValido(token)) return NextResponse.json({ error: 'Enlace inválido' }, { status: 404 });

  const row = await contratoPorToken(token);
  if (!row) return NextResponse.json({ error: 'Enlace inválido o vencido' }, { status: 404 });

  const c = row.contrato;
  if (c.estado === 'firmado') return NextResponse.json({ error: 'Este contrato ya fue firmado' }, { status: 409 });
  if (c.estado !== 'enviado') return NextResponse.json({ error: 'Este contrato no está habilitado para firma' }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const firmanteNombre = String(body.firmanteNombre ?? '').trim();
  const firma = body.firma;
  if (firmanteNombre.length < 3) return NextResponse.json({ error: 'Escribe tu nombre completo' }, { status: 400 });
  if (!firmaValida(firma)) return NextResponse.json({ error: 'Falta la firma' }, { status: 400 });
  // Un contrato subido (firmado offline) no tiene cuerpo ni se firma en línea;
  // tampoco tiene token, así que esto no debería alcanzarse. Guarda por si acaso.
  if (c.cuerpo == null) return NextResponse.json({ error: 'Este contrato no se firma en línea' }, { status: 400 });

  const firmadoEn = new Date();
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;

  await db
    .update(nominaContratos)
    .set({
      estado: 'firmado',
      firmadoEn,
      firmanteNombre: firmanteNombre.slice(0, 200),
      firmaRef: firma,
      firmaHash: selloFirma(c.cuerpo, firmanteNombre, firmadoEn.toISOString()),
      firmaIp: ip,
    })
    .where(eq(nominaContratos.id, c.id));

  return NextResponse.json({ ok: true });
}
