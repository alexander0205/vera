/** GET ?slug=… → el video publicado (con URL firmada) para verlo en el cuadro encima de una pantalla. */
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { videoPorSlug } from '@/lib/academia/datos';

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const slug = req.nextUrl.searchParams.get('slug') ?? '';
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  // Aquí nunca borradores: el cuadro es para el público; el admin revisa en la página.
  const video = await videoPorSlug(user.id, slug, false);
  if (!video) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ video });
}
