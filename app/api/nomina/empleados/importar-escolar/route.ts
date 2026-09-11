import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { teamHasModule } from '@/lib/auth/modules';
import { db } from '@/lib/db/drizzle';
import { empleados } from '@/lib/db/schema';
import {
  listarPersonalEscolar, cedulaLimpiaEscolar, type PersonaEscolar,
} from '@/lib/nomina/importar-escolar';

export const dynamic = 'force-dynamic';

/**
 * Puente Personal (colegio) → Empleados (nómina). Solo vive si el team tiene el
 * módulo escolar; si no, responde "no disponible" y la nómina sigue igual.
 */

/** Lo que necesita el modal: la persona + si ya está en nómina o choca cédula. */
interface PersonaImportable extends PersonaEscolar {
  yaImportada: boolean;
  cedulaOcupada: boolean;
}

/**
 * GET — lista el personal del colegio marcando cuáles ya son empleados.
 * `disponible:false` = el team no tiene el módulo escolar (nada que ofrecer).
 */
export async function GET() {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  if (!(await teamHasModule(auth.teamId, 'escolar'))) {
    return NextResponse.json({ disponible: false, personas: [] });
  }

  const [personas, filas] = await Promise.all([
    listarPersonalEscolar(auth.teamId),
    db
      .select({ cedula: empleados.cedula, origen: empleados.origen, origenRef: empleados.origenRef })
      .from(empleados)
      .where(eq(empleados.teamId, auth.teamId)),
  ]);

  const refsImportados = new Set(
    filas.filter((e) => e.origen === 'escolar' && e.origenRef).map((e) => e.origenRef as string),
  );
  const cedulasEmpleados = new Set(
    filas.map((e) => cedulaLimpiaEscolar(e.cedula)).filter((c): c is string => !!c),
  );

  const importables: PersonaImportable[] = personas.map((p) => {
    const ced = cedulaLimpiaEscolar(p.cedula);
    return {
      ...p,
      yaImportada: refsImportados.has(p.ref),
      // Choca si otro empleado ya usa esa cédula sin ser este mismo enlace.
      cedulaOcupada: !refsImportados.has(p.ref) && !!ced && cedulasEmpleados.has(ced),
    };
  });

  return NextResponse.json({ disponible: true, personas: importables });
}

/**
 * POST — importa las personas indicadas (por `ref`) como empleados nuevos.
 * Snapshot: copia la identidad; salario en 0 para que el usuario lo complete.
 * Idempotente: omite las ya importadas (por ref).
 */
export async function POST(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  if (!(await teamHasModule(auth.teamId, 'escolar'))) {
    return NextResponse.json({ error: 'El módulo escolar no está activo.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const refs: string[] = Array.isArray(body?.refs)
    ? body.refs.filter((r: unknown): r is string => typeof r === 'string')
    : [];
  if (refs.length === 0) {
    return NextResponse.json({ error: 'No se indicó a quién importar.' }, { status: 400 });
  }

  const [personas, filas] = await Promise.all([
    listarPersonalEscolar(auth.teamId),
    db
      .select({ origen: empleados.origen, origenRef: empleados.origenRef })
      .from(empleados)
      .where(eq(empleados.teamId, auth.teamId)),
  ]);

  const porRef = new Map(personas.map((p) => [p.ref, p]));
  const yaImportados = new Set(
    filas.filter((e) => e.origen === 'escolar' && e.origenRef).map((e) => e.origenRef as string),
  );

  const nuevos = [];
  const pedidos = new Set(refs);
  for (const ref of pedidos) {
    const p = porRef.get(ref);
    if (!p) continue;                       // ref inexistente o de otro team
    if (yaImportados.has(ref)) continue;    // idempotencia
    if (!p.nombres && !p.apellidos) continue; // sin identidad, no sirve
    nuevos.push({
      teamId:          auth.teamId,
      cedula:          cedulaLimpiaEscolar(p.cedula),
      nombres:         (p.nombres ?? '').trim() || (p.apellidos ?? '').trim(),
      apellidos:       (p.apellidos ?? '').trim() || (p.nombres ?? '').trim(),
      cargo:           p.cargo?.trim() || null,
      estado:          p.activo ? 'activo' : 'inactivo',
      sexo:            p.sexo?.trim() || null,
      fechaNacimiento: p.fechaNacimiento,
      nacionalidad:    p.nacionalidad?.trim() || null,
      telefono:        p.telefono?.trim() || null,
      email:           p.email?.trim() || null,
      origen:          'escolar' as const,
      origenRef:       p.ref,
      createdBy:       auth.user.id,
    });
  }

  if (nuevos.length === 0) {
    return NextResponse.json({ creados: 0, mensaje: 'No había personal nuevo que importar.' });
  }

  await db.insert(empleados).values(nuevos);
  return NextResponse.json({ creados: nuevos.length });
}
