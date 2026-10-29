/**
 * «Completar familias desde SIGERD»: recorre a los alumnos del colegio uno
 * por uno, por su id del portal, y les trae lo que les falte — fecha de
 * nacimiento y sexo de su ficha, y padre, madre o tutor del PDF de la ficha —.
 *
 * Pedido de Alex (standup 29-oct-2026): el listado de SIGERD trae poco y los
 * padres viven en un PDF por alumno; bajarlos a mano uno por uno no escala.
 * Esto corre en el servidor y sigue aunque se cierre la pantalla:
 *  - al empezar, la propia petición avanza una tanda con `after()`;
 *  - el cron `/api/cron/sigerd-familias` sigue cada pocos minutos.
 * Cada pasada toma el candado (`ocupado_hasta`), avanza desde `cursor_id` lo
 * que le quepa en su tiempo y lo suelta. Si se corta a mitad, la próxima sigue
 * donde quedó: lo que ya se completó no vuelve a pedirse.
 *
 * Nada de esto toca responsables de pago ni cobros: solo la ficha del alumno y
 * sus tutores, que se atan sin quitar los que ya tenía.
 */

import 'server-only';
import { and, asc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarEstudiantes, adminEscolarEstudianteTutores, adminEscolarTrabajos,
} from '@/lib/db/schema';
import { conClienteSigerd } from '@/lib/sigerd/sesion-auto';
import { traerFichaEstudiante } from '@/lib/sigerd/ficha';
import { traerTutoresDeSigerd } from '@/lib/sigerd/tutores-desde-sigerd';
import { SigerdError } from '@/lib/sigerd/types';
import type { SigerdClient } from '@/lib/sigerd/client';

export const TIPO_FAMILIAS = 'sigerd-familias';
/** Lo que se le deja a cada pasada antes de soltar el candado. */
const CANDADO = sql`now() + interval '6 minutes'`;
/** Seguidos sin poder hablar con el portal: se para y lo intenta el cron más tarde. */
const MAX_FALLOS_SEGUIDOS = 5;

export interface ResumenFamilias {
  /** Alumnos a los que se les completó fecha o sexo. */
  ficha: number;
  /** Alumnos a los que se les ató al menos un tutor nuevo. */
  conTutores: number;
  /** Tutores atados en total. */
  tutores: number;
  /** El portal no tiene padres para ellos: hay que pedirlos al colegio. */
  sinTutoresEnSigerd: number;
  errores: number;
  /** Los últimos que fallaron, para enseñarlos. */
  fallidos: Array<{ estudianteId: number; nombre: string; error: string }>;
}

const resumenVacio = (): ResumenFamilias => ({
  ficha: 0, conTutores: 0, tutores: 0, sinTutoresEnSigerd: 0, errores: 0, fallidos: [],
});

const tieneTutores = sql<boolean>`EXISTS (
  SELECT 1 FROM ${adminEscolarEstudianteTutores} et WHERE et.estudiante_id = ${adminEscolarEstudiantes.id}
)`;

/** A quién le falta algo que SIGERD puede traer. */
const leFaltaAlgo = sql`(${adminEscolarEstudiantes.fechaNacimiento} IS NULL
  OR ${adminEscolarEstudiantes.sexo} IS NULL OR NOT ${tieneTutores})`;

const candidatos = (teamId: number) => and(
  eq(adminEscolarEstudiantes.teamId, teamId),
  eq(adminEscolarEstudiantes.estado, 'activo'),
  isNotNull(adminEscolarEstudiantes.sigerdId),
  leFaltaAlgo,
);

export async function trabajoDeFamilias(teamId: number) {
  const [t] = await db.select().from(adminEscolarTrabajos)
    .where(and(eq(adminEscolarTrabajos.teamId, teamId), eq(adminEscolarTrabajos.tipo, TIPO_FAMILIAS)))
    .orderBy(sql`${adminEscolarTrabajos.id} DESC`).limit(1);
  return t ?? null;
}

/** Cuántos alumnos tienen algo por completar. */
export async function porCompletar(teamId: number): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(adminEscolarEstudiantes).where(candidatos(teamId));
  return r?.n ?? 0;
}

/** Empieza uno, o devuelve el que ya está en marcha. */
export async function iniciarFamilias(teamId: number, userId: number) {
  const actual = await trabajoDeFamilias(teamId);
  if (actual && (actual.estado === 'pendiente' || actual.estado === 'corriendo')) return actual;
  const total = await porCompletar(teamId);
  const [t] = await db.insert(adminEscolarTrabajos).values({
    teamId, tipo: TIPO_FAMILIAS, total, creadoPor: userId,
    estado: total === 0 ? 'hecho' : 'pendiente',
    resumen: resumenVacio(),
    terminadoAt: total === 0 ? new Date() : null,
  }).returning();
  return t;
}

export async function cancelarFamilias(teamId: number) {
  await db.update(adminEscolarTrabajos)
    .set({ estado: 'cancelado', ocupadoHasta: null, terminadoAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(adminEscolarTrabajos.teamId, teamId), eq(adminEscolarTrabajos.tipo, TIPO_FAMILIAS),
      inArray(adminEscolarTrabajos.estado, ['pendiente', 'corriendo']),
    ));
}

/** El candado: solo una pasada a la vez por trabajo. `null` si otra lo tiene. */
async function tomar(trabajoId: number) {
  const [t] = await db.update(adminEscolarTrabajos)
    .set({ estado: 'corriendo', ocupadoHasta: CANDADO, updatedAt: new Date() })
    .where(and(
      eq(adminEscolarTrabajos.id, trabajoId),
      inArray(adminEscolarTrabajos.estado, ['pendiente', 'corriendo']),
      sql`(${adminEscolarTrabajos.ocupadoHasta} IS NULL OR ${adminEscolarTrabajos.ocupadoHasta} < now())`,
    ))
    .returning();
  return t ?? null;
}

/** Lo que falta de UN alumno. Devuelve qué se le completó. */
async function completarAlumno(teamId: number, cli: SigerdClient, a: {
  id: number; sigerdId: number; fechaNacimiento: string | null; sexo: string | null; tieneTutores: boolean;
}, precargar: boolean) {
  let ficha = false;
  if (!a.fechaNacimiento || !a.sexo) {
    const f = await traerFichaEstudiante(cli, a.sigerdId, { precargar });
    if (f && (f.fechaNacimiento || f.sexoNormalizado)) {
      // Solo lo que está vacío: lo que el colegio corrigió a mano no se pisa.
      await db.update(adminEscolarEstudiantes)
        .set({
          fechaNacimiento: sql`COALESCE(${adminEscolarEstudiantes.fechaNacimiento}, ${f.fechaNacimiento})`,
          sexo: sql`COALESCE(${adminEscolarEstudiantes.sexo}, ${f.sexoNormalizado})`,
          updatedAt: new Date(),
        })
        .where(and(eq(adminEscolarEstudiantes.id, a.id), eq(adminEscolarEstudiantes.teamId, teamId)));
      ficha = true;
    }
  }

  let atados = 0;
  let sinEnSigerd = false;
  if (!a.tieneTutores) {
    const tutores = await traerTutoresDeSigerd(teamId, cli, a.sigerdId);
    sinEnSigerd = tutores.length === 0;
    for (const t of tutores) {
      const filas = await db.insert(adminEscolarEstudianteTutores)
        .values({ teamId, estudianteId: a.id, tutorId: t.tutorId, relacion: t.relacion })
        .onConflictDoNothing()
        .returning({ id: adminEscolarEstudianteTutores.id });
      atados += filas.length;
    }
  }
  return { ficha, atados, sinEnSigerd };
}

/**
 * Una pasada: toma el candado, avanza lo que quepa en `presupuestoMs` y lo
 * suelta. Devuelve el trabajo como quedó (o `null` si otra pasada lo tenía).
 */
export async function avanzarFamilias(trabajoId: number, presupuestoMs: number) {
  const inicio = Date.now();
  const t = await tomar(trabajoId);
  if (!t) return null;
  const teamId = t.teamId;
  const resumen: ResumenFamilias = { ...resumenVacio(), ...(t.resumen as Partial<ResumenFamilias>) };
  let cursor = t.cursorId;
  let hechos = t.hechos;
  let terminado = false;
  let error: string | null = null;
  let cancelado = false;

  const guardar = async (final: Partial<typeof adminEscolarTrabajos.$inferInsert> = {}) => {
    const filas = await db.update(adminEscolarTrabajos)
      .set({ cursorId: cursor, hechos, resumen, ultimoError: error, updatedAt: new Date(), ...final })
      .where(and(eq(adminEscolarTrabajos.id, trabajoId), eq(adminEscolarTrabajos.estado, 'corriendo')))
      .returning({ id: adminEscolarTrabajos.id });
    // Alguien lo canceló mientras corría: se deja como esté.
    if (filas.length === 0) cancelado = true;
  };

  try {
    const r = await conClienteSigerd(teamId, async (cli) => {
      let seguidos = 0;
      let primero = true;
      while (!cancelado && Date.now() - inicio < presupuestoMs) {
        const tanda = await db.select({
            id: adminEscolarEstudiantes.id,
            sigerdId: adminEscolarEstudiantes.sigerdId,
            nombre: sql<string>`${adminEscolarEstudiantes.nombres} || ' ' || ${adminEscolarEstudiantes.apellidos}`,
            fechaNacimiento: adminEscolarEstudiantes.fechaNacimiento,
            sexo: adminEscolarEstudiantes.sexo,
            tieneTutores,
          })
          .from(adminEscolarEstudiantes)
          .where(and(candidatos(teamId), gt(adminEscolarEstudiantes.id, cursor)))
          .orderBy(asc(adminEscolarEstudiantes.id))
          .limit(10);
        if (tanda.length === 0) { terminado = true; break; }

        for (const a of tanda) {
          if (cancelado || Date.now() - inicio >= presupuestoMs) break;
          try {
            const hecho = await completarAlumno(teamId, cli, { ...a, sigerdId: a.sigerdId! }, primero);
            primero = false;
            seguidos = 0;
            if (hecho.ficha) resumen.ficha++;
            if (hecho.atados > 0) { resumen.conTutores++; resumen.tutores += hecho.atados; }
            if (hecho.sinEnSigerd) resumen.sinTutoresEnSigerd++;
          } catch (e) {
            // La sesión caída o sin credenciales no es de este alumno: corta la pasada.
            if (e instanceof SigerdError && e.codigo === 'sesion-expirada') throw e;
            seguidos++;
            resumen.errores++;
            resumen.fallidos = [...resumen.fallidos, {
              estudianteId: a.id, nombre: a.nombre, error: e instanceof Error ? e.message : 'Error',
            }].slice(-20);
            if (seguidos >= MAX_FALLOS_SEGUIDOS) {
              // El portal no contesta: se para sin avanzar el cursor de este y lo
              // reintenta el cron. Los anteriores ya quedaron contados.
              error = 'SIGERD no responde: se sigue solo en unos minutos.';
              return;
            }
          }
          cursor = a.id;
          hechos++;
          await guardar();
        }
      }
    }, { soloCredenciales: true });

    if (r === null) {
      error = 'Este colegio no tiene guardadas sus credenciales de SIGERD (Configuración → SIGERD).';
      await guardar({ estado: 'fallo', ocupadoHasta: null, terminadoAt: new Date() });
    } else if (terminado) {
      await guardar({ estado: 'hecho', ocupadoHasta: null, terminadoAt: new Date() });
    } else {
      await guardar({ ocupadoHasta: null });
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'No se pudo hablar con SIGERD';
    const credenciales = e instanceof SigerdError && e.codigo === 'sesion-expirada';
    // Credenciales malas no se arreglan solas; un portal caído sí.
    await guardar(credenciales
      ? { estado: 'fallo', ocupadoHasta: null, terminadoAt: new Date() }
      : { ocupadoHasta: null });
  }
  return trabajoDeFamilias(teamId);
}

/** Para el cron: los trabajos en marcha de todos los colegios, mientras quede tiempo. */
export async function avanzarFamiliasPendientes(presupuestoMs: number) {
  const inicio = Date.now();
  const activos = await db.select({ id: adminEscolarTrabajos.id }).from(adminEscolarTrabajos)
    .where(and(
      eq(adminEscolarTrabajos.tipo, TIPO_FAMILIAS),
      inArray(adminEscolarTrabajos.estado, ['pendiente', 'corriendo']),
    ))
    .orderBy(asc(adminEscolarTrabajos.updatedAt));
  let avanzados = 0;
  for (const { id } of activos) {
    const queda = presupuestoMs - (Date.now() - inicio);
    if (queda < 20_000) break;
    if (await avanzarFamilias(id, queda)) avanzados++;
  }
  return { activos: activos.length, avanzados };
}
