import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import {
  matricularDesdeSigerd, pendientesDesdeSigerd,
} from '@/lib/administracion-escolar/matricular-desde-sigerd';

/**
 * «Tienes X alumnos de SIGERD sin matricular, ¿matricularlos a todos?»
 *
 * GET solo cuenta y agrupa por sección; POST los matricula. Ver
 * `matricular-desde-sigerd.ts` para qué entra y qué se deja fuera.
 */
export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  return NextResponse.json(await pendientesDesdeSigerd(auth.teamId));
}

export async function POST() {
  // Crea matrículas con sus cargos: mueve deuda cobrable, va con el gate de escritura.
  const auth = await requireModuleAndPermission(
    'escolar', 'administracion-escolar:gestionar', { escritura: true },
  );
  if (!auth.ok) return auth.response;
  return NextResponse.json(await matricularDesdeSigerd(auth.teamId));
}
