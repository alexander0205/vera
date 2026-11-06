/**
 * «Completar familias desde SIGERD» para todo el colegio.
 *
 *   GET    → el trabajo actual (o el último) y cuántos alumnos tienen algo por completar
 *   POST   → lo empieza (o devuelve el que ya corre) y avanza la primera tanda
 *            después de responder; el cron sigue el resto
 *   DELETE → lo cancela; lo ya completado se queda
 *
 * Ver `lib/administracion-escolar/trabajo-familias-sigerd.ts`.
 */

import { NextResponse, after } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import {
  avanzarFamilias, cancelarFamilias, iniciarFamilias, porCompletar, trabajoDeFamilias,
} from '@/lib/administracion-escolar/trabajo-familias-sigerd';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const [trabajo, pendientes] = await Promise.all([trabajoDeFamilias(auth.teamId), porCompletar(auth.teamId)]);
  return NextResponse.json({ trabajo, pendientes });
}

export async function POST() {
  // Como «Traer de SIGERD»: consulta datos de familiares de menores y crea tutores.
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const trabajo = await iniciarFamilias(auth.teamId, auth.user.id);
  if (trabajo.estado === 'pendiente' || trabajo.estado === 'corriendo') {
    after(() => avanzarFamilias(trabajo.id, 240_000).then(() => undefined));
  }
  return NextResponse.json({ trabajo });
}

export async function DELETE() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  await cancelarFamilias(auth.teamId);
  return NextResponse.json({ trabajo: await trabajoDeFamilias(auth.teamId) });
}
