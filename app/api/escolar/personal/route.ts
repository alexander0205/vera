import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { teamHasModule } from '@/lib/auth/modules';
import { db } from '@/lib/db/drizzle';
import { empleados, escolarPersonal, sigerdPersonal } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

const RE_PROFESOR = /profesor|maestro|docente/i;

/** Deriva maestro/profesor del cargo cuando no hay `tipo` explícito. */
function esProfesor(cargo: string | null, tipo?: string | null): boolean {
  if (tipo) return tipo === 'maestro';
  return RE_PROFESOR.test(cargo ?? '');
}

/**
 * Activo = dice "activ" pero NO "inactiv". Ojo: `/activ/` sí matchea "Inactivo"
 * (in-ACTIV-o), así que un simple test contaría los inactivos como activos.
 */
function esActivo(estado: string | null): boolean {
  const e = estado ?? '';
  return /activ/i.test(e) && !/inactiv/i.test(e);
}

type PersonaUI = {
  key: string;
  origen: 'sigerd' | 'manual';
  id: number;
  sigerdIdPersona: number | null;
  cedula: string | null;
  nombres: string | null;
  apellidos: string | null;
  cargo: string | null;
  /** Override manual maestro/otro; null = derivar del cargo (siempre null en SIGERD). */
  tipo: string | null;
  estado: string | null;
  sexo: string | null;
  fechaNacimiento: string | null;
  nacionalidad: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  esProfesor: boolean;
  editable: boolean;
  /** true si esta persona ya se importó como empleado de nómina. Solo se llena
   *  cuando el team tiene el módulo nómina; si no, queda false y no se muestra. */
  enNomina: boolean;
};

/**
 * Personal del centro: mirror de SIGERD (solo lectura) UNIDO con el personal
 * agregado a mano (`escolar_personal`, editable). El `tipo` maestro/profesor se
 * deriva del cargo salvo que la fila manual lo fije.
 */
export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const [sigerd, manual] = await Promise.all([
    db
      .select({
        id: sigerdPersonal.id,
        sigerdIdPersona: sigerdPersonal.sigerdIdPersona,
        cedula: sigerdPersonal.cedula,
        nombres: sigerdPersonal.nombres,
        apellidos: sigerdPersonal.apellidos,
        cargo: sigerdPersonal.cargo,
        estado: sigerdPersonal.estado,
        sexo: sigerdPersonal.sexo,
        fechaNacimiento: sigerdPersonal.fechaNacimiento,
        nacionalidad: sigerdPersonal.nacionalidad,
        telefono: sigerdPersonal.telefono,
        email: sigerdPersonal.email,
      })
      .from(sigerdPersonal)
      .where(eq(sigerdPersonal.teamId, auth.teamId)),
    db
      .select()
      .from(escolarPersonal)
      .where(eq(escolarPersonal.teamId, auth.teamId)),
  ]);

  const personal: PersonaUI[] = [
    ...sigerd.map((p): PersonaUI => ({
      key: `sigerd:${p.id}`,
      origen: 'sigerd',
      id: p.id,
      sigerdIdPersona: p.sigerdIdPersona,
      cedula: p.cedula,
      nombres: p.nombres,
      apellidos: p.apellidos,
      cargo: p.cargo,
      tipo: null,
      estado: p.estado,
      sexo: p.sexo,
      fechaNacimiento: p.fechaNacimiento,
      nacionalidad: p.nacionalidad,
      telefono: p.telefono,
      email: p.email,
      notas: null,
      esProfesor: esProfesor(p.cargo),
      editable: false,
      enNomina: false,
    })),
    ...manual.map((p): PersonaUI => ({
      key: `manual:${p.id}`,
      origen: 'manual',
      id: p.id,
      sigerdIdPersona: p.sigerdIdPersona,
      cedula: p.cedula,
      nombres: p.nombres,
      apellidos: p.apellidos,
      cargo: p.cargo,
      tipo: p.tipo,
      estado: p.estado,
      sexo: p.sexo,
      fechaNacimiento: p.fechaNacimiento,
      nacionalidad: p.nacionalidad,
      telefono: p.telefono,
      email: p.email,
      notas: p.notas,
      esProfesor: esProfesor(p.cargo, p.tipo),
      editable: true,
      enNomina: false,
    })),
  ];

  // Reflejo de nómina (opcional, unidireccional): si el team tiene el módulo
  // nómina, marca quién ya es empleado. El enlace vive solo en `empleados`
  // (origen='escolar', origen_ref = la misma clave 'sigerd:<id>'/'manual:<id>');
  // aquí solo se LEE. Sin el módulo, no hay consulta y `enNomina` queda false.
  if (await teamHasModule(auth.teamId, 'nomina')) {
    const enNomina = await db
      .select({ origenRef: empleados.origenRef })
      .from(empleados)
      .where(and(eq(empleados.teamId, auth.teamId), eq(empleados.origen, 'escolar')));
    const refs = new Set(enNomina.map((e) => e.origenRef).filter((r): r is string => !!r));
    for (const p of personal) if (refs.has(p.key)) p.enNomina = true;
  }

  personal.sort((a, b) =>
    (a.apellidos ?? '').localeCompare(b.apellidos ?? '', 'es') ||
    (a.nombres ?? '').localeCompare(b.nombres ?? '', 'es'),
  );

  const totales = {
    total: personal.length,
    profesores: personal.filter((p) => p.esProfesor).length,
    otros: personal.filter((p) => !p.esProfesor).length,
    activos: personal.filter((p) => esActivo(p.estado)).length,
    manual: manual.length,
  };

  return NextResponse.json({ personal, totales });
}

// ── Alta / edición / baja de personal MANUAL (tabla escolar_personal) ─────────

const CAMPOS = [
  'cedula', 'nombres', 'apellidos', 'cargo', 'tipo', 'estado',
  'sexo', 'nacionalidad', 'telefono', 'email', 'notas',
] as const;

/** Recorta y normaliza el cuerpo a los campos permitidos. */
function limpiarCuerpo(body: Record<string, unknown>) {
  const out: Record<string, string | null> = {};
  for (const c of CAMPOS) {
    if (c in body) {
      const v = body[c];
      out[c] = typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
    }
  }
  // Fecha: acepta 'YYYY-MM-DD' o vacío.
  if ('fechaNacimiento' in body) {
    const v = body.fechaNacimiento;
    out.fechaNacimiento = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  }
  // tipo solo puede ser maestro | otro | null.
  if (out.tipo && out.tipo !== 'maestro' && out.tipo !== 'otro') out.tipo = null;
  return out;
}

export async function POST(req: Request) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const datos = limpiarCuerpo(body);

  if (!datos.nombres && !datos.apellidos) {
    return NextResponse.json({ error: 'Indica al menos el nombre o el apellido.' }, { status: 400 });
  }

  const [fila] = await db
    .insert(escolarPersonal)
    .values({
      teamId: auth.teamId,
      cedula: datos.cedula ?? null,
      nombres: datos.nombres ?? null,
      apellidos: datos.apellidos ?? null,
      cargo: datos.cargo ?? null,
      tipo: datos.tipo ?? null,
      estado: datos.estado ?? 'Activo',
      sexo: datos.sexo ?? null,
      fechaNacimiento: datos.fechaNacimiento ?? null,
      nacionalidad: datos.nacionalidad ?? null,
      telefono: datos.telefono ?? null,
      email: datos.email ?? null,
      notas: datos.notas ?? null,
    })
    .returning({ id: escolarPersonal.id });

  return NextResponse.json({ ok: true, id: fila.id }, { status: 201 });
}

export async function PATCH(req: Request) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Falta el id.' }, { status: 400 });
  }
  const datos = limpiarCuerpo(body);

  const res = await db
    .update(escolarPersonal)
    .set({ ...datos, updatedAt: new Date() })
    .where(and(eq(escolarPersonal.id, id), eq(escolarPersonal.teamId, auth.teamId)))
    .returning({ id: escolarPersonal.id });

  if (!res.length) return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Falta el id.' }, { status: 400 });
  }

  const res = await db
    .delete(escolarPersonal)
    .where(and(eq(escolarPersonal.id, id), eq(escolarPersonal.teamId, auth.teamId)))
    .returning({ id: escolarPersonal.id });

  if (!res.length) return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
