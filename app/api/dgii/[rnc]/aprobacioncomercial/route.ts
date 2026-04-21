/**
 * POST /api/dgii/[rnc]/aprobacioncomercial
 *
 * Endpoint público donde la DGII nos reenvía ACECFs (Aprobación Comercial)
 * que otros contribuyentes han firmado sobre e-CFs que NOSOTROS les enviamos.
 *
 * Flujo:
 *   1) Parsea multipart/form-data → extrae XML del ACECF
 *   2) Extrae metadatos (eNCF referenciado, estado comercial, razón)
 *   3) Busca el e-CF original en nuestra BD (ecfDocuments emitidos)
 *   4) Actualiza estado comercial del documento
 *   5) Responde 200 (no requiere ARECF — es el ciclo final)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teams, ecfDocuments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { parsearPayloadMultipart } from '@/lib/dgii/receiver';
import { logInfo, logError } from '@/lib/logger';

export const runtime = 'nodejs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tagText(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m  = xml.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Mapa de estados comerciales según DGII Norma 1-20:
 *   1 = Aprobado
 *   2 = Aprobado con reparo (Condicional)
 *   3 = Rechazado
 */
function mapEstadoAcecf(codigo: string | null): 'APROBADO' | 'CONDICIONAL' | 'RECHAZADO' | 'PENDIENTE' {
  if (codigo === '1') return 'APROBADO';
  if (codigo === '2') return 'CONDICIONAL';
  if (codigo === '3') return 'RECHAZADO';
  return 'PENDIENTE';
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ rnc: string }> },
) {
  const { rnc: rncPath } = await params;
  const contentType = request.headers.get('content-type') ?? '';

  // ── 1) Localizar team emisor (nosotros, que emitimos el e-CF original) ──
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.rnc, rncPath))
    .limit(1);

  if (!team) {
    return NextResponse.json(
      { error: `No hay contribuyente registrado con RNC ${rncPath}` },
      { status: 404 },
    );
  }

  // ── 2) Parsear ACECF ────────────────────────────────────────────────────
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
      source: '/api/dgii/[rnc]/aprobacioncomercial [PARSE]',
      message: `Error parseando ACECF: ${err instanceof Error ? err.message : String(err)}`,
    });
    return NextResponse.json({ error: 'Error parseando el XML' }, { status: 400 });
  }

  // ── 3) Extraer metadatos del ACECF ──────────────────────────────────────
  // Tags estándar DGII:
  //   <RNCEmisor>       = quien emitió el e-CF original (nosotros)
  //   <RNCComprador>    = quien aprueba/rechaza (el cliente)
  //   <eNCF>            = identificador del e-CF original
  //   <Estado>          = 1|2|3 (aprobado|condicional|rechazado)
  //   <DetalleMotivoRechazo> = texto libre si rechazado
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

  // El RNCEmisor del ACECF debe coincidir con nuestro RNC (somos quien lo emitió)
  if (rncEmisor && rncEmisor.trim() !== team.rnc?.trim()) {
    await logError({
      teamId: team.id,
      source: '/api/dgii/[rnc]/aprobacioncomercial',
      message: `ACECF dirigido a RNC ${rncEmisor} pero llegó al endpoint de ${team.rnc}`,
      details: { encf, rncEmisor, rncComprador },
    });
    return NextResponse.json({ error: 'RNCEmisor del ACECF no coincide con el team' }, { status: 400 });
  }

  const estado = mapEstadoAcecf(estadoRaw);

  // ── 4) Buscar el e-CF original en BD ────────────────────────────────────
  const [doc] = await db
    .select()
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.teamId, team.id), eq(ecfDocuments.encf, encf)))
    .limit(1);

  if (!doc) {
    await logError({
      teamId: team.id,
      source: '/api/dgii/[rnc]/aprobacioncomercial',
      message: `ACECF recibido para eNCF desconocido: ${encf}`,
      details: { encf, rncComprador, estado },
    });
    // Aun así respondemos 200 — DGII ya cumplió con su job
    return NextResponse.json({ ok: true, warning: 'eNCF no encontrado en BD' });
  }

  // ── 5) Persistir el estado comercial ────────────────────────────────────
  await db
    .update(ecfDocuments)
    .set({
      // Campo existente: `comentario` se reutiliza; campo nuevo necesitaría schema
      // Para evitar migración adicional, almacenamos en `mensajesDgii` como JSON
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
    source: '/api/dgii/[rnc]/aprobacioncomercial',
    message: `ACECF recibido: ${encf} → ${estado}`,
    details: { encf, rncComprador, estado },
  });

  // Dispatch webhook (fire-and-forget)
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
