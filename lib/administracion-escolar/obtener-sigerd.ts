/**
 * "Obtener información" — trae TODO el centro de SIGERD y lo guarda en las tablas
 * NUEVAS `sigerd_*` (mirror fiel), para no reconectar. Un clic hace todo.
 *
 * NO toca el módulo escolar (`admin_escolar_*`). Proyectar el mirror al módulo
 * escolar es un paso APARTE (la "sincronización"), que se hará después con su
 * propia vista previa y confirmación.
 *
 * Qué escribe:
 *   - `sigerd_importaciones.dump` — snapshot JSONB con TODO (estructura,
 *     estudiantes, condición, personal, fichas).
 *   - `sigerd_personal` — empleados desglosados, consultables.
 *
 * REGLAS DE CONCURRENCIA (pedidas explícitamente):
 *  - Una sincronización por colegio a la vez. Si el colegio ya tiene una
 *    corriendo, se rechaza con `ya-corriendo`.
 *  - Solo una corriendo en TODO el sistema a la vez (protege la IP ante SIGERD).
 *    Si hay otra de cualquier colegio, se rechaza con `otra-en-curso` → "espera".
 *  - Si SIGERD falla (caído/red/sesión), queda en `error` con mensaje
 *    "continuaremos cuando vuelva SIGERD"; el colegio reintenta luego.
 *
 * El candado es la fila de `sigerd_importaciones` en estado `corriendo`. Una
 * fila `corriendo` más vieja que `LOCK_TTL_MIN` se considera muerta (crash) y se
 * puede reclamar.
 */
import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { sigerdImportaciones, sigerdPersonal } from '@/lib/db/schema';
import type { DumpCentro } from '@/lib/sigerd/descargar';
import { descargarTodo } from '@/lib/sigerd/descargar';
import type { SigerdClient } from '@/lib/sigerd/client';
import { SigerdError } from '@/lib/sigerd/types';

/** Fila `corriendo` más vieja que esto se considera muerta (crash) y se reclama. */
const LOCK_TTL_MIN = 15;

export type MotivoRechazo = 'ya-corriendo' | 'otra-en-curso';

export class SyncOcupadoError extends Error {
  readonly motivo: MotivoRechazo;
  constructor(motivo: MotivoRechazo, mensaje: string) {
    super(mensaje);
    this.name = 'SyncOcupadoError';
    this.motivo = motivo;
  }
}

export interface EstadoObtencion {
  estado: 'pendiente' | 'corriendo' | 'error' | 'completado' | 'ninguno';
  mensaje: string | null;
  anoAcademico: number | null;
  nEstudiantes: number | null;
  nSecciones: number | null;
  nEmpleados: number | null;
  completadoEn: string | null;
}

/** Estado de la última obtención del colegio, para la UI. */
export async function estadoObtencion(teamId: number): Promise<EstadoObtencion> {
  // Proyecta SOLO las columnas que la UI usa. Nunca traigas `dump` aquí: pesa
  // 2-5 MB con las fichas y esto corre en cada carga de la pantalla.
  const [row] = await db
    .select({
      estado: sigerdImportaciones.estado,
      mensaje: sigerdImportaciones.mensaje,
      anoAcademico: sigerdImportaciones.anoAcademico,
      nEstudiantes: sigerdImportaciones.nEstudiantes,
      nSecciones: sigerdImportaciones.nSecciones,
      nEmpleados: sigerdImportaciones.nEmpleados,
      completadoEn: sigerdImportaciones.completadoEn,
    })
    .from(sigerdImportaciones)
    .where(eq(sigerdImportaciones.teamId, teamId))
    .orderBy(sql`${sigerdImportaciones.updatedAt} DESC`)
    .limit(1);

  if (!row) {
    return { estado: 'ninguno', mensaje: null, anoAcademico: null, nEstudiantes: null, nSecciones: null, nEmpleados: null, completadoEn: null };
  }
  return {
    estado: row.estado as EstadoObtencion['estado'],
    mensaje: row.mensaje,
    anoAcademico: row.anoAcademico,
    nEstudiantes: row.nEstudiantes,
    nSecciones: row.nSecciones,
    nEmpleados: row.nEmpleados,
    completadoEn: row.completadoEn?.toISOString() ?? null,
  };
}

/**
 * Reclama el candado atómicamente. Lanza `SyncOcupadoError` si el colegio ya
 * tiene una corriendo, o si hay otra corriendo en el sistema. Devuelve el id de
 * la fila reclamada.
 */
async function reclamarCandado(teamId: number, anoAcademico: number): Promise<number> {
  return await db.transaction(async (tx) => {
    // Bloquea las filas 'corriendo' para decidir sin carreras.
    const corriendo = await tx
      .select({
        id: sigerdImportaciones.id,
        teamId: sigerdImportaciones.teamId,
        iniciadoEn: sigerdImportaciones.iniciadoEn,
      })
      .from(sigerdImportaciones)
      .where(eq(sigerdImportaciones.estado, 'corriendo'))
      .for('update');

    const ahora = Date.now();
    const vivas = corriendo.filter(
      (c) => c.iniciadoEn && ahora - c.iniciadoEn.getTime() < LOCK_TTL_MIN * 60_000,
    );

    if (vivas.some((c) => c.teamId === teamId)) {
      throw new SyncOcupadoError('ya-corriendo', 'Este colegio ya tiene una sincronización en curso.');
    }
    if (vivas.length > 0) {
      throw new SyncOcupadoError(
        'otra-en-curso',
        'Hay otra sincronización en curso en el sistema. Espera a que termine e inténtalo de nuevo.',
      );
    }

    // Upsert de la fila del colegio (por team+año) → 'corriendo'.
    const [existente] = await tx
      .select({ id: sigerdImportaciones.id })
      .from(sigerdImportaciones)
      .where(and(eq(sigerdImportaciones.teamId, teamId), eq(sigerdImportaciones.anoAcademico, anoAcademico)))
      .limit(1);

    if (existente) {
      await tx
        .update(sigerdImportaciones)
        .set({ estado: 'corriendo', mensaje: 'Sincronizando…', iniciadoEn: new Date(), updatedAt: new Date() })
        .where(eq(sigerdImportaciones.id, existente.id));
      return existente.id;
    }

    const [creada] = await tx
      .insert(sigerdImportaciones)
      .values({
        teamId,
        anoAcademico,
        estado: 'corriendo',
        mensaje: 'Sincronizando…',
        iniciadoEn: new Date(),
      })
      .returning({ id: sigerdImportaciones.id });
    return creada.id;
  });
}

export interface ResultadoObtencion {
  estado: 'completado';
  anoAcademico: number;
  nEstudiantes: number;
  nSecciones: number;
  nEmpleados: number;
}

/**
 * Obtiene TODO el centro y lo guarda. Reclama el candado, descarga, proyecta a
 * las tablas del app y guarda el snapshot fiel. Marca `error` (sin lanzar) si
 * SIGERD falla, con mensaje amable para reintentar.
 */
export async function obtenerInformacion(
  cli: SigerdClient,
  params: { teamId: number; anoAcademico: number },
): Promise<ResultadoObtencion | { estado: 'error'; mensaje: string }> {
  const { teamId, anoAcademico } = params;

  // 1) CANDADO PRIMERO — antes de tocar SIGERD. Así dos flujos concurrentes no
  //    corrompen la sesión compartida del portal. (puede lanzar SyncOcupadoError)
  const importacionId = await reclamarCandado(teamId, anoAcademico);

  try {
    // 2) contexto del centro + descarga completa
    const { contextoCentroSesion } = await import('@/lib/sigerd/personal');
    const ctx = await contextoCentroSesion(cli);

    const dump = await descargarTodo(cli, {
      anoAcademico,
      conPersonal: true,
      conCondicionFinal: true,
      conFichaPersonal: true,
      conFichaEstudiante: true,
      // Responsables (padre/madre/tutor) al dump. OJO: +3 peticiones por
      // estudiante (~1400) → obtener tarda mucho y en prod pasa el maxDuration.
      conParientes: true,
    });

    // 3) proyección + snapshot en una transacción
    await guardarMirror(teamId, importacionId, ctx.idRegional, ctx.idDistrito, dump);

    return {
      estado: 'completado',
      anoAcademico,
      nEstudiantes: dump.totales.estudiantes,
      nSecciones: dump.totales.secciones,
      nEmpleados: dump.totales.empleados,
    };
  } catch (e) {
    console.error('[obtener-sigerd] fallo al guardar:', e);
    const mensaje =
      e instanceof SigerdError
        ? 'SIGERD no está disponible ahora. Continuaremos automáticamente cuando vuelva; intenta de nuevo en unos minutos.'
        : 'Ocurrió un error guardando la información. Intenta de nuevo.';

    await db
      .update(sigerdImportaciones)
      .set({ estado: 'error', mensaje, updatedAt: new Date() })
      .where(eq(sigerdImportaciones.id, importacionId));

    return { estado: 'error', mensaje };
  }
}

/**
 * Guarda el MIRROR: personal desglosado + snapshot fiel. NO toca el módulo
 * escolar (`admin_escolar_*`); eso es el paso aparte de sincronización.
 * Todo en una transacción.
 */
async function guardarMirror(
  teamId: number,
  importacionId: number,
  idRegional: number,
  idDistrito: number,
  dump: DumpCentro,
): Promise<void> {
  await db.transaction(async (tx) => {
    // ── Personal: se reemplaza entero (pocas filas, siempre fresco) ──
    // El grid da una fila por (persona, puesto): un empleado con varios cargos
    // aparece repetido con el mismo Id. Dedup por Id (gana el primero).
    await tx
      .delete(sigerdPersonal)
      .where(and(eq(sigerdPersonal.teamId, teamId), eq(sigerdPersonal.idCentro, dump.contexto.idCentro)));

    const fichaPorId = new Map(dump.personalFichas.map((f) => [f.idPersona, f]));
    const personalUnico = [...new Map(dump.personal.map((e) => [e.Id, e])).values()];
    if (personalUnico.length) {
      await tx.insert(sigerdPersonal).values(
        personalUnico.map((emp) => {
          const f = fichaPorId.get(emp.Id);
          return {
            teamId,
            idCentro: dump.contexto.idCentro,
            sigerdIdPersona: emp.Id,
            cedula: emp.Cedula ?? f?.cedula ?? null,
            nombres: f?.primerNombre ?? emp.NombreCompleto ?? null,
            apellidos: f ? [f.primerApellido, f.segundoApellido].filter(Boolean).join(' ') || null : null,
            cargo: emp.Cargo ?? null,
            estado: emp.Estado ?? null,
            sexo: f?.sexo ?? null,
            fechaNacimiento: f?.fechaNacimiento ?? null,
            nacionalidad: f?.nacionalidad ?? null,
            telefono: f?.telefono ?? null,
            email: f?.email ?? null,
          };
        }),
      );
    }

    // ── Snapshot fiel (dump JSONB con TODO) + marca completado ──
    await tx
      .update(sigerdImportaciones)
      .set({
        estado: 'completado',
        mensaje: null,
        idCentro: dump.contexto.idCentro,
        idRegional,
        idDistrito,
        dump: dump as unknown as Record<string, unknown>,
        nEstudiantes: dump.totales.estudiantes,
        nSecciones: dump.totales.secciones,
        nEmpleados: dump.totales.empleados,
        completadoEn: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sigerdImportaciones.id, importacionId));
  });
}
