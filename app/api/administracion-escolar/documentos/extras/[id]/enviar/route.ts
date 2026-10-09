import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarDocumentosRequeridos,
  adminEscolarFormularios,
  adminEscolarFormularioRespuestas,
  adminEscolarEstudiantes,
  adminEscolarEstudianteTutores,
  adminEscolarTutores,
  teams,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { contextoDeMatricula } from '@/lib/administracion-escolar/documentos';
import { nuevoToken } from '@/lib/administracion-escolar/formularios-publicos';
import { registrarAvisoExpediente } from '@/lib/administracion-escolar/avisos-expediente';
import { enviarEnlaceFormularioEmail } from '@/lib/email/escolar-avisos';
import { origenPublico } from '@/lib/http/origen-publico';

/**
 * Le manda a la familia, por correo, el formulario adjunto a un expediente.
 *
 * El enlace que se manda es el de SU borrador: lo que la familia escriba se le
 * guarda y puede volver por el mismo enlace. Por eso no se genera uno nuevo en
 * cada envío —eso dejaría dos enlaces vivos y el trabajo a medias en el que ya
 * no se usa—; solo se abre uno si por lo que sea no existe.
 */

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Correo inválido' }, { status: 400 });
  }

  const [renglon] = await db.select().from(adminEscolarDocumentosRequeridos)
    .where(and(
      eq(adminEscolarDocumentosRequeridos.id, id),
      eq(adminEscolarDocumentosRequeridos.teamId, auth.teamId),
    ))
    .limit(1);

  if (!renglon?.formularioId || !renglon.matriculaId) {
    return NextResponse.json({ error: 'Ese renglón no es un formulario' }, { status: 404 });
  }

  const contexto = await contextoDeMatricula(auth.teamId, renglon.matriculaId);
  if (!contexto) return NextResponse.json({ error: 'Matrícula no encontrada' }, { status: 404 });

  const [formulario] = await db.select().from(adminEscolarFormularios)
    .where(and(
      eq(adminEscolarFormularios.id, renglon.formularioId),
      eq(adminEscolarFormularios.teamId, auth.teamId),
    ))
    .limit(1);
  if (!formulario) return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });

  const [respuesta] = await db.select({
    token: adminEscolarFormularioRespuestas.token,
    estado: adminEscolarFormularioRespuestas.estado,
  })
    .from(adminEscolarFormularioRespuestas)
    .where(and(
      eq(adminEscolarFormularioRespuestas.formularioId, formulario.id),
      eq(adminEscolarFormularioRespuestas.matriculaId, renglon.matriculaId),
    ))
    .limit(1);

  if (respuesta && respuesta.estado !== 'borrador') {
    return NextResponse.json(
      { error: 'Esta familia ya contestó el formulario' },
      { status: 409 },
    );
  }

  let token = respuesta?.token ?? null;
  if (!token) {
    token = nuevoToken();
    await db.insert(adminEscolarFormularioRespuestas).values({
      teamId: auth.teamId,
      formularioId: formulario.id,
      formularioNombre: formulario.nombre,
      estudianteId: contexto.estudianteId,
      matriculaId: renglon.matriculaId,
      datos: {},
      estado: 'borrador',
      token,
      pagina: 0,
    });
  }

  const [equipo] = await db.select({ nombre: teams.name }).from(teams)
    .where(eq(teams.id, auth.teamId)).limit(1);
  const [alumno] = await db.select({
    nombres: adminEscolarEstudiantes.nombres,
    apellidos: adminEscolarEstudiantes.apellidos,
  }).from(adminEscolarEstudiantes)
    .where(eq(adminEscolarEstudiantes.id, contexto.estudianteId)).limit(1);
  const [tutor] = await db.select({ nombre: adminEscolarTutores.nombre })
    .from(adminEscolarEstudianteTutores)
    .innerJoin(adminEscolarTutores, and(
      eq(adminEscolarEstudianteTutores.tutorId, adminEscolarTutores.id),
      eq(adminEscolarTutores.teamId, auth.teamId),
    ))
    .where(and(
      eq(adminEscolarEstudianteTutores.teamId, auth.teamId),
      eq(adminEscolarEstudianteTutores.estudianteId, contexto.estudianteId),
      eq(adminEscolarEstudianteTutores.responsablePago, true),
    ))
    .limit(1);

  const url = `${origenPublico(req)}/f/${formulario.slug}/r/${token}`;

  await enviarEnlaceFormularioEmail({
    email,
    colegio: equipo?.nombre ?? 'El colegio',
    tutor: tutor?.nombre ?? null,
    estudiante: [alumno?.nombres, alumno?.apellidos].filter(Boolean).join(' ') || 'su hijo/a',
    formulario: formulario.nombre,
    url,
  });

  await registrarAvisoExpediente({
    teamId: auth.teamId,
    matriculaId: renglon.matriculaId,
    tipo: 'formulario',
    canal: 'correo',
    destino: email,
    detalle: formulario.nombre,
  });

  return NextResponse.json({ ok: true, enviadoA: email, url });
}
