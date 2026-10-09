import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { fotosSesiones } from '@/lib/db/schema';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { formatoTokenValido, hashToken, estadoSesion } from '@/lib/fotos/sesiones';
import { ENTIDADES_FOTO, esEntidadValida, type EntidadFoto } from '@/lib/fotos/entidades';
import { guardarFotoEntidad, leerImagenDePeticion } from '@/lib/fotos/queries';
import { validarImagen, MAX_BYTES_SUBIDA } from '@/lib/fotos/storage';

/**
 * Endpoints que usa el TELÉFONO. No hay sesión de usuario: el token del QR es
 * toda la autorización, y por eso aquí se es especialmente desconfiado.
 *
 *   GET  /api/fotos/captura/<token>  → a quién se le va a tomar la foto
 *   POST /api/fotos/captura/<token>  → sube la foto y quema el token
 *
 * Códigos: 401 token ausente/desconocido, 410 caducado o ya usado.
 */

interface SesionResuelta {
  sesion: typeof fotosSesiones.$inferSelect;
  entidad: EntidadFoto;
}

async function resolverSesion(
  token: string,
): Promise<SesionResuelta | NextResponse> {
  if (!formatoTokenValido(token)) {
    return NextResponse.json({ error: 'Enlace no válido' }, { status: 401 });
  }
  const [sesion] = await db.select().from(fotosSesiones)
    .where(eq(fotosSesiones.tokenHash, hashToken(token)))
    .limit(1);
  // Token desconocido y token mal formado dan lo mismo: no se distingue desde
  // fuera si el token existió alguna vez.
  if (!sesion || !esEntidadValida(sesion.entidad)) {
    return NextResponse.json({ error: 'Enlace no válido' }, { status: 401 });
  }

  const estado = estadoSesion(sesion);
  if (estado !== 'valida') {
    return NextResponse.json(
      { error: estado === 'usada' ? 'Este enlace ya se usó' : 'El enlace caducó', estado },
      { status: 410 },
    );
  }
  return { sesion, entidad: sesion.entidad };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await resolverSesion(token);
  if (res instanceof NextResponse) return res;

  const def = ENTIDADES_FOTO[res.entidad];
  const nombre = await def.cargar(res.sesion.teamId, res.sesion.entidadId);
  if (nombre === null) return NextResponse.json({ error: 'Enlace no válido' }, { status: 401 });

  // Solo lo justo para que el encargado confirme que apunta a la persona
  // correcta. Nada de fecha de nacimiento, tutores ni deuda: esto se sirve sin
  // sesión y con un token que puede haber visto cualquiera que pasara al lado.
  return NextResponse.json({
    tipo: def.tipo,
    nombre,
    expiraEn: res.sesion.expiraEn.toISOString(),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await resolverSesion(token);
  if (res instanceof NextResponse) return res;
  const { sesion, entidad } = res;

  const binario = await leerImagenDePeticion(req);
  if (!binario || binario.length === 0) {
    return NextResponse.json({ error: 'No se recibió ninguna imagen' }, { status: 400 });
  }
  if (binario.length > MAX_BYTES_SUBIDA) {
    return NextResponse.json({ error: 'La imagen pesa demasiado' }, { status: 413 });
  }
  // Se valida ANTES de quemar el token: si el navegador del móvil mandó basura,
  // el encargado puede repetir la foto con el mismo QR en lugar de tener que
  // volver al ordenador a pedir otro.
  if (!(await validarImagen(binario))) {
    return NextResponse.json({ error: 'El archivo no es una imagen' }, { status: 415 });
  }

  // Quemar el token es lo primero que se hace ya con la imagen buena en mano, y
  // en un solo UPDATE condicional: dos POST simultáneos con el mismo token no
  // pueden guardar dos fotos, el segundo no encuentra fila que actualizar.
  const [tomada] = await db.update(fotosSesiones)
    .set({ usadaEn: new Date() })
    .where(and(
      eq(fotosSesiones.id, sesion.id),
      isNull(fotosSesiones.usadaEn),
      gt(fotosSesiones.expiraEn, sql`now()`),
    ))
    .returning({ id: fotosSesiones.id });
  if (!tomada) {
    return NextResponse.json({ error: 'Este enlace ya se usó', estado: 'usada' }, { status: 410 });
  }

  const guardado = await guardarFotoEntidad({
    teamId: sesion.teamId,
    entidad,
    entidadId: sesion.entidadId,
    binario,
    origen: 'movil',
    usuarioId: sesion.creadaPor,
  });
  if (!guardado.ok) {
    return NextResponse.json({ error: 'No se pudo guardar la foto' }, { status: 500 });
  }

  await db.update(fotosSesiones)
    .set({ fotoId: guardado.fotoId })
    .where(eq(fotosSesiones.id, sesion.id));

  // El teléfono no recibe la URL de la foto: ya cumplió, y esa URL firmada no
  // tiene por qué quedarse en un móvil prestado. El escritorio la pide con su
  // propia sesión.
  return NextResponse.json({ ok: true });
}
