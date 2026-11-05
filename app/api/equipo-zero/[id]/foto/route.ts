/**
 * /api/equipo-zero/:id/foto — la foto de una persona del equipo de Zero para los
 * colegios (la ven en «Por revisar»: quién atiende y responde su tarea).
 *
 * La ve cualquier usuario con sesión, pero SOLO sirve fotos de cuentas que son
 * del equipo de Zero (`fotoServibleAColegios`): la de cualquier otro usuario
 * contesta 404, igual que si no existiera. No devuelve ningún otro dato.
 *
 * Igual que la del panel (`/api/admin/equipo/:id/foto`): `?v=<versión>` para la
 * caché del navegador y `private`, para que ningún caché compartido la guarde.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { leerFotoParaColegios } from '@/lib/auth/equipo-zero-perfil';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getUser();
  if (!user) return new NextResponse(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const { id } = await ctx.params;
  const userId = /^\d{1,9}$/.test(id) ? Number(id) : NaN;
  if (!Number.isInteger(userId) || userId <= 0) return new NextResponse(null, { status: 400 });

  const f = await leerFotoParaColegios(userId);
  if (!f) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

  return new NextResponse(new Uint8Array(f.foto), {
    headers: {
      'Content-Type': f.tipo,
      'Content-Length': String(f.foto.length),
      'Cache-Control': 'private, max-age=86400',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
