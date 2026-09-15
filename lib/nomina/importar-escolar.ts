/**
 * importar-escolar.ts — puente Personal (colegio) → Empleados (nómina).
 *
 * Enlace unidireccional y OPCIONAL: nómina "jala" personal del módulo escolar
 * cuando el team lo tiene activo. Si no lo tiene, nada de esto se ofrece y la
 * nómina funciona igual. El módulo escolar no sabe de nómina en su esquema; el
 * único rastro del enlace es `empleados.origen`/`origen_ref` (soft-ref por la
 * clave estable de la persona: 'sigerd:<id>' | 'manual:<id>').
 *
 * La importación es un SNAPSHOT (como el asiento contable de una corrida):
 * copia la identidad hacia `empleados` y a partir de ahí las fichas viven
 * independientes. Editar en escolar no propaga. El salario NO viene del colegio
 * (SIGERD no lo trae): el empleado nace en 0 y el usuario lo completa.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { escolarPersonal, sigerdPersonal } from '@/lib/db/schema';

const RE_PROFESOR = /profesor|maestro|docente/i;

/** Deriva maestro del cargo cuando la fila manual no fija `tipo`. */
function esProfesor(cargo: string | null, tipo?: string | null): boolean {
  if (tipo) return tipo === 'maestro';
  return RE_PROFESOR.test(cargo ?? '');
}

/**
 * Activo = "activ" pero NO "inactiv" (`/activ/` matchea "Inactivo": in-ACTIV-o).
 * SIGERD escribe estados variados; esto los normaliza a un booleano.
 */
export function esActivoEscolar(estado: string | null): boolean {
  const e = estado ?? '';
  return /activ/i.test(e) && !/inactiv/i.test(e);
}

/** Una persona del colegio, normalizada, lista para volverse empleado. */
export interface PersonaEscolar {
  /** Clave estable = `empleados.origen_ref`. 'sigerd:<id>' | 'manual:<id>'. */
  ref: string;
  origen: 'sigerd' | 'manual';
  cedula: string | null;
  nombres: string | null;
  apellidos: string | null;
  cargo: string | null;
  esProfesor: boolean;
  estado: string | null;
  activo: boolean;
  sexo: string | null;
  fechaNacimiento: string | null;
  nacionalidad: string | null;
  telefono: string | null;
  email: string | null;
}

/**
 * Personal del centro (mirror SIGERD + agregados a mano), unido y normalizado.
 * Mismo criterio que la pantalla Personal, pero pensado para importar a nómina.
 */
export async function listarPersonalEscolar(teamId: number): Promise<PersonaEscolar[]> {
  const [sigerd, manual] = await Promise.all([
    db
      .select({
        id: sigerdPersonal.id,
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
      .where(eq(sigerdPersonal.teamId, teamId)),
    db.select().from(escolarPersonal).where(eq(escolarPersonal.teamId, teamId)),
  ]);

  const desdeSigerd = sigerd.map((p): PersonaEscolar => ({
    ref: `sigerd:${p.id}`,
    origen: 'sigerd',
    cedula: p.cedula,
    nombres: p.nombres,
    apellidos: p.apellidos,
    cargo: p.cargo,
    esProfesor: esProfesor(p.cargo),
    estado: p.estado,
    activo: esActivoEscolar(p.estado),
    sexo: p.sexo,
    fechaNacimiento: p.fechaNacimiento,
    nacionalidad: p.nacionalidad,
    telefono: p.telefono,
    email: p.email,
  }));

  const desdeManual = manual.map((p): PersonaEscolar => ({
    ref: `manual:${p.id}`,
    origen: 'manual',
    cedula: p.cedula,
    nombres: p.nombres,
    apellidos: p.apellidos,
    cargo: p.cargo,
    esProfesor: esProfesor(p.cargo, p.tipo),
    estado: p.estado,
    activo: esActivoEscolar(p.estado),
    sexo: p.sexo,
    fechaNacimiento: p.fechaNacimiento,
    nacionalidad: p.nacionalidad,
    telefono: p.telefono,
    email: p.email,
  }));

  return [...desdeSigerd, ...desdeManual].sort((a, b) =>
    (a.apellidos ?? '').localeCompare(b.apellidos ?? '', 'es') ||
    (a.nombres ?? '').localeCompare(b.nombres ?? '', 'es'),
  );
}

/** Solo dígitos; la cédula del empleado se guarda pelada. */
export function cedulaLimpiaEscolar(v: string | null): string | null {
  const s = (v ?? '').replace(/\D/g, '');
  return s === '' ? null : s;
}
