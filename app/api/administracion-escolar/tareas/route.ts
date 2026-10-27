/**
 * Tareas por revisar de un alumno y de su familia, o del colegio.
 *
 *   GET  ?estudianteId=N&alcance=alumno|familia&estado=abierta|completada
 *        → { tareas, conteo, familia }
 *   GET  ?estudianteId=N&soloConteo=1 → { conteo }   (los números de las campanas)
 *   POST { estudianteId?, alcance, titulo, descripcion?, asignadaA, asignadaUserId?, ecfDocumentId?, venceEl? }
 *        Con `alcance: 'colegio'` no lleva alumno: se crea desde «Por revisar».
 *
 * Ver lib/administracion-escolar/tareas.ts.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import {
  avisarDeTarea, conteoDeTareas, crearTarea, documentoDelColegio, familiaDe, listarTareas, personasDelColegio,
} from '@/lib/administracion-escolar/tareas';
import { autorTarea, validarNuevaTarea } from '@/lib/administracion-escolar/tareas-reglas';
import { logAudit } from '@/lib/audit';

const idDe = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;
  const estudianteId = idDe(sp.get('estudianteId'));
  if (!estudianteId) return NextResponse.json({ error: 'Falta el alumno' }, { status: 400 });
  const fam = await familiaDe(auth.teamId, estudianteId);
  if (!fam) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const conteo = await conteoDeTareas(auth.teamId, fam);
  if (sp.get('soloConteo') === '1') return NextResponse.json({ conteo });

  const alcance = sp.get('alcance') === 'familia' ? 'familia' : 'alumno';
  const estado = sp.get('estado') === 'completada' ? 'completada' : 'abierta';
  const tareas = await listarTareas(auth.teamId, fam, alcance, estado);
  return NextResponse.json({
    tareas, conteo,
    familia: { tieneResponsable: fam.clientId != null, alumnos: fam.alumnos.map((a) => a.nombre) },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const v = validarNuevaTarea(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  // Una del colegio no es de ningún alumno: si llega uno, se ignora.
  const estudianteId = v.tarea.alcance === 'colegio' ? null : idDe(body?.estudianteId);
  if (v.tarea.alcance !== 'colegio' && !estudianteId) return NextResponse.json({ error: 'Falta el alumno' }, { status: 400 });
  const fam = estudianteId ? await familiaDe(auth.teamId, estudianteId) : null;
  if (estudianteId && !fam) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  if (v.tarea.alcance === 'familia' && fam?.clientId == null) {
    return NextResponse.json({ error: 'Este alumno no tiene responsable de pago: la tarea tiene que ser suya.' }, { status: 400 });
  }

  // La persona asignada tiene que ser de este colegio.
  let personaNombre: string | null = null;
  if (v.tarea.asignadaA === 'persona') {
    const persona = (await personasDelColegio(auth.teamId)).find((p) => p.id === v.tarea.asignadaUserId);
    if (!persona) return NextResponse.json({ error: 'Esa persona no es de este colegio.' }, { status: 400 });
    personaNombre = persona.nombre;
  }

  // La factura relacionada tiene que ser de este colegio.
  if (v.tarea.ecfDocumentId && !(await documentoDelColegio(auth.teamId, v.tarea.ecfDocumentId))) {
    return NextResponse.json({ error: 'Esa factura no es de este colegio.' }, { status: 400 });
  }

  const autor = autorTarea(auth.user);
  const id = await crearTarea(auth.teamId, fam, autor, v.tarea, personaNombre);
  if (!id) return NextResponse.json({ error: 'No se pudo crear la tarea.' }, { status: 409 });
  after(() => avisarDeTarea(auth.teamId, id, 'creada', autor, v.tarea.descripcion));
  logAudit({
    teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'ESCOLAR_TAREA_CREADA',
    resource: `tarea:${id}`, meta: { estudianteId, alcance: v.tarea.alcance, asignadaA: v.tarea.asignadaA },
  });
  return NextResponse.json({ id }, { status: 201 });
}
