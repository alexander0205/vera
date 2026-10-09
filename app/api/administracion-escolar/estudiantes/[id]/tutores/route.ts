import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { tutoresDeEstudiante } from '@/lib/administracion-escolar/ficha-estudiante';
import { vincularTutor } from '@/lib/administracion-escolar/tutores';

/** Tutores asociados a un estudiante. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const estudianteId = parseInt(id);
  const rows = await tutoresDeEstudiante(teamId, estudianteId);
  return NextResponse.json({ tutores: rows });
}

/** Asocia un tutor existente al estudiante. Si responsablePago=true, se quita
 *  la marca de cualquier otro tutor del mismo estudiante (solo uno responsable). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const estudianteId = parseInt(id);
  const { tutorId, relacion, responsablePago } = await req.json();
  if (!tutorId) return NextResponse.json({ error: 'tutorId requerido' }, { status: 400 });

  // Toda la regla vive en lib/administracion-escolar/tutores.ts, compartida con
  // el alta de estudiante: quién puede ser responsable, que solo haya uno, y el
  // re-apuntado del beneficiario al cliente que paga.
  const res = await db.transaction((tx) => vincularTutor(tx, {
    teamId,
    estudianteId,
    tutorId: Number(tutorId),
    relacion,
    responsablePago: responsablePago === true,
  }));
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  const [vinculo] = await tutoresDeEstudiante(teamId, estudianteId)
    .then((filas) => filas.filter((f) => f.tutorId === Number(tutorId)));
  return NextResponse.json({ vinculo });
}
