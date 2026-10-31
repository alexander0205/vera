import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { invalidarEstructura } from '@/lib/cache/escolar';
import { asegurarSeccionSinGrado } from '@/lib/administracion-escolar/seccion-sin-grado';

/**
 * La sección de quien no tiene grado (ver `lib/administracion-escolar/sin-grado.ts`).
 *
 * Body: `{ periodoId, servicioId? }`. Va con el permiso de matricular y no con el
 * de configurar la estructura: es parte de matricular, y la secretaria que recibe
 * a un alumno de otro centro no tiene por qué poder tocar los grados del colegio.
 */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const periodoId = Number(body?.periodoId);
  const servicioId = body?.servicioId == null ? null : Number(body.servicioId);
  if (!Number.isInteger(periodoId) || periodoId <= 0 || (servicioId !== null && (!Number.isInteger(servicioId) || servicioId <= 0))) {
    return NextResponse.json({ error: 'Falta el año escolar.' }, { status: 400 });
  }
  const curso = await asegurarSeccionSinGrado(auth.teamId, periodoId, servicioId);
  if (!curso) return NextResponse.json({ error: 'Ese servicio no es de este año escolar.' }, { status: 404 });
  invalidarEstructura(auth.teamId);
  return NextResponse.json({ curso });
}
