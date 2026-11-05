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
 *  - Si SIGERD contesta a medias (secciones sin leer, o cero estudiantes o
 *    empleados donde había), también queda en `error` y se conserva la
 *    anterior: ver `motivoDescargaIncompleta`. Se decide al traer la
 *    estructura y el personal, antes de pedir las fichas.
 *
 * El candado es la fila de `sigerd_importaciones` en estado `corriendo`. Una
 * fila `corriendo` sin señal de vida (`updated_at`) en `LOCK_TTL_MIN` se
 * considera muerta (crash) y se puede reclamar.
 *
 * POR TANDAS. Un centro grande no cabe en una llamada de Vercel (300 s): cada
 * ficha es una petición. La primera llamada (`obtenerInformacion`) trae la
 * estructura y el personal y avanza fichas hasta `PRESUPUESTO_MS`; si quedan,
 * responde `corriendo` con el avance y la pantalla llama a
 * `continuarObtencion` hasta terminar. Lo ya traído viaja en
 * `dump.__parcial`, AL LADO del volcado anterior: los lectores leen las claves
 * de siempre (`estructura`, `puestos`…) y siguen viendo la descarga buena
 * hasta que `guardarMirror` reemplaza el volcado entero al final.
 */
import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { sigerdImportaciones, sigerdPersonal } from '@/lib/db/schema';
import { invalidarSigerd } from '@/lib/cache/escolar';
import type { DumpCentro } from '@/lib/sigerd/descargar';
import { armarDump, avanzarDescarga, iniciarDescarga, type DescargaParcial } from '@/lib/sigerd/descargar';
import { motivoDescargaIncompleta, type TotalesDescarga } from '@/lib/sigerd/descarga-incompleta';
import type { SigerdClient } from '@/lib/sigerd/client';
import { SigerdError } from '@/lib/sigerd/types';

/** Fila `corriendo` sin señal de vida en este tiempo se considera muerta (crash) y se reclama. */
const LOCK_TTL_MIN = 15;

/**
 * Tiempo de cada llamada para pedir fichas. Una petición al portal puede tardar
 * hasta 30 s y se reintenta 3 veces (~90 s en el peor caso): con 180 s de
 * presupuesto la llamada termina antes de los 300 s de Vercel aunque la última
 * ficha sea la peor.
 */
const PRESUPUESTO_MS = 180_000;

/** Cada cuánto se guarda lo traído dentro de una tanda: si Vercel la corta, se pierde poco. */
const GUARDAR_CADA_MS = 45_000;

/**
 * Una tanda reclamada sin terminar en este tiempo se da por muerta (la función
 * dura como mucho 300 s) y otra llamada puede retomarla.
 */
const TANDA_TTL_MIN = 6;

/**
 * ¿Esta fila `corriendo` ya no puede estar viva? Se mide desde su última señal
 * (`updated_at`, que cada tanda renueva): una descarga por tandas de un centro
 * grande dura más que el TTL, pero nunca pasa tanto sin escribir. Sin fecha se
 * da por muerta, como hacía ya el candado.
 */
export function candadoVencido(ultimaSenal: Date | null, ahora: number): boolean {
  return !ultimaSenal || ahora - ultimaSenal.getTime() >= LOCK_TTL_MIN * 60_000;
}

export type MotivoRechazo = 'ya-corriendo' | 'otra-en-curso';

/**
 * `continuarObtencion` sin nada que continuar (`nada-en-curso`), o con la tanda
 * ya tomada por otra llamada —otra pestaña— (`tanda-en-curso`).
 */
export class SinTandaError extends Error {
  readonly motivo: 'nada-en-curso' | 'tanda-en-curso';
  constructor(motivo: 'nada-en-curso' | 'tanda-en-curso', mensaje: string) {
    super(mensaje);
    this.name = 'SinTandaError';
    this.motivo = motivo;
  }
}

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
  /**
   * Hay una descarga buena guardada, aunque el último intento de actualizarla
   * esté corriendo o haya fallado (el volcado anterior se conserva).
   */
  conDescarga: boolean;
  mensaje: string | null;
  anoAcademico: number | null;
  nEstudiantes: number | null;
  nSecciones: number | null;
  nEmpleados: number | null;
  completadoEn: string | null;
  /** Mientras corre por tandas: cuántas fichas van de cuántas. */
  progreso: { hechos: number; total: number } | null;
}

/** Estado de la última obtención del colegio, para la UI. */
export async function estadoObtencion(teamId: number): Promise<EstadoObtencion> {
  // Proyecta SOLO las columnas que la UI usa. Nunca traigas `dump` aquí: pesa
  // 2-5 MB con las fichas y esto corre en cada carga de la pantalla.
  const [row] = await db
    .select({
      estado: sigerdImportaciones.estado,
      // `estructura` y no `dump IS NOT NULL`: la primera descarga, a medias,
      // ya tiene volcado (solo `__parcial`) y no hay nada bueno guardado.
      conDescarga: sql<boolean>`${sigerdImportaciones.dump} -> 'estructura' IS NOT NULL`,
      mensaje: sigerdImportaciones.mensaje,
      anoAcademico: sigerdImportaciones.anoAcademico,
      nEstudiantes: sigerdImportaciones.nEstudiantes,
      nSecciones: sigerdImportaciones.nSecciones,
      nEmpleados: sigerdImportaciones.nEmpleados,
      completadoEn: sigerdImportaciones.completadoEn,
      ultimaSenal: sigerdImportaciones.updatedAt,
      total: sql<number | null>`(${sigerdImportaciones.dump} #>> '{__parcial,total}')::int`,
      pendientes: sql<number | null>`jsonb_array_length(${sigerdImportaciones.dump} #> '{__parcial,pendientes}')`,
    })
    .from(sigerdImportaciones)
    .where(eq(sigerdImportaciones.teamId, teamId))
    .orderBy(sql`${sigerdImportaciones.updatedAt} DESC`)
    .limit(1);

  if (!row) {
    return { estado: 'ninguno', conDescarga: false, mensaje: null, anoAcademico: null, nEstudiantes: null, nSecciones: null, nEmpleados: null, completadoEn: null, progreso: null };
  }

  // Una fila `corriendo` más vieja que el candado es una descarga muerta: Vercel
  // la cortó por tiempo y no llegó a marcar `error`. El candado ya la da por
  // muerta; la pantalla también tiene que hacerlo, o enseña «Sincronizando…»
  // con el botón deshabilitado para siempre y el colegio no puede reintentar.
  const muerta = row.estado === 'corriendo' && candadoVencido(row.ultimaSenal, Date.now());
  return {
    estado: muerta ? 'error' : (row.estado as EstadoObtencion['estado']),
    conDescarga: row.conDescarga === true,
    mensaje: muerta ? 'La descarga anterior se interrumpió. Vuelve a intentarlo.' : row.mensaje,
    anoAcademico: row.anoAcademico,
    nEstudiantes: row.nEstudiantes,
    nSecciones: row.nSecciones,
    nEmpleados: row.nEmpleados,
    completadoEn: row.completadoEn?.toISOString() ?? null,
    progreso: row.estado === 'corriendo' && !muerta && row.total != null && row.pendientes != null
      ? { hechos: Number(row.total) - Number(row.pendientes), total: Number(row.total) }
      : null,
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
        ultimaSenal: sigerdImportaciones.updatedAt,
      })
      .from(sigerdImportaciones)
      .where(eq(sigerdImportaciones.estado, 'corriendo'))
      .for('update');

    const ahora = Date.now();
    const vivas = corriendo.filter((c) => !candadoVencido(c.ultimaSenal, ahora));

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

/** Quedan fichas: la pantalla vuelve a llamar a `continuarObtencion`. */
export interface ObtencionEnCurso {
  estado: 'corriendo';
  hechos: number;
  total: number;
}

export type RespuestaObtencion = ResultadoObtencion | ObtencionEnCurso | { estado: 'error'; mensaje: string };

/** Lo que se guarda en `dump.__parcial` entre tandas. */
interface ParcialGuardado extends DescargaParcial {
  idRegional: number;
  idDistrito: number;
  /** Cuándo la tomó la tanda que la está avanzando (ISO); null = libre. */
  tandaDesde: string | null;
}

/**
 * Empieza a obtener TODO el centro. Reclama el candado, trae la estructura y el
 * personal, y avanza fichas hasta el presupuesto. Si caben todas, guarda el
 * mirror y responde `completado`, como antes; si no, guarda el avance y
 * responde `corriendo`. Marca `error` (sin lanzar) si SIGERD falla, con mensaje
 * amable para reintentar.
 */
export async function obtenerInformacion(
  cli: SigerdClient,
  params: { teamId: number; anoAcademico: number },
): Promise<RespuestaObtencion> {
  const { teamId, anoAcademico } = params;
  const hasta = Date.now() + PRESUPUESTO_MS;

  // 1) CANDADO PRIMERO — antes de tocar SIGERD. Así dos flujos concurrentes no
  //    corrompen la sesión compartida del portal. (puede lanzar SyncOcupadoError)
  const importacionId = await reclamarCandado(teamId, anoAcademico);

  try {
    // 2) contexto del centro + estructura y personal (pocas peticiones)
    const { contextoCentroSesion } = await import('@/lib/sigerd/personal');
    const ctx = await contextoCentroSesion(cli);

    const base = await iniciarDescarga(cli, {
      anoAcademico,
      conPersonal: true,
      conCondicionFinal: true,
      conFichaPersonal: true,
      conFichaEstudiante: true,
      // Sin responsables: +3 peticiones por estudiante pasaban el maxDuration
      // (300 s) de Vercel. La función moría sin llegar al `catch` y la fila se
      // quedaba en «corriendo» para siempre. Además en prod no traían nada:
      // las últimas descargas buenas llegaron sin ningún responsable.
    });
    // Una descarga a medias no pisa una buena. Lo que decide (secciones sin
    // leer, alumnos y personal) ya está aquí: se corta antes de pedir cientos
    // de fichas, y la anterior sigue sirviendo para matricular.
    const anterior = await totalesAnteriores(teamId, anoAcademico);
    const motivo = motivoDescargaIncompleta(totalesDe(base), anterior);
    if (motivo && anterior) {
      return await cerrarConError(importacionId, `${motivo} Se conserva la descarga anterior; intenta de nuevo en un rato.`);
    }

    const parcial: ParcialGuardado = {
      ...base,
      idRegional: ctx.idRegional,
      idDistrito: ctx.idDistrito,
      tandaDesde: new Date().toISOString(),
    };
    await guardarParcial(importacionId, parcial);

    // 3) fichas hasta el presupuesto
    return await avanzarYGuardar(cli, teamId, importacionId, parcial, hasta);
  } catch (e) {
    return await marcarError(importacionId, e);
  }
}

/**
 * Sigue una obtención por tandas donde quedó. Toma la tanda de forma atómica:
 * dos pestañas con la pantalla abierta no piden las mismas fichas a la vez.
 * Lanza `SinTandaError` si no hay nada que seguir o si otra llamada la tiene.
 */
export async function continuarObtencion(
  cli: SigerdClient,
  params: { teamId: number },
): Promise<RespuestaObtencion> {
  const hasta = Date.now() + PRESUPUESTO_MS;
  const { teamId } = params;

  const tomadas = await db.execute(sql`
    UPDATE sigerd_importaciones
       SET dump = jsonb_set(dump, '{__parcial,tandaDesde}', to_jsonb(now()::text)),
           updated_at = now()
     WHERE team_id = ${teamId}
       AND estado = 'corriendo'
       AND dump -> '__parcial' IS NOT NULL
       AND (
         dump #>> '{__parcial,tandaDesde}' IS NULL
         OR (dump #>> '{__parcial,tandaDesde}')::timestamptz < now() - make_interval(mins => ${TANDA_TTL_MIN})
       )
    RETURNING id, dump -> '__parcial' AS parcial
  `);
  const fila = (tomadas as unknown as { id: number; parcial: ParcialGuardado | string }[])[0];

  if (!fila) {
    const [enCurso] = await db
      .select({ id: sigerdImportaciones.id })
      .from(sigerdImportaciones)
      .where(and(
        eq(sigerdImportaciones.teamId, teamId),
        eq(sigerdImportaciones.estado, 'corriendo'),
        sql`${sigerdImportaciones.dump} -> '__parcial' IS NOT NULL`,
      ))
      .limit(1);
    throw enCurso
      ? new SinTandaError('tanda-en-curso', 'La descarga ya está avanzando en otra pestaña.')
      : new SinTandaError('nada-en-curso', 'No hay ninguna descarga de SIGERD a medias.');
  }

  const parcial = (typeof fila.parcial === 'string' ? JSON.parse(fila.parcial) : fila.parcial) as ParcialGuardado;
  try {
    return await avanzarYGuardar(cli, teamId, fila.id, parcial, hasta);
  } catch (e) {
    return await marcarError(fila.id, e);
  }
}

/**
 * Avanza fichas hasta `hasta`, guardando cada `GUARDAR_CADA_MS` (si Vercel corta
 * la llamada, lo ya guardado no se repite). Sin pendientes, cierra la descarga.
 */
async function avanzarYGuardar(
  cli: SigerdClient,
  teamId: number,
  importacionId: number,
  parcial: ParcialGuardado,
  hasta: number,
): Promise<RespuestaObtencion> {
  while (parcial.pendientes.length > 0 && Date.now() < hasta) {
    await avanzarDescarga(cli, parcial, Math.min(hasta, Date.now() + GUARDAR_CADA_MS));
    if (parcial.pendientes.length > 0) await guardarParcial(importacionId, parcial);
  }

  if (parcial.pendientes.length > 0) {
    await guardarParcial(importacionId, { ...parcial, tandaDesde: null });
    return { estado: 'corriendo', hechos: parcial.total - parcial.pendientes.length, total: parcial.total };
  }

  // Proyección + snapshot en una transacción. Reemplaza el volcado entero:
  // el `__parcial` desaparece con él.
  const dump = armarDump(parcial);
  // Sin descarga anterior que proteger se guarda lo que llegó, con el aviso de
  // lo que faltó (si faltó algo).
  const aviso = motivoDescargaIncompleta(totalesDe(parcial), null);
  await guardarMirror(teamId, importacionId, parcial.idRegional, parcial.idDistrito, dump, aviso);

  // El plan del asistente (`/api/sigerd/plan`) se sirve de caché por etiqueta y
  // solo el cruce la invalidaba. Sin esto, una descarga recién terminada seguía
  // viéndose como «Todavía no hay nada descargado».
  invalidarSigerd(teamId);

  return {
    estado: 'completado',
    anoAcademico: parcial.anoAcademico,
    nEstudiantes: dump.totales.estudiantes,
    nSecciones: dump.totales.secciones,
    nEmpleados: dump.totales.empleados,
  };
}

/**
 * Guarda el avance en `dump.__parcial`, sin tocar las demás claves: ahí sigue el
 * volcado de la descarga anterior, que es el que leen las pantallas hasta que
 * esta termine. Renueva `updated_at`, que es la señal de vida del candado.
 */
async function guardarParcial(importacionId: number, parcial: ParcialGuardado): Promise<void> {
  const hechos = parcial.total - parcial.pendientes.length;
  await db.execute(sql`
    UPDATE sigerd_importaciones
       SET dump = (coalesce(dump, '{}'::jsonb) - '__parcial') || jsonb_build_object('__parcial', ${JSON.stringify(parcial)}::jsonb),
           mensaje = ${`Descargando fichas: ${hechos} de ${parcial.total}…`},
           updated_at = now()
     WHERE id = ${importacionId}
  `);
}

/** Lo que decide si una descarga está completa: sale de la estructura y del personal. */
function totalesDe(d: Pick<DescargaParcial, 'estructura' | 'personal'>): TotalesDescarga {
  return {
    secciones: d.estructura.totales.secciones,
    estudiantes: d.estructura.totales.estudiantes,
    empleados: d.personal.length,
    seccionesConError: d.estructura.totales.seccionesConError,
  };
}

/**
 * Los totales de la descarga buena con la que comparar, o `null` si el colegio
 * nunca tuvo una. Prefiere la del mismo año escolar (`ano_academico` es el id del año en SIGERD). Si solo hay de otro año
 * devuelve `{}`: se protege contra secciones con error, no contra el cero de un
 * año que empieza. Solo el JSON de totales: el volcado entero pesa megas.
 */
async function totalesAnteriores(teamId: number, anoAcademico: number): Promise<Partial<TotalesDescarga> | null> {
  const filas = await db.execute(sql`
    SELECT dump -> 'totales' AS totales, ano_academico = ${anoAcademico} AS "mismoAno"
      FROM sigerd_importaciones
     WHERE team_id = ${teamId} AND dump -> 'totales' IS NOT NULL
     ORDER BY (ano_academico = ${anoAcademico}) DESC, completado_en DESC NULLS LAST
     LIMIT 1
  `);
  const fila = (filas as unknown as { totales: Partial<TotalesDescarga> | string; mismoAno: boolean }[])[0];
  if (!fila) return null;
  if (!fila.mismoAno) return {};
  return typeof fila.totales === 'string' ? JSON.parse(fila.totales) : fila.totales;
}

/** Error de SIGERD o de guardado: la fila queda en `error` con la descarga anterior intacta. */
async function marcarError(importacionId: number, e: unknown): Promise<{ estado: 'error'; mensaje: string }> {
  console.error('[obtener-sigerd] fallo al guardar:', e);
  const mensaje =
    e instanceof SigerdError
      ? 'SIGERD no está disponible ahora. Continuaremos automáticamente cuando vuelva; intenta de nuevo en unos minutos.'
      : 'Ocurrió un error guardando la información. Intenta de nuevo.';
  return cerrarConError(importacionId, mensaje);
}

/** La fila queda en `error` con `mensaje`; se quita el avance y se conserva el volcado anterior. */
async function cerrarConError(importacionId: number, mensaje: string): Promise<{ estado: 'error'; mensaje: string }> {
  await db.execute(sql`
    UPDATE sigerd_importaciones
       SET estado = 'error', mensaje = ${mensaje},
           dump = CASE WHEN dump IS NULL THEN NULL
                       WHEN (dump - '__parcial') = '{}'::jsonb THEN NULL
                       ELSE dump - '__parcial' END,
           updated_at = now()
     WHERE id = ${importacionId}
  `);

  return { estado: 'error', mensaje };
}

/**
 * Guarda el MIRROR: personal desglosado + snapshot fiel. NO toca el módulo
 * escolar (`admin_escolar_*`); eso es el paso aparte de sincronización.
 * Todo en una transacción. `aviso`: lo que faltó en una primera descarga que
 * se guarda igual por no haber otra.
 */
async function guardarMirror(
  teamId: number,
  importacionId: number,
  idRegional: number,
  idDistrito: number,
  dump: DumpCentro,
  aviso: string | null,
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
        mensaje: aviso,
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
