/**
 * Buscador de la Academia.
 *
 *   GET  ?q=texto  → { resultados, oferta }   (sin IA; para ir buscando mientras se escribe)
 *   POST { q }     → { respuesta, resultados }       (con el asistente: contesta y señala el minuto)
 *
 * Solo ve videos publicados quien tenga sesión; los borradores no entran aquí
 * ni siquiera para el administrador (se ven en /admin/academia).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { origenValido } from '@/lib/auth/admin-guard';
import { rateLimit, rateLimitDb } from '@/lib/rate-limit';
import { puedeLlamarAlModelo } from '@/lib/academia/limite';
import { respuestaSinIa } from '@/lib/academia/respuesta';
import { filtrarPorModulos } from '@/lib/academia/reglas';
import { buscarVideos, ofertaAsistente } from '@/lib/academia/busqueda';
import { listaDeCrudos, modulosParaAcademia, videosCrudos } from '@/lib/academia/datos';
import { responderPregunta } from '@/lib/academia/asistente';
import type { ResultadoLista } from '@/lib/academia/tipos';

export const maxDuration = 60;

const MAX_PREGUNTA = 300;

async function buscar(q: string, user: { id: number; platformRole?: string | null }) {
  const userId = user.id;
  // Solo se busca entre los videos de los módulos de la empresa (y los «General»).
  const crudos = filtrarPorModulos(await videosCrudos(), await modulosParaAcademia(user));
  const encontrados = buscarVideos(crudos, q);
  const lista = await listaDeCrudos(userId, encontrados.map((e) => e.video));
  const resultados: ResultadoLista[] = encontrados.map((e, i) => ({ video: lista[i], momento: e.momento }));
  return { crudos, encontrados, resultados };
}

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!rateLimit(`academia-buscar:${user.id}`, 60, 60_000).allowed) {
    return NextResponse.json({ error: 'Demasiadas búsquedas. Espera un momento.' }, { status: 429 });
  }
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, MAX_PREGUNTA);
  if (!q) return NextResponse.json({ resultados: [], oferta: 'ninguna' });
  const { encontrados, resultados } = await buscar(q, user);
  return NextResponse.json({ resultados, oferta: ofertaAsistente(q, encontrados) });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!origenValido(req)) return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  // El mismo tope en memoria que el GET (primera línea de defensa, antes de tocar la base).
  if (!rateLimit(`academia-buscar:${user.id}`, 60, 60_000).allowed) {
    return NextResponse.json({ error: 'Demasiadas preguntas. Espera un momento.' }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { q?: unknown } | null;
  const q = typeof body?.q === 'string' ? body.q.trim().slice(0, MAX_PREGUNTA) : '';
  if (!q) return NextResponse.json({ error: 'Escribe tu pregunta' }, { status: 400 });

  const { crudos, encontrados, resultados } = await buscar(q, user);
  // Esta sí cuesta una llamada a un modelo: tope por minuto y por día en la base.
  // Pasado el tope no se rechaza: se contesta con lo mejor del buscador.
  if (!(await puedeLlamarAlModelo(user.id, rateLimitDb))) {
    return NextResponse.json({ respuesta: respuestaSinIa(encontrados), resultados, limitado: true });
  }
  const teamId = await getTeamIdForUser().catch(() => null);
  const respuesta = await responderPregunta({
    pregunta: q, candidatos: encontrados, todos: crudos, userId: user.id, teamId,
  });
  return NextResponse.json({ respuesta, resultados });
}
