/**
 * POST /api/dgii/v1/[token]/fe/recepcion/api/ecf
 *
 * Endpoint público donde la DGII entrega e-CFs emitidos POR OTROS contribuyentes
 * hacia el tenant identificado por su `dgiiRoutingToken`.
 *
 * El [token] es un UUID por-tenant — es lo que el cliente copia al portal DGII
 * como "URL de recepción" (sin el sufijo, que DGII agrega automáticamente).
 *
 * Flujo:
 *   1) Resuelve el tenant por dgiiRoutingToken
 *   2) Parsea el multipart/form-data → extrae el XML del e-CF
 *   3) Valida y genera el ARECF firmado con el cert del tenant
 *   4) Detecta duplicados (código 3)
 *   5) Persiste en ecfDocumentsRecibidos
 *   6) Devuelve el ARECF firmado (application/xml)
 *
 * NO requiere sesión — la DGII llega vía HTTPS público.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teams, ecfDocumentsRecibidos } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  parsearPayloadMultipart,
  crearSignerDesdeTeam,
  validarYGenerarARECF,
  generarYFirmarARECF,
} from '@/lib/dgii/receiver';
import { logInfo, logError } from '@/lib/logger';

export const runtime = 'nodejs';

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

  // ── 2) Parsear el cuerpo ────────────────────────────────────────────────
  let xmlRecibido: string;
  let filename = 'ecf.xml';
  try {
    if (contentType.includes('multipart/form-data')) {
      const raw = await request.text();
      const parsed = await parsearPayloadMultipart(raw, contentType);
      xmlRecibido = parsed.xmlContent;
      filename = parsed.filename || filename;
    } else if (contentType.includes('xml') || contentType.includes('text/plain')) {
      xmlRecibido = await request.text();
    } else {
      return NextResponse.json(
        { error: `Content-Type no soportado: ${contentType}` },
        { status: 415 },
      );
    }
  } catch (err) {
    await logError({
      teamId: team.id,
      source: '/api/dgii/v1/[token]/fe/recepcion/api/ecf [PARSE]',
      message: `Error parseando payload: ${err instanceof Error ? err.message : String(err)}`,
      details: { token, contentType },
    });
    return NextResponse.json({ error: 'Error parseando el XML entrante' }, { status: 400 });
  }

  // ── 3) Preparar signer del tenant ────────────────────────────────────────
  let signer;
  try {
    signer = crearSignerDesdeTeam(team);
  } catch (err) {
    await logError({
      teamId: team.id,
      source: '/api/dgii/v1/[token]/fe/recepcion/api/ecf [SIGNER]',
      message: `No se pudo cargar el cert del team ${team.id}: ${err instanceof Error ? err.message : String(err)}`,
    });
    return NextResponse.json(
      { error: 'Receptor sin certificado configurado' },
      { status: 500 },
    );
  }

  // ── 4) Validar + generar ARECF firmado ───────────────────────────────────
  const resultado = validarYGenerarARECF(signer, xmlRecibido, team.rnc!);

  // ── 5) Detectar duplicado (código 3) ─────────────────────────────────────
  if (resultado.aceptado && resultado.meta) {
    const [existente] = await db
      .select({ id: ecfDocumentsRecibidos.id })
      .from(ecfDocumentsRecibidos)
      .where(and(
        eq(ecfDocumentsRecibidos.teamId,    team.id),
        eq(ecfDocumentsRecibidos.rncEmisor, resultado.meta.rncEmisor),
        eq(ecfDocumentsRecibidos.encf,      resultado.meta.encf),
      ))
      .limit(1);

    if (existente) {
      const arecfDup = generarYFirmarARECF(signer, xmlRecibido, team.rnc!, false, '3');
      await logInfo({
        teamId: team.id,
        source: '/api/dgii/v1/[token]/fe/recepcion/api/ecf',
        message: `e-CF duplicado: ${resultado.meta.rncEmisor}/${resultado.meta.encf}`,
      });
      return new NextResponse(arecfDup, {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      });
    }
  }

  // ── 6) Persistir ──────────────────────────────────────────────────────────
  if (resultado.meta) {
    try {
      await db.insert(ecfDocumentsRecibidos).values({
        teamId:            team.id,
        encf:              resultado.meta.encf,
        tipoEcf:           resultado.meta.tipoEcf,
        rncEmisor:         resultado.meta.rncEmisor,
        razonSocialEmisor: resultado.meta.razonSocialEmisor,
        rncReceptor:       team.rnc!,
        montoTotal:        resultado.meta.montoTotal,
        totalItbis:        resultado.meta.totalItbis,
        xmlRecibido,
        arecfFirmado:      resultado.arecfFirmado,
        estadoAcuse:       resultado.aceptado ? 'RECIBIDO' : 'NO_RECIBIDO',
        codigoRechazo:     resultado.codigoRechazo ?? null,
        estadoComercial:   'PENDIENTE',
      });
    } catch (err) {
      await logError({
        teamId: team.id,
        source: '/api/dgii/v1/[token]/fe/recepcion/api/ecf [DB]',
        message: `Error guardando e-CF: ${err instanceof Error ? err.message : String(err)}`,
        details: { encf: resultado.meta.encf, rncEmisor: resultado.meta.rncEmisor },
      });
      // Devolvemos ARECF de todas formas — DGII no debe reintentar por error DB
    }
  }

  await logInfo({
    teamId:  team.id,
    source:  '/api/dgii/v1/[token]/fe/recepcion/api/ecf',
    message: resultado.aceptado
      ? `e-CF recibido: ${resultado.meta?.rncEmisor}/${resultado.meta?.encf}`
      : `e-CF rechazado (cód ${resultado.codigoRechazo}): ${resultado.motivoRechazo}`,
    details: { filename, tipoEcf: resultado.meta?.tipoEcf },
  });

  // ── 7) Responder con ARECF firmado ────────────────────────────────────────
  return new NextResponse(resultado.arecfFirmado, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
