/**
 * Pasar a nuestras tablas lo que el snapshot de SIGERD ya trajo.
 *
 * Cero llamadas al portal: todo sale de `sigerd_importaciones`. Por eso se puede
 * repetir tantas veces como haga falta sin gastar cuota ni arriesgar la sesión.
 *
 * IDEMPOTENTE por construcción. Cada paso comprueba antes de insertar y omite
 * lo que ya está, así que correrlo dos veces no duplica nada. Eso importa más
 * de lo que parece: el colegio va a pulsar el botón, dudar, y pulsarlo otra vez.
 *
 * Lo que NO hace: traer padres. Se midieron 32 alumnos por dos vías distintas
 * (el endpoint de parientes y el reporte en PDF) y en SIGERD están vacíos para
 * este centro. Ver `scripts/sigerd-medir-padres.ts`.
 */

import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCursos, adminEscolarEstudiantes, adminEscolarGrados,
  adminEscolarPeriodos, adminEscolarServicios,
  sigerdImportaciones, sigerdPersonal,
} from '@/lib/db/schema';
import { invalidarEstructura, invalidarSigerd } from '@/lib/cache/escolar';
import { partirNombre } from './nombres';
import type { ArbolCentro } from './sync';

export interface ResultadoCruce {
  creados: number;
  omitidos: number;
  /** Filas que no se pudieron crear, con el motivo. Se enseñan, no se tragan. */
  fallos: Array<{ que: string; motivo: string }>;
  /** Filas creadas cuyo dato conviene que alguien mire. */
  avisos: Array<{ que: string; motivo: string }>;
}

const vacio = (): ResultadoCruce => ({ creados: 0, omitidos: 0, fallos: [], avisos: [] });

async function snapshot(teamId: number) {
  const [imp] = await db.select().from(sigerdImportaciones)
    .where(and(eq(sigerdImportaciones.teamId, teamId), eq(sigerdImportaciones.estado, 'completado')))
    .limit(1);
  return (imp?.dump ?? null) as Record<string, unknown> | null;
}

/** El año escolar activo. Sin él no hay dónde matricular. */
async function periodoActivo(teamId: number) {
  const [p] = await db.select({ id: adminEscolarPeriodos.id, nombre: adminEscolarPeriodos.nombre })
    .from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.teamId, teamId), eq(adminEscolarPeriodos.activo, true)))
    .limit(1);
  return p ?? null;
}

const clave = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// ── Estructura ──────────────────────────────────────────────────────────────

/**
 * Crea los servicios, grados y secciones que falten, y anota el id de SIGERD en
 * los que ya existían.
 *
 * Ese apunte es la mitad del valor: sin él, el emparejamiento depende del
 * nombre, y el nombre del portal ("Primario - 01'2014 - MATUTINA") no es el que
 * el colegio usa. Una vez anotado, la siguiente sincronización empareja por id y
 * ya no pregunta.
 */
export async function cruzarEstructura(teamId: number, excluir: Set<number>): Promise<ResultadoCruce> {
  const r = vacio();
  const dump = await snapshot(teamId);
  const arbol = dump?.estructura as ArbolCentro | undefined;
  if (!arbol) { r.fallos.push({ que: 'Estructura', motivo: 'No hay descarga previa' }); return r; }

  const periodo = await periodoActivo(teamId);
  if (!periodo) { r.fallos.push({ que: 'Estructura', motivo: 'No hay año escolar activo' }); return r; }

  const [servicios, grados, cursos] = await Promise.all([
    db.select().from(adminEscolarServicios).where(eq(adminEscolarServicios.teamId, teamId)),
    db.select().from(adminEscolarGrados).where(eq(adminEscolarGrados.teamId, teamId)),
    db.select().from(adminEscolarCursos).where(eq(adminEscolarCursos.teamId, teamId)),
  ]);

  for (const sv of arbol.servicios) {
    if (excluir.has(sv.idServicio)) { r.omitidos++; continue; }

    let mio = servicios.find((x) => x.sigerdServicioId === sv.idServicio)
      ?? servicios.find((x) => clave(x.nombre) === clave(sv.nombre));

    if (!mio) {
      const [nuevo] = await db.insert(adminEscolarServicios).values({
        teamId, periodoId: periodo.id, nombre: sv.nombre.slice(0, 120),
        sigerdServicioId: sv.idServicio, orden: servicios.length,
      }).returning();
      servicios.push(nuevo); mio = nuevo; r.creados++;
    } else {
      if (mio.sigerdServicioId == null) {
        await db.update(adminEscolarServicios).set({ sigerdServicioId: sv.idServicio })
          .where(eq(adminEscolarServicios.id, mio.id));
      }
      r.omitidos++;
    }

    for (const g of sv.grados) {
      if (excluir.has(g.idGrado)) { r.omitidos++; continue; }
      let miG = grados.find((x) => x.sigerdGradoId === g.idGrado)
        ?? grados.find((x) => x.servicioId === mio!.id && clave(x.nombre) === clave(g.nombre));

      if (!miG) {
        const [nuevo] = await db.insert(adminEscolarGrados).values({
          teamId, servicioId: mio.id, nombre: g.nombre.slice(0, 120),
          sigerdGradoId: g.idGrado, orden: grados.filter((x) => x.servicioId === mio!.id).length,
        }).returning();
        grados.push(nuevo); miG = nuevo; r.creados++;
      } else {
        if (miG.sigerdGradoId == null) {
          await db.update(adminEscolarGrados).set({ sigerdGradoId: g.idGrado })
            .where(eq(adminEscolarGrados.id, miG.id));
        }
        r.omitidos++;
      }

      for (const s of g.secciones) {
        if (excluir.has(s.idSeccion)) { r.omitidos++; continue; }
        const miS = cursos.find((x) => x.sigerdSeccionId === s.idSeccion)
          ?? cursos.find((x) => x.gradoId === miG!.id && clave(x.nombre) === clave(s.nombre));

        if (!miS) {
          const [nuevo] = await db.insert(adminEscolarCursos).values({
            teamId, gradoId: miG.id, nombre: s.nombre.slice(0, 120),
            sigerdSeccionId: s.idSeccion, orden: cursos.filter((x) => x.gradoId === miG!.id).length,
          }).returning();
          cursos.push(nuevo); r.creados++;
        } else {
          if (miS.sigerdSeccionId == null) {
            await db.update(adminEscolarCursos).set({ sigerdSeccionId: s.idSeccion })
              .where(eq(adminEscolarCursos.id, miS.id));
          }
          r.omitidos++;
        }
      }
    }
  }

  invalidarEstructura(teamId);
  invalidarSigerd(teamId);
  return r;
}

// ── Estudiantes ─────────────────────────────────────────────────────────────

/**
 * Crea los estudiantes. SOLO los estudiantes.
 *
 * NO matricula, aunque SIGERD diga en qué sección está cada uno. La matrícula
 * de este sistema no es "está en Primero A": lleva los conceptos que se le
 * cobran, su mensualidad y su beca, y nada de eso viene del portal. Crearlas
 * con la sección y el resto en blanco dejaba 465 matrículas que PARECÍAN hechas
 * y no cobraban nada — el peor de los dos mundos, porque nadie iba a revisar
 * algo que la pantalla daba por completo.
 *
 * La sección se conserva igual: queda en `sigerd_id` del estudiante y en el
 * snapshot, así que la pantalla de matriculación puede proponerla cuando el
 * colegio inscriba de verdad.
 *
 * El nombre viene de una pieza y se parte por regla; los que quedan dudosos se
 * crean igual pero salen en `avisos`, porque un apellido mal partido se arregla
 * en diez segundos y solo si alguien sabe cuáles mirar.
 */
export async function cruzarEstudiantes(teamId: number, excluir: Set<number>): Promise<ResultadoCruce> {
  const r = vacio();
  const dump = await snapshot(teamId);
  const arbol = dump?.estructura as ArbolCentro | undefined;
  if (!arbol) { r.fallos.push({ que: 'Estudiantes', motivo: 'No hay descarga previa' }); return r; }

  const existentes = await db
    .select({ id: adminEscolarEstudiantes.id, sigerdId: adminEscolarEstudiantes.sigerdId })
    .from(adminEscolarEstudiantes).where(eq(adminEscolarEstudiantes.teamId, teamId));
  const yaEsta = new Map(existentes.filter((e) => e.sigerdId != null).map((e) => [e.sigerdId!, e.id]));

  for (const sv of arbol.servicios) {
    for (const g of sv.grados) {
      for (const s of g.secciones) {
        for (const e of s.estudiantes) {
          if (excluir.has(e.id)) { r.omitidos++; continue; }

          if (yaEsta.has(e.id)) { r.omitidos++; continue; }

          {
            const { nombres, apellidos, dudoso } = partirNombre(e.nombre);
            const [nuevo] = await db.insert(adminEscolarEstudiantes).values({
              teamId, sigerdId: e.id,
              nombres: nombres.slice(0, 120),
              apellidos: apellidos.slice(0, 120),
              estado: 'activo',
            }).returning({ id: adminEscolarEstudiantes.id });
            yaEsta.set(e.id, nuevo.id);
            r.creados++;
            if (dudoso) {
              r.avisos.push({ que: e.nombre, motivo: 'Revisa cómo quedó partido en nombres y apellidos' });
            }
          }
        }
      }
    }
  }

  invalidarEstructura(teamId);
  invalidarSigerd(teamId);
  return r;
}

// ── Personal ────────────────────────────────────────────────────────────────

/**
 * Vuelca el personal del snapshot en `sigerd_personal`.
 *
 * El portal devuelve 27 fichas para 23 personas —repite a quien tiene dos
 * cargos—, así que se agrupa por `idPersona` antes de escribir. Sin eso, el
 * `onConflictDoUpdate` haría cuatro escrituras que se pisan.
 */
export async function cruzarPersonal(teamId: number, excluir: Set<number>): Promise<ResultadoCruce> {
  const r = vacio();
  const dump = await snapshot(teamId);
  if (!dump) { r.fallos.push({ que: 'Personal', motivo: 'No hay descarga previa' }); return r; }

  const fichas = (dump.personalFichas ?? []) as Array<Record<string, unknown>>;
  const crudo = (dump.personal ?? []) as Array<Record<string, unknown>>;
  const contexto = dump.contexto as { idCentro?: number } | undefined;
  const idCentro = contexto?.idCentro ?? (crudo[0]?.IdCentro as number | undefined) ?? null;
  if (idCentro == null) { r.fallos.push({ que: 'Personal', motivo: 'El snapshot no dice de qué centro es' }); return r; }

  // Cargo y estado viven en el listado, con claves en PascalCase; el resto en
  // las fichas, en camelCase. Son dos endpoints distintos del mismo portal.
  const extra = new Map(crudo.map((p) => [Number(p.Id), {
    cargo: (p.Cargo as string | null) ?? null,
    estado: (p.Estado as string | null) ?? null,
  }]));

  const vistos = new Set<number>();
  for (const f of fichas) {
    const idp = f.idPersona != null ? Number(f.idPersona) : null;
    if (idp == null) { r.fallos.push({ que: String(f.cedula ?? 'sin cédula'), motivo: 'Ficha sin id de persona' }); continue; }
    if (vistos.has(idp)) continue;      // el duplicado del segundo cargo
    vistos.add(idp);
    if (excluir.has(idp)) { r.omitidos++; continue; }

    const e = extra.get(idp);
    await db.insert(sigerdPersonal).values({
      teamId, idCentro, sigerdIdPersona: idp,
      cedula: (f.cedula as string | null) ?? null,
      nombres: [f.primerNombre, f.segundoNombre].filter(Boolean).join(' ').trim() || null,
      apellidos: [f.primerApellido, f.segundoApellido].filter(Boolean).join(' ').trim() || null,
      cargo: e?.cargo ?? null,
      estado: e?.estado ?? null,
      sexo: (f.sexo as string | null) ?? null,
      fechaNacimiento: (f.fechaNacimiento as string | null) ?? null,
      nacionalidad: (f.nacionalidad as string | null) ?? null,
      // El portal guarda el número en `movil` casi siempre y en `telefono` a
      // veces; se toma el que venga, que es el que sirve para llamar.
      telefono: (f.movil as string | null) ?? (f.telefono as string | null) ?? null,
      email: (f.email as string | null) ?? null,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [sigerdPersonal.teamId, sigerdPersonal.sigerdIdPersona],
      set: {
        cargo: e?.cargo ?? null, estado: e?.estado ?? null,
        telefono: (f.movil as string | null) ?? (f.telefono as string | null) ?? null,
        email: (f.email as string | null) ?? null,
        updatedAt: new Date(),
      },
    });
    r.creados++;
  }

  invalidarEstructura(teamId);
  invalidarSigerd(teamId);
  return r;
}
