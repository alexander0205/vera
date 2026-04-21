/**
 * POST /api/dgii/[rnc]/recepcion
 *
 * Endpoint público que la DGII invoca cuando un contribuyente nos envía un e-CF.
 * Flujo:
 *   1) Parsea el multipart entrante → extrae el XML del e-CF
 *   2) Identifica el team receptor por el RNC del path
 *   3) Valida (tipo, RNC comprador, parseo)
 *   4) Genera y firma el ARECF de respuesta
 *   5) Guarda en BD: XML recibido + ARECF + metadatos
 *   6) Responde con el ARECF firmado (content-type application/xml)
 *
 * NO requiere autenticación de sesión — la DGII llega vía HTTPS público.
 * La seguridad está en la firma digital del e-CF entrante (validada por DGII antes).
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

// Aceptar hasta 2 MB de body (un e-CF firmado promedia ~50-100 KB)
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ rnc: string }> },
) {
  const { rnc: rncPath } = await params;
  const contentType = request.headers.get('content-type') ?? '';

  // ── 1) Localizar el team receptor ───────────────────────────────────────
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

  // ── 2) Parsear el cuerpo ────────────────────────────────────────────────
  let xmlRecibido: string;
  let filename = 'ecf.xml';
  try {
    if (contentType.includes('multipart/form-data')) {
      // DGII envía como multipart (estándar).
      const raw = await request.text();
      const parsed = await parsearPayloadMultipart(raw, contentType);
      xmlRecibido = parsed.xmlContent;
      filename = parsed.filename || filename;
    } else if (contentType.includes('xml') || contentType.includes('text/plain')) {
      // Fallback: body es directamente el XML
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
      source: '/api/dgii/[rnc]/recepcion [PARSE]',
      message: `Error parseando payload entrante: ${err instanceof Error ? err.message : String(err)}`,
      details: { rncPath, contentType },
    });
    return NextResponse.json(
      { error: 'Error parseando el XML entrante' },
      { status: 400 },
    );
  }

  // ── 3) Preparar signer del team (para firmar ARECF) ─────────────────────
  let signer;
  try {
    signer = crearSignerDesdeTeam(team);
  } catch (err) {
    await logError({
      teamId: team.id,
      source: '/api/dgii/[rnc]/recepcion [SIGNER]',
      message: `No se pudo cargar el cert del team ${team.id}: ${err instanceof Error ? err.message : String(err)}`,
    });
    // Respondemos código 2 (Error firma) ya que nosotros no podemos firmar.
    // Pero ni siquiera podemos firmar el ARECF para devolverlo → 500.
    return NextResponse.json(
      { error: 'Receptor sin certificado configurado — no puede firmar acuses' },
      { status: 500 },
    );
  }

  // ── 4) Validar + generar ARECF firmado ──────────────────────────────────
  const resultado = validarYGenerarARECF(signer, xmlRecibido, team.rnc!);

  // ── 5) Detectar duplicado (código 3) ────────────────────────────────────
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
      // Duplicado → re-generar ARECF con código 3
      const arecfDup = generarYFirmarARECF(signer, xmlRecibido, team.rnc!, false, '3');
      await logInfo({
        teamId: team.id,
        source: '/api/dgii/[rnc]/recepcion',
        message: `e-CF duplicado: ${resultado.meta.rncEmisor}/${resultado.meta.encf}`,
      });
      return new NextResponse(arecfDup, {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      });
    }
  }

  // ── 6) Persistir ─────────────────────────────────────────────────────────
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
        source: '/api/dgii/[rnc]/recepcion [DB]',
        message: `Error guardando e-CF recibido: ${err instanceof Error ? err.message : String(err)}`,
        details: { encf: resultado.meta.encf, rncEmisor: resultado.meta.rncEmisor },
      });
      // Aun así devolvemos el ARECF — no queremos que DGII reintente por error DB
    }
  }

  await logInfo({
    teamId:  team.id,
    source:  '/api/dgii/[rnc]/recepcion',
    message: resultado.aceptado
      ? `e-CF recibido: ${resultado.meta?.rncEmisor}/${resultado.meta?.encf}`
      : `e-CF rechazado (cód ${resultado.codigoRechazo}): ${resultado.motivoRechazo}`,
    details: { filename, tipoEcf: resultado.meta?.tipoEcf },
  });

  // ── 7) Devolver ARECF firmado ───────────────────────────────────────────
  return new NextResponse(resultado.arecfFirmado, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
