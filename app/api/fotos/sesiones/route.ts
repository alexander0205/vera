import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { fotosSesiones } from '@/lib/db/schema';
import { autorizarEntidad } from '@/lib/fotos/guard';
import { generarToken, hashToken, fechaExpiracion, MINUTOS_VIGENCIA } from '@/lib/fotos/sesiones';
import { origenPublico } from '@/lib/http/origen-publico';
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

