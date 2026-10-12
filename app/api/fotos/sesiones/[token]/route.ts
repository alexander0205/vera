import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { fotosSesiones } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { formatoTokenValido, hashToken, estadoSesion, segundosRestantes } from '@/lib/fotos/sesiones';
import { obtenerFoto } from '@/lib/fotos/queries';
import { ENTIDADES_FOTO, esEntidadValida } from '@/lib/fotos/entidades';

/**
 * Estado de una sesión de captura. Es lo que consulta el escritorio cada par de
 * segundos mientras el diálogo del QR está abierto: sin WebSockets, la ventana
 * de espera dura minutos y el sondeo se para al cerrar el diálogo.
 *
 * Pide sesión de usuario, el permiso de ver la entidad Y que la sesión sea de
 * su misma empresa: el token no vale como credencial aquí. Si valiera por sí
 * solo, cualquiera que fotografiara el QR podría espiar la foto que sube otro.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!formatoTokenValido(token)) {
    return NextResponse.json({ error: 'Token no válido' }, { status: 400 });
  }

  const [sesion] = await db.select().from(fotosSesiones)
    .where(eq(fotosSesiones.tokenHash, hashToken(token)))
    .limit(1);
  if (!sesion || !esEntidadValida(sesion.entidad)) {
    return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });
  }

  const def = ENTIDADES_FOTO[sesion.entidad];
  const auth = await requireModuleAndPermission(def.modulo, def.permisoVer);
  if (!auth.ok) return auth.response;
  // Sesión de otra empresa = sesión inexistente. No confirmamos ni que existe.
  if (sesion.teamId !== auth.teamId) {
    return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });
  }

  const estado = estadoSesion(sesion);
  const foto = estado === 'usada'
    ? await obtenerFoto(sesion.teamId, sesion.entidad, sesion.entidadId)
    : null;

  return NextResponse.json({ estado, segundos: segundosRestantes(sesion), foto });
}
