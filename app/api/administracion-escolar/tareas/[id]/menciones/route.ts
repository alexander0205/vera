/**
 * A quién se puede mencionar con «@» en la conversación de una tarea.
 *
 *   GET ?personas=1   → { personas }  el personal del colegio y el equipo de Zero
 *                       (lista corta: el cliente la pide UNA vez por tarea y la guarda)
 *   GET ?q=texto      → { padre, estudiante, factura, nc, nd }  hasta 5 de cada uno
 *                       (solo con 2 letras o más; sin eso, todo vacío)
 *
 * Acotado al colegio de la tarea y a lo que quien busca puede ver: los padres
 * piden `clientes:ver` y los documentos `facturas:ver`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { userCanForTeam } from '@/lib/auth/permissions';
import { leerTarea } from '@/lib/administracion-escolar/tareas';
import { buscarMenciones, personasMencionables } from '@/lib/administracion-escolar/tareas-menciones-servidor';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  // La tarea tiene que ser de este colegio: nada se busca fuera de él.
  if (!(await leerTarea(auth.teamId, id))) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  if (sp.get('personas')) return NextResponse.json({ personas: await personasMencionables(auth.teamId) });

  const [padres, documentos] = await Promise.all([
    userCanForTeam(auth.teamId, auth.user.platformRole, auth.teamRole, 'clientes:ver'),
    userCanForTeam(auth.teamId, auth.user.platformRole, auth.teamRole, 'facturas:ver'),
  ]);
  return NextResponse.json(await buscarMenciones(auth.teamId, sp.get('q') ?? '', { padres, documentos }));
}
