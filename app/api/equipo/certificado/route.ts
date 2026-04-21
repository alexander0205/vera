import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { getUser, getTeamIdForUser, getTeamProfile } from '@/lib/db/queries';
import { eq } from 'drizzle-orm';
import { P12Reader } from 'dgii-ecf';
import { encryptField, decryptField, isEncrypted } from '@/lib/crypto/cert';
import { logAudit, getIp } from '@/lib/audit';
import { rateLimitDb } from '@/lib/rate-limit';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCN(subject: string): string {
  const parts = subject.split(',');
  const cn    = parts.find(p => p.trim().startsWith('CN='));
  return cn ? cn.replace('CN=', '').trim() : subject;
}

function extractCertInfo(certP12: string, certPassword: string) {
  const reader = new P12Reader(certPassword);
  const info   = reader.getCertificateInfoFromBase64(certP12);
  return {
    titular:     parseCN(info.subject),
    subject:     info.subject,
    serial:      info.serialNumber,
    vencimiento: info.validTo instanceof Date
      ? info.validTo.toISOString()
      : String(info.validTo),
  };
}

// ─── GET — devuelve info del certificado actual ───────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

    const team = await getTeamProfile(teamId);
    const hasCiphered = isEncrypted(team?.certP12Ciphered, team?.certP12Iv, team?.certP12AuthTag);

    if (!hasCiphered) {
      return NextResponse.json({ tieneCertificado: false });
    }

    logAudit({
      teamId,
      userId: user.id,
      actor:  user.email,
      action: 'CERT_VIEW',
      ip:     getIp(request),
    });

    // Si ya tenemos los metadatos denormalizados, los devolvemos sin descifrar
    if (team?.certTitular) {
      return NextResponse.json({
        tieneCertificado: true,
        titular:          team.certTitular,
        serial:           team.certSerial ?? undefined,
        vencimiento:      team.certVencimiento?.toISOString() ?? undefined,
        cifrado:          true,
      });
    }

    // Fallback: descifrar para extraer metadatos (cert recién subido sin metadatos)
    try {
      const plainP12 = decryptField({
        ciphered: team!.certP12Ciphered!,
        iv:       team!.certP12Iv!,
        authTag:  team!.certP12AuthTag!,
      });
      const plainPin = decryptField({
        ciphered: team!.certPinCiphered!,
        iv:       team!.certPinIv!,
        authTag:  team!.certPinAuthTag!,
      });
      const certData = extractCertInfo(plainP12, plainPin);
      return NextResponse.json({
        tieneCertificado: true,
        cifrado:          true,
        ...certData,
      });
    } catch {
      return NextResponse.json({ tieneCertificado: true, errorLectura: true });
    }
  } catch (err) {
    console.error('[GET /api/equipo/certificado]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// ─── POST — sube y guarda un nuevo certificado ────────────────────────────────

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

    // Rate limit: máximo 10 intentos por hora por equipo
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

    // Validar que el P12 se puede leer con la contraseña dada
    let certData: ReturnType<typeof extractCertInfo>;
    try {
      const reader = new P12Reader(certPassword);
      const certs  = reader.getKeyFromStringBase64(certP12);
      if (!certs.key || !certs.cert) {
        return NextResponse.json(
          { error: 'El certificado no contiene clave privada o certificado público. Verifica el archivo y la contraseña.' },
          { status: 422 },
        );
      }
      certData = extractCertInfo(certP12, certPassword);
    } catch {
      return NextResponse.json(
        { error: 'No se pudo leer el certificado. Verifica que el archivo y la contraseña sean correctos.' },
        { status: 422 },
      );
    }

    // Cifrar con AES-256-GCM antes de persistir
    const p12Enc = encryptField(certP12);
    const pinEnc = encryptField(certPassword);

    await db
      .update(teams)
      .set({
        certP12Ciphered:  p12Enc.ciphered,
        certP12Iv:        p12Enc.iv,
        certP12AuthTag:   p12Enc.authTag,
        certPinCiphered:  pinEnc.ciphered,
        certPinIv:        pinEnc.iv,
        certPinAuthTag:   pinEnc.authTag,
        // Metadatos públicos sin cifrar (para mostrar en UI sin descifrar)
        certTitular:     certData.titular,
        certSerial:      certData.serial,
        certVencimiento: certData.vencimiento ? new Date(certData.vencimiento) : null,
        updatedAt:       new Date(),
      })
      .where(eq(teams.id, teamId));

    logAudit({
      teamId,
      userId:   user.id,
      actor:    user.email,
      action:   'CERT_UPLOAD',
      resource: certData.serial,
      ip:       getIp(request),
      meta: {
        titular:     certData.titular,
        vencimiento: certData.vencimiento,
        serial:      certData.serial,
      },
    });

    return NextResponse.json({
      ok:               true,
      tieneCertificado: true,
      cifrado:          true,
      titular:          certData.titular,
      serial:           certData.serial,
      vencimiento:      certData.vencimiento,
    });
  } catch (err) {
    console.error('[POST /api/equipo/certificado]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// ─── DELETE — elimina el certificado almacenado ───────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

    await db
      .update(teams)
      .set({
        certP12Ciphered: null,
        certP12Iv:       null,
        certP12AuthTag:  null,
        certPinCiphered: null,
        certPinIv:       null,
        certPinAuthTag:  null,
        certTitular:     null,
        certSerial:      null,
        certVencimiento: null,
        updatedAt:       new Date(),
      })
      .where(eq(teams.id, teamId));

    logAudit({
      teamId,
      userId: user.id,
      actor:  user.email,
      action: 'CERT_DELETE',
      ip:     getIp(request),
    });

    return NextResponse.json({ ok: true, tieneCertificado: false });
  } catch (err) {
    console.error('[DELETE /api/equipo/certificado]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
