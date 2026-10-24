/**
 * Las personas del colegio a las que se le puede asignar una tarea.
 *
 *   GET → { personas: [{ id, nombre }] }
 */
import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { personasDelColegio } from '@/lib/administracion-escolar/tareas';

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  return NextResponse.json({ personas: await personasDelColegio(auth.teamId) });
}
