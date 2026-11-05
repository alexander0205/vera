/**
 * La tarjeta de tutorial de una pantalla.
 *
 *   GET  ?pantalla=fact-cxc → { mostrar, videos }
 *        `videos`: los publicados de esa pantalla (para «Aprender»; sale siempre
 *        que haya). `mostrar`: si además toca enseñar la tarjeta a esta persona.
 *   POST { pantalla, accion } → { ok }   accion: mostrada | ahora_no | nunca | deshacer
 *
 * Falla cerrado: ante cualquier problema contesta `{ mostrar: false, videos: [] }`
 * y la pantalla no enseña nada.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { origenValido } from '@/lib/auth/admin-guard';
import { esPantalla } from '@/lib/config/pantallas';
import { aplicarAccionTarjeta, estadoTarjeta, hayAcademia, videosDePantalla } from '@/lib/academia/datos';
import { debeMostrarTarjeta, esAccionTarjeta } from '@/lib/academia/tarjeta';

const VACIO = { mostrar: false, videos: [] };

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json(VACIO, { status: 401 });
  const pantalla = req.nextUrl.searchParams.get('pantalla');
  if (!esPantalla(pantalla)) return NextResponse.json(VACIO, { status: 400 });

  // Sin ningún video publicado no se consulta nada más (caché corta) y no se muestra nada.
  if (!(await hayAcademia())) return NextResponse.json(VACIO);
  const videos = await videosDePantalla(user.id, pantalla);
  if (videos.length === 0) return NextResponse.json(VACIO);
  const estado = await estadoTarjeta(user.id, pantalla);
  const mostrar = debeMostrarTarjeta({
    estado, hayVideo: true, todoVisto: videos.every((v) => v.visto), ahora: new Date(),
  });
  return NextResponse.json({ mostrar, videos });
}

export async function POST(req: NextRequest) {
  if (!origenValido(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const user = await getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { pantalla?: unknown; accion?: unknown } | null;
  if (!esPantalla(b?.pantalla) || !esAccionTarjeta(b?.accion)) return NextResponse.json({ ok: false }, { status: 400 });
  return NextResponse.json({ ok: await aplicarAccionTarjeta(user.id, b.pantalla, b.accion) });
}
