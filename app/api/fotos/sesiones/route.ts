import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { fotosSesiones } from '@/lib/db/schema';
import { autorizarEntidad } from '@/lib/fotos/guard';
import { generarToken, hashToken, fechaExpiracion, MINUTOS_VIGENCIA } from '@/lib/fotos/sesiones';
import QRCode from 'qrcode';

/**
 * Abre una sesión de captura: devuelve el QR que el encargado escanea con su
 * teléfono. El token va dentro del QR y es lo único que autoriza al móvil, que
 * no tiene sesión de usuario.
 *
 * POST /api/fotos/sesiones  { entidad, entidadId }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = await autorizarEntidad(
    typeof body.entidad === 'string' ? body.entidad : null,
    body.entidadId != null ? String(body.entidadId) : null,
    'gestionar',
  );
  if (!auth.ok) return auth.response;

  const token = generarToken();
  const expiraEn = fechaExpiracion();

  await db.insert(fotosSesiones).values({
    teamId: auth.teamId,
    entidad: auth.entidad,
    entidadId: auth.entidadId,
    tokenHash: hashToken(token),
    expiraEn,
    creadaPor: auth.usuarioId,
  });

  const url = `${origenPublico(req)}/foto/${token}`;
  // PNG en data-URL: el diálogo lo pinta con un <img> y no hace falta meter una
  // librería de QR en el paquete del navegador.
  const qr = await QRCode.toDataURL(url, { width: 320, margin: 1 });

  return NextResponse.json({
    token,
    url,
    qr,
    expiraEn: expiraEn.toISOString(),
    minutos: MINUTOS_VIGENCIA,
    nombre: auth.nombre,
  });
}

/**
 * Origen por el que el usuario está entrando AHORA, no el del env.
 *
 * El teléfono tiene que llegar al mismo sitio que el escritorio: si tomamos
 * NEXT_PUBLIC_APP_URL acabamos apuntando al dominio de Vercel, que redirige al
 * dominio real — y una redirección en medio de una cámara en el móvil es un
 * fallo silencioso más. El env queda solo de red de seguridad.
 */
function origenPublico(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!host) return process.env.NEXT_PUBLIC_APP_URL ?? '';
  const proto = req.headers.get('x-forwarded-proto')
    ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${proto}://${host}`;
}
