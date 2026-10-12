import { NextRequest, NextResponse } from 'next/server';
import { autorizarEntidad } from '@/lib/fotos/guard';
import {
  obtenerFoto, guardarFotoEntidad, eliminarFotoEntidad, leerImagenDePeticion,
} from '@/lib/fotos/queries';

/**
 * Foto vigente de una entidad. Genérico a propósito: la misma ruta sirve al
 * estudiante, al personal, al producto y al logo (ver lib/fotos/entidades.ts).
 *
 *   GET    /api/fotos?entidad=estudiante&entidadId=12   → { foto | null }
 *   POST   /api/fotos?entidad=…&entidadId=…             → sube desde el escritorio
 *   DELETE /api/fotos?entidad=…&entidadId=…             → quita la foto
 */

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const auth = await autorizarEntidad(q.get('entidad'), q.get('entidadId'), 'ver');
  if (!auth.ok) return auth.response;

  const foto = await obtenerFoto(auth.teamId, auth.entidad, auth.entidadId);
  return NextResponse.json({ foto, nombre: auth.nombre });
}

export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const auth = await autorizarEntidad(q.get('entidad'), q.get('entidadId'), 'gestionar');
  if (!auth.ok) return auth.response;

  const binario = await leerImagenDePeticion(req);
  if (!binario) return NextResponse.json({ error: 'Archivo no válido o demasiado grande' }, { status: 413 });

  const res = await guardarFotoEntidad({
    teamId: auth.teamId,
    entidad: auth.entidad,
    entidadId: auth.entidadId,
    binario,
    origen: 'archivo',
    usuarioId: auth.usuarioId,
  });
  if (!res.ok) {
    const status = res.error === 'muy-grande' ? 413 : 415;
    return NextResponse.json({ error: mensaje(res.error) }, { status });
  }
  return NextResponse.json({ foto: res.foto });
}

export async function DELETE(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const auth = await autorizarEntidad(q.get('entidad'), q.get('entidadId'), 'gestionar');
  if (!auth.ok) return auth.response;

  const habia = await eliminarFotoEntidad(auth.teamId, auth.entidad, auth.entidadId);
  return NextResponse.json({ ok: true, habia });
}

function mensaje(error: 'vacia' | 'muy-grande' | 'no-es-imagen'): string {
  if (error === 'vacia') return 'No se recibió ninguna imagen';
  if (error === 'muy-grande') return 'La imagen pesa demasiado';
  return 'El archivo no es una imagen';
}
