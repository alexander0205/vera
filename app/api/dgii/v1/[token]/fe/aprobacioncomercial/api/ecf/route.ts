/**
 * POST /api/dgii/v1/[token]/fe/aprobacioncomercial/api/ecf
 *
 * Endpoint público donde la DGII reenvía ACECFs (Aprobaciones Comerciales)
 * que otros contribuyentes firmaron sobre e-CFs que NOSOTROS les emitimos.
 *
 * El [token] es el UUID de enrutamiento del tenant — el mismo que va en la
 * "URL de aprobación comercial" que el cliente copia al portal DGII.
 *
 * Flujo:
 *   1) Resuelve el tenant por dgiiRoutingToken
 *   2) Parsea multipart/form-data → extrae XML del ACECF
 *   3) Extrae metadatos (eNCF, estado, RNCs)
 *   4) Busca el e-CF original en ecfDocuments
 *   5) Actualiza estado comercial
 *   6) Dispara webhook (fire-and-forget)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teams, ecfDocuments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { parsearPayloadMultipart } from '@/lib/dgii/receiver';
import { logInfo, logError } from '@/lib/logger';

export const runtime = 'nodejs';

function tagText(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m  = xml.match(re);
  return m ? m[1].trim() : null;
}

function mapEstadoAcecf(codigo: string | null): 'APROBADO' | 'CONDICIONAL' | 'RECHAZADO' | 'PENDIENTE' {
  if (codigo === '1') return 'APROBADO';
  if (codigo === '2') return 'CONDICIONAL';
  if (codigo === '3') return 'RECHAZADO';
  return 'PENDIENTE';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const contentType = request.headers.get('content-type') ?? '';

  // ── 1) Resolver tenant por routing token ────────────────────────────────
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.dgiiRoutingToken, token))
    .limit(1);

  if (!team) {
    return NextResponse.json(
      { error: `Token de enrutamiento inválido: ${token}` },
      { status: 404 },
    );
  }

  // ── 2) Parsear ACECF ─────────────────────────────────────────────────────
  let xmlACECF: string;
  try {
    if (contentType.includes('multipart/form-data')) {
      const raw = await request.text();
      const parsed = await parsearPayloadMultipart(raw, contentType);
      xmlACECF = parsed.xmlContent;
    } else if (contentType.includes('xml') || contentType.includes('text/plain')) {
      xmlACECF = await request.text();
    } else {
      return NextResponse.json(
        { error: `Content-Type no soportado: ${contentType}` },
        { status: 415 },
      );
    }
  } catch (err) {
    await logError({
      teamId: team.id,
      source: '/api/dgii/v1/[token]/fe/aprobacioncomercial/api/ecf [PARSE]',
      message: `Error parseando ACECF: ${err instanceof Error ? err.message : String(err)}`,
    });
    return NextResponse.json({ error: 'Error parseando el XML' }, { status: 400 });
  }

  // ── 3) Extraer metadatos ──────────────────────────────────────────────────
  const rncEmisor    = tagText(xmlACECF, 'RNCEmisor');
  const rncComprador = tagText(xmlACECF, 'RNCComprador');
  const encf         = tagText(xmlACECF, 'eNCF');
  const estadoRaw    = tagText(xmlACECF, 'Estado');

  if (!encf || !estadoRaw) {
    return NextResponse.json(
      { error: 'ACECF inválido — faltan tags eNCF o Estado' },
      { status: 400 },
    );
  }

  if (rncEmisor && rncEmisor.trim() !== team.rnc?.trim()) {
    await logError({
      teamId: team.id,
      source: '/api/dgii/v1/[token]/fe/aprobacioncomercial/api/ecf',
      message: `ACECF dirigido a RNC ${rncEmisor} pero llegó al endpoint de ${team.rnc}`,
      details: { encf, rncEmisor, rncComprador },
    });
    return NextResponse.json(
      { error: 'RNCEmisor del ACECF no coincide con el team' },
      { status: 400 },
    );
  }

  const estado = mapEstadoAcecf(estadoRaw);

  // ── 4) Buscar e-CF original ───────────────────────────────────────────────
  const [doc] = await db
    .select()
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.teamId, team.id), eq(ecfDocuments.encf, encf)))
    .limit(1);

  if (!doc) {
    await logError({
      teamId: team.id,
      source: '/api/dgii/v1/[token]/fe/aprobacioncomercial/api/ecf',
      message: `ACECF para eNCF desconocido: ${encf}`,
      details: { encf, rncComprador, estado },
    });
    return NextResponse.json({ ok: true, warning: 'eNCF no encontrado en BD' });
  }

  // ── 5) Actualizar estado comercial ────────────────────────────────────────
  await db
    .update(ecfDocuments)
    .set({
      mensajesDgii: JSON.stringify({
        acecf: {
          estadoComercial: estado,
          rncComprador,
          recibidoEn: new Date().toISOString(),
          xml: xmlACECF,
        },
      }),
      updatedAt: new Date(),
    })
    .where(eq(ecfDocuments.id, doc.id));

  await logInfo({
    teamId: team.id,
    source: '/api/dgii/v1/[token]/fe/aprobacioncomercial/api/ecf',
    message: `ACECF recibido: ${encf} → ${estado}`,
    details: { encf, rncComprador, estado },
  });

  // ── 6) Webhook fire-and-forget ────────────────────────────────────────────
  import('@/lib/webhooks').then(({ dispatchWebhook }) =>
    dispatchWebhook(team.id, 'ecf.aprobacion-comercial', {
      encf,
      rncComprador,
      estadoComercial: estado,
      documentoId: doc.id,
    }),
  ).catch(() => {});

  return NextResponse.json({ ok: true, encf, estadoComercial: estado });
}
