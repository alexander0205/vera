/**
 * GET/POST/DELETE /api/equipo/certificado
 *
 * Proxea las operaciones de certificado a ecf-api.
 * emitedo ya no almacena el P12 local — ecf-api gestiona certs y firma.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { logAudit, getIp } from '@/lib/audit';
import { rateLimitDb } from '@/lib/rate-limit';
import { certificados, EcfApiError } from '@/lib/ecf-api/client';
import { ensureContribuyente, ContribuyenteCamposFaltantesError } from '@/lib/ecf-api/contribuyente';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extrae el Common Name (CN) del subject del certificado.
 * ecf-api puede devolver subject como string "CN=xxx, O=yyy, C=DO"
 * o como objeto { CN, O, C, ... }.
 */
function parseCN(subject: Record<string, string> | string | null): string {
  if (!subject) return '';
  // Objeto: { CN: "NOMBRE", O: "EMPRESA SRL", C: "DO" }
  if (typeof subject === 'object') return subject['CN'] ?? subject['O'] ?? '';
  // String: "C=DO, ..., CN=NOMBRE, ..."
  const cn = subject.split(',').find(p => p.trim().startsWith('CN='));
  return cn ? cn.replace(/^.*CN=/, '').trim() : subject;
}

// ─── GET — info del certificado activo ───────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

    let codigoPublico: string;
    try {
      codigoPublico = await ensureContribuyente(teamId);
    } catch (err) {
      if (err instanceof ContribuyenteCamposFaltantesError) {
        return NextResponse.json({ tieneCertificado: false, camposFaltantes: err.faltantes });
      }
      console.error('[GET /api/equipo/certificado] ensureContribuyente', err);
      return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }

    let certs;
    try {
      certs = await certificados.list(codigoPublico);
    } catch (err) {
      console.error('[GET /api/equipo/certificado] certificados.list', err);
      return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }

    const activo = certs.find(c => c.activo && !c.revocadoEn);
    if (!activo) {
      return NextResponse.json({ tieneCertificado: false });
    }

    logAudit({ teamId, userId: user.id, actor: user.email, action: 'CERT_VIEW', ip: getIp(request) });

    return NextResponse.json({
      tieneCertificado: true,
      titular:          parseCN(activo.subject),
      serial:           activo.id,
      vencimiento:      activo.validTo,
      cifrado:          true,
    });
  } catch (err) {
    console.error('[GET /api/equipo/certificado]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// ─── POST — sube un nuevo certificado a ecf-api ───────────────────────────────

const schema = z.object({
  certP12:      z.string().min(1), // base64 del archivo P12/PFX
  certPassword: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

    const rl = await rateLimitDb(`cert_upload:${teamId}`, 10, 60 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Espera un momento antes de volver a intentarlo.' },
        { status: 429 },
      );
    }

    const body   = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const { certP12, certPassword } = parsed.data;

    let codigoPublico: string;
    try {
      codigoPublico = await ensureContribuyente(teamId);
    } catch (err) {
      if (err instanceof ContribuyenteCamposFaltantesError) {
        return NextResponse.json(
          { error: `Completa los siguientes campos antes de subir el certificado: ${err.faltantes.map(f => f.label).join(', ')}` },
          { status: 422 },
        );
      }
      console.error('[POST /api/equipo/certificado] ensureContribuyente', err);
      return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }

    // Decodificar base64 → Buffer para multipart upload
    const p12Buffer = Buffer.from(certP12, 'base64');

    let cert;
    try {
      cert = await certificados.upload(codigoPublico, p12Buffer, certPassword);
    } catch (err) {
      if (err instanceof EcfApiError) {
        const esErrorNegocio = err.status >= 400 && err.status < 500;
        if (esErrorNegocio) {
          let mensaje = 'No se pudo subir el certificado. Verifica el archivo y la contraseña.';
          try {
            const parsed = JSON.parse(err.message);
            mensaje = Array.isArray(parsed.message) ? parsed.message.join('. ') : (parsed.message ?? mensaje);
          } catch { mensaje = err.message || mensaje; }
          return NextResponse.json({ error: mensaje }, { status: 422 });
        }
      }
      console.error('[POST /api/equipo/certificado] certificados.upload', err);
      return NextResponse.json({ error: 'Error interno al subir el certificado' }, { status: 500 });
    }

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action:   'CERT_UPLOAD',
      resource: cert.id,
      ip:       getIp(request),
      meta:     { subject: cert.subject, validTo: cert.validTo },
    });

    return NextResponse.json({
      ok:               true,
      tieneCertificado: true,
      cifrado:          true,
      titular:          parseCN(cert.subject),
      serial:           cert.id,
      vencimiento:      cert.validTo,
    });
  } catch (err) {
    console.error('[POST /api/equipo/certificado]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// ─── DELETE — revoca el certificado activo en ecf-api ────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

    let codigoPublico: string;
    try {
      codigoPublico = await ensureContribuyente(teamId);
    } catch (err) {
      if (err instanceof ContribuyenteCamposFaltantesError) {
        return NextResponse.json({ error: 'Perfil incompleto' }, { status: 422 });
      }
      console.error('[DELETE /api/equipo/certificado] ensureContribuyente', err);
      return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }

    let certs;
    try {
      certs = await certificados.list(codigoPublico);
    } catch (err) {
      console.error('[DELETE /api/equipo/certificado] certificados.list', err);
      return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }

    const activo = certs.find(c => c.activo && !c.revocadoEn);
    if (!activo) {
      return NextResponse.json({ ok: true, tieneCertificado: false });
    }

    try {
      await certificados.revoke(activo.id);
    } catch (err) {
      console.error('[DELETE /api/equipo/certificado] certificados.revoke', err);
      return NextResponse.json({ error: 'Error al revocar el certificado' }, { status: 500 });
    }

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action:   'CERT_DELETE',
      resource: activo.id,
      ip:       getIp(request),
    });

    return NextResponse.json({ ok: true, tieneCertificado: false });
  } catch (err) {
    console.error('[DELETE /api/equipo/certificado]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
