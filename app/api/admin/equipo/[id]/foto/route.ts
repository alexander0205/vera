/**
 * /api/admin/equipo/:id/foto — la foto de alguien del equipo de Zero, para el
 * panel. Solo la ven administradores.
 *
 * La URL lleva `?v=<versión>` (`urlFotoEquipo`): cada foto nueva cambia la
 * versión, así que el navegador puede guardarla en caché un día sin enseñar
 * una vieja. `private`: no la guarda ningún caché compartido.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/admin-guard';
import { leerFotoEquipo } from '@/lib/auth/equipo-zero-perfil';
import { tipoDeFoto } from '@/lib/auth/equipo-zero-perfil-reglas';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const userId = /^\d{1,9}$/.test(id) ? Number(id) : NaN;
  if (!Number.isInteger(userId) || userId <= 0) return new NextResponse(null, { status: 400 });

  const f = await leerFotoEquipo(userId);
  // El tipo se vuelve a sacar de los bytes: nunca se sirve como imagen algo que no lo es.
  const tipo = f ? tipoDeFoto(f.foto) : null;
  if (!f || !tipo) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

  return new NextResponse(new Uint8Array(f.foto), {
    headers: {
      'Content-Type': tipo,
      'Content-Length': String(f.foto.length),
      'Cache-Control': 'private, max-age=86400',
      'Content-Disposition': 'inline',
    },
  });
}
