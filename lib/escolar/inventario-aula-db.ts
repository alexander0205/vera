/**
 * Inventario por aula: lo que toca la base. Lo puro (totales, «reponer pronto»,
 * dividir una ficha) está en `inventario-aula.ts`.
 *
 * Todo filtra por `team_id`. Todo exige la migración 0236 (y la 0225): sin ellas
 * las funciones lanzan `PlantaError` con 503 y las pantallas ni se enseñan.
 *
 * Las fichas son las de activos fijos de contabilidad; aquí solo se les pone aula.
 * Dividir una ficha NO crea asientos: la depreciación ya asentada se reparte entre
 * las dos fichas fila por fila (misma suma, mismo asiento) y el libro queda igual.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { hoyRD } from '@/lib/utils/format';
import { inventarioAulaDisponible } from '@/lib/contabilidad/activos-espacios';
import { generarDepreciacionesPendientes, listarActivosFijos, registrarActivoFijo, type NuevoActivoFijoInput } from '@/lib/contabilidad/depreciacion';
import {
  TrasladoError, dividirFicha, estadoActivoValido, etiquetaSeccion, estadoVisible, resumirInventario, tipoEspacioValido,
  type EspacioBase, type EstadoVisible, type FichaInventario, type ResumenInventario, type TotalesAula,
} from './inventario-aula';

export class PlantaError extends Error {
  constructor(message: string, readonly status = 422) { super(message); this.name = 'PlantaError'; }
}

const n = (v: unknown) => Number(v ?? 0);
const NO_MIGRADO = 'Esta función necesita una actualización de la base que aún no se aplica.';

async function exigirDisponible(): Promise<void> {
  if (!(await inventarioAulaDisponible())) throw new PlantaError(NO_MIGRADO, 503);
}

// ── Secciones y espacios ─────────────────────────────────────────────────────

export interface SeccionColegio {
  cursoId: number;
  etiqueta: string;
  /** Sección de un período, servicio y grado activos: la que se ofrece para asignar. */
  vigente: boolean;
  /** Aula a la que está asignada, si alguna. */
  espacioId: number | null;
  matriculados: number;
}

/** Todas las secciones del colegio con su etiqueta («1.º A · mañana»), su aula y sus alumnos. */
export async function listarSecciones(teamId: number): Promise<SeccionColegio[]> {
  const filas = await db.execute(sql`
    SELECT c.id AS "cursoId", c.nombre AS seccion, g.nombre AS grado, s.tanda,
           (c.activo AND g.activo AND s.activo AND COALESCE(p.activo, true)) AS vigente,
           es.espacio_id AS "espacioId",
           (SELECT count(*) FROM admin_escolar_matriculas m
              JOIN admin_escolar_estudiantes e ON e.id = m.estudiante_id AND e.team_id = m.team_id
             WHERE m.curso_id = c.id AND m.team_id = ${teamId} AND m.estado = 'activa' AND e.estado = 'activo')::int AS matriculados
    FROM admin_escolar_cursos c
    JOIN admin_escolar_grados g ON g.id = c.grado_id
    JOIN admin_escolar_servicios s ON s.id = g.servicio_id
    LEFT JOIN admin_escolar_periodos p ON p.id = s.periodo_id
    LEFT JOIN escolar_espacio_secciones es ON es.curso_id = c.id AND es.team_id = c.team_id
    WHERE c.team_id = ${teamId}
    ORDER BY s.orden, s.nombre, g.orden, g.nombre, c.orden, c.nombre`) as unknown as
    { cursoId: number; seccion: string; grado: string; tanda: string | null; vigente: boolean; espacioId: number | null; matriculados: unknown }[];
  return filas.map((f) => ({
    cursoId: Number(f.cursoId), etiqueta: etiquetaSeccion(f.grado, f.seccion, f.tanda), vigente: f.vigente === true,
    espacioId: f.espacioId == null ? null : Number(f.espacioId), matriculados: n(f.matriculados),
  }));
}

/** Los espacios de la empresa con sus secciones, su responsable y los alumnos de cada sección. */
export async function listarEspacios(teamId: number, opts: { incluirInactivos?: boolean } = {}): Promise<EspacioBase[]> {
  await exigirDisponible();
  const [filas, secciones] = await Promise.all([
    db.execute(sql`
      SELECT e.id, e.nombre, e.tipo, e.capacidad, e.activo, e.responsable_personal_id AS "responsableId",
             NULLIF(trim(COALESCE(p.nombres, '') || ' ' || COALESCE(p.apellidos, '')), '') AS responsable
      FROM escolar_espacios e
      LEFT JOIN escolar_personal p ON p.id = e.responsable_personal_id AND p.team_id = e.team_id
      WHERE e.team_id = ${teamId} ${opts.incluirInactivos ? sql`` : sql`AND e.activo`}
      ORDER BY e.tipo <> 'aula', e.nombre, e.id`) as unknown as
      { id: number; nombre: string; tipo: string; capacidad: number | null; activo: boolean; responsableId: number | null; responsable: string | null }[],
    listarSecciones(teamId),
  ]);
  return filas.map((f) => ({
    id: Number(f.id), nombre: f.nombre, tipo: f.tipo, capacidad: f.capacidad == null ? null : Number(f.capacidad),
    responsableId: f.responsableId == null ? null : Number(f.responsableId), responsable: f.responsable, activo: f.activo,
    secciones: secciones.filter((s) => s.espacioId === Number(f.id)).map((s) => ({ cursoId: s.cursoId, etiqueta: s.etiqueta, matriculados: s.matriculados })),
  }));
}

/** Personal que puede responder por un espacio (el que se agregó a mano en Personal). */
export async function personalParaResponsable(teamId: number): Promise<{ id: number; nombre: string }[]> {
  const filas = await db.execute(sql`
    SELECT id, NULLIF(trim(COALESCE(nombres, '') || ' ' || COALESCE(apellidos, '')), '') AS nombre
    FROM escolar_personal WHERE team_id = ${teamId} ORDER BY nombres, apellidos, id`) as unknown as { id: number; nombre: string | null }[];
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre ?? `Persona ${f.id}` }));
}

export interface EspacioInput {
  nombre?: string;
  tipo?: string;
  capacidad?: number | null;
  responsableId?: number | null;
  activo?: boolean;
}

async function validarEspacio(teamId: number, input: EspacioInput): Promise<void> {
  if (input.tipo !== undefined && !tipoEspacioValido(input.tipo)) throw new PlantaError('El tipo de espacio no es válido.', 400);
  if (input.capacidad != null && (!Number.isInteger(input.capacidad) || input.capacidad < 0 || input.capacidad > 100_000)) {
    throw new PlantaError('La capacidad tiene que ser un número entero.', 400);
  }
  if (input.responsableId != null) {
    const [p] = await db.execute(sql`SELECT id FROM escolar_personal WHERE id = ${input.responsableId} AND team_id = ${teamId}`) as unknown as { id: number }[];
    if (!p) throw new PlantaError('La persona responsable no existe.', 400);
  }
}

export async function crearEspacio(teamId: number, input: EspacioInput & { nombre: string }): Promise<number> {
  await exigirDisponible();
  const nombre = input.nombre.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!nombre) throw new PlantaError('El espacio necesita un nombre.', 400);
  await validarEspacio(teamId, input);
  const [r] = await db.execute(sql`
    INSERT INTO escolar_espacios (team_id, nombre, tipo, capacidad, responsable_personal_id)
    VALUES (${teamId}, ${nombre}, ${input.tipo ?? 'aula'}, ${input.capacidad ?? null}, ${input.responsableId ?? null})
    RETURNING id`) as unknown as { id: number }[];
  return r.id;
}

export async function editarEspacio(teamId: number, id: number, input: EspacioInput): Promise<void> {
  await exigirDisponible();
  await validarEspacio(teamId, input);
  const sets: ReturnType<typeof sql>[] = [sql`updated_at = now()`];
  if (input.nombre !== undefined) {
    const nombre = input.nombre.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!nombre) throw new PlantaError('El espacio necesita un nombre.', 400);
    sets.push(sql`nombre = ${nombre}`);
  }
  if (input.tipo !== undefined) sets.push(sql`tipo = ${input.tipo}`);
  if (input.capacidad !== undefined) sets.push(sql`capacidad = ${input.capacidad}`);
  if (input.responsableId !== undefined) sets.push(sql`responsable_personal_id = ${input.responsableId}`);
  if (input.activo !== undefined) sets.push(sql`activo = ${input.activo}`);
  const r = await db.execute(sql`UPDATE escolar_espacios SET ${sql.join(sets, sql`, `)} WHERE id = ${id} AND team_id = ${teamId} RETURNING id`) as unknown as unknown[];
  if (r.length === 0) throw new PlantaError('El espacio no existe.', 404);
}

/** Borra un espacio vacío. Con activos dentro no se borra: primero se mueven o se desactiva. */
export async function eliminarEspacio(teamId: number, id: number): Promise<void> {
  await exigirDisponible();
  const [c] = await db.execute(sql`
    SELECT (SELECT count(*) FROM contabilidad_activos_fijos WHERE team_id = ${teamId} AND espacio_id = ${id} AND activa) AS activos`) as unknown as { activos: unknown }[];
  if (n(c?.activos) > 0) {
    throw new PlantaError('Este espacio todavía tiene activos. Muévelos a otra aula primero, o desactívalo en vez de borrarlo.', 409);
  }
  const r = await db.execute(sql`DELETE FROM escolar_espacios WHERE id = ${id} AND team_id = ${teamId} RETURNING id`) as unknown as unknown[];
  if (r.length === 0) throw new PlantaError('El espacio no existe.', 404);
}

/**
 * Deja en el espacio EXACTAMENTE estas secciones. Una sección que estaba en otro
 * espacio se mueve a este (una sección usa un solo aula).
 */
export async function asignarSecciones(teamId: number, espacioId: number, cursoIds: number[]): Promise<void> {
  await exigirDisponible();
  const ids = [...new Set(cursoIds.filter((x) => Number.isSafeInteger(x) && x > 0))];
  const [e] = await db.execute(sql`SELECT id FROM escolar_espacios WHERE id = ${espacioId} AND team_id = ${teamId}`) as unknown as { id: number }[];
  if (!e) throw new PlantaError('El espacio no existe.', 404);
  if (ids.length > 0) {
    const lista = sql.join(ids.map((i) => sql`${i}`), sql`, `);
    const validas = await db.execute(sql`SELECT id FROM admin_escolar_cursos WHERE team_id = ${teamId} AND id IN (${lista})`) as unknown as unknown[];
    if (validas.length !== ids.length) throw new PlantaError('Alguna sección no existe.', 400);
  }
  await db.transaction(async (tx) => {
    if (ids.length > 0) {
      const lista = sql.join(ids.map((i) => sql`${i}`), sql`, `);
      await tx.execute(sql`DELETE FROM escolar_espacio_secciones WHERE team_id = ${teamId} AND espacio_id = ${espacioId} AND curso_id NOT IN (${lista})`);
      for (const c of ids) {
        await tx.execute(sql`
          INSERT INTO escolar_espacio_secciones (team_id, espacio_id, curso_id) VALUES (${teamId}, ${espacioId}, ${c})
          ON CONFLICT (curso_id) DO UPDATE SET espacio_id = EXCLUDED.espacio_id`);
      }
    } else {
      await tx.execute(sql`DELETE FROM escolar_espacio_secciones WHERE team_id = ${teamId} AND espacio_id = ${espacioId}`);
    }
  });
}

/**
 * Arranque rápido: un aula por cada sección vigente que todavía no tiene espacio.
 * Idempotente: una sección que ya está en un espacio no se toca, así que correrlo
 * dos veces no duplica nada. Después el usuario junta las que comparten salón.
 */
export async function crearAulaPorSeccion(teamId: number): Promise<{ creadas: number }> {
  await exigirDisponible();
  const sueltas = (await listarSecciones(teamId)).filter((s) => s.vigente && s.espacioId == null);
  let creadas = 0;
  for (const s of sueltas) {
    const ok = await db.transaction(async (tx) => {
      const [e] = await tx.execute(sql`
        INSERT INTO escolar_espacios (team_id, nombre, tipo) VALUES (${teamId}, ${`Aula ${s.etiqueta}`.slice(0, 120)}, 'aula') RETURNING id`) as unknown as { id: number }[];
      const puesta = await tx.execute(sql`
        INSERT INTO escolar_espacio_secciones (team_id, espacio_id, curso_id) VALUES (${teamId}, ${e.id}, ${s.cursoId})
        ON CONFLICT (curso_id) DO NOTHING RETURNING id`) as unknown as unknown[];
      // Otra corrida se adelantó con esta sección: no se deja un aula huérfana.
      if (puesta.length === 0) { await tx.execute(sql`DELETE FROM escolar_espacios WHERE id = ${e.id}`); return false; }
      return true;
    });
    if (ok) creadas++;
  }
  return { creadas };
}

// ── Inventario ───────────────────────────────────────────────────────────────

export interface FichaDeAula extends FichaInventario {
  ubicacion: string | null;
  estadoVisible: EstadoVisible;
  /** Aula donde está, con nombre (para el detalle). */
  espacioNombre: string | null;
}

function aFicha(r: Awaited<ReturnType<typeof listarActivosFijos>>[number]): FichaInventario {
  return {
    id: r.id, nombre: r.nombre, espacioId: r.espacioId, categoria: r.categoria,
    cantidadVigente: r.cantidadVigente, costoVigenteCents: r.costoVigenteCents, acumuladaVigenteCents: r.acumuladaVigenteCents,
    vidaUtilMeses: r.vidaUtilMeses, fechaAdquisicion: r.fechaAdquisicion,
    soloControl: r.soloControl, estado: r.estado, enRevision: r.enRevision, activa: r.activa,
  };
}

async function estudiantesActivos(teamId: number): Promise<number> {
  const [f] = await db.execute(sql`
    SELECT count(*)::int AS n FROM admin_escolar_matriculas m
      JOIN admin_escolar_estudiantes e ON e.id = m.estudiante_id AND e.team_id = m.team_id
      JOIN admin_escolar_cursos c ON c.id = m.curso_id
     WHERE m.team_id = ${teamId} AND m.estado = 'activa' AND e.estado = 'activo' AND c.activo`) as unknown as { n: unknown }[];
  return n(f?.n);
}

/** Todo lo de la pantalla principal: tarjetas, una fila por aula y lo que anda suelto. */
export async function cargarInventario(teamId: number, hoy = hoyRD()): Promise<ResumenInventario & { espacios: EspacioBase[] }> {
  await exigirDisponible();
  const [espacios, activos, estudiantes] = await Promise.all([
    listarEspacios(teamId), listarActivosFijos(teamId), estudiantesActivos(teamId),
  ]);
  return { ...resumirInventario(espacios, activos.map(aFicha), estudiantes, hoy), espacios };
}

export interface DetalleAula {
  espacio: EspacioBase | null;
  /** Todos los espacios activos (para elegir adónde mover). */
  espacios: { id: number; nombre: string }[];
  totales: TotalesAula;
  fichas: FichaDeAula[];
  traslados: { id: number; nombre: string; unidades: number; origen: string | null; destino: string | null; fecha: string; nota: string | null }[];
}

/** El detalle de un aula (`espacioId`) o de lo que no tiene aula (`null`). */
export async function detalleAula(teamId: number, espacioId: number | null, hoy = hoyRD()): Promise<DetalleAula | null> {
  await exigirDisponible();
  const inv = await cargarInventario(teamId, hoy);
  const espacio = espacioId == null ? null : inv.espacios.find((e) => e.id === espacioId) ?? null;
  if (espacioId != null && !espacio) return null;
  const totales = espacioId == null ? inv.sinAula : inv.aulas.find((a) => a.espacioId === espacioId) ?? null;
  if (!totales) return null;

  const activos = (await listarActivosFijos(teamId)).filter((a) => a.activa && a.cantidadVigente > 0);
  const idsVivos = new Set(inv.espacios.map((e) => e.id));
  const nombres = new Map(inv.espacios.map((e) => [e.id, e.nombre]));
  const mias = activos.filter((a) => (espacioId == null ? a.espacioId == null || !idsVivos.has(a.espacioId) : a.espacioId === espacioId));
  const fichas: FichaDeAula[] = mias.map((a) => {
    const f = aFicha(a);
    return { ...f, ubicacion: a.ubicacion, estadoVisible: estadoVisible(f, hoy), espacioNombre: a.espacioId != null ? nombres.get(a.espacioId) ?? null : null };
  }).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));

  const tr = await db.execute(sql`
    SELECT t.id, t.nombre, t.unidades, to_char(t.created_at, 'YYYY-MM-DD') AS fecha, t.nota,
           o.nombre AS origen, d.nombre AS destino
    FROM escolar_activo_traslados t
    LEFT JOIN escolar_espacios o ON o.id = t.espacio_origen_id
    LEFT JOIN escolar_espacios d ON d.id = t.espacio_destino_id
    WHERE t.team_id = ${teamId}
      ${espacioId == null ? sql`AND (t.espacio_origen_id IS NULL OR t.espacio_destino_id IS NULL)` : sql`AND (t.espacio_origen_id = ${espacioId} OR t.espacio_destino_id = ${espacioId})`}
    ORDER BY t.created_at DESC, t.id DESC LIMIT 15`) as unknown as
    { id: number; nombre: string; unidades: number; fecha: string; nota: string | null; origen: string | null; destino: string | null }[];

  return {
    espacio, totales, fichas,
    espacios: inv.espacios.map((e) => ({ id: e.id, nombre: e.nombre })),
    traslados: tr.map((t) => ({ id: Number(t.id), nombre: t.nombre, unidades: Number(t.unidades), origen: t.origen, destino: t.destino, fecha: t.fecha, nota: t.nota })),
  };
}

// ── Cambios en las fichas ────────────────────────────────────────────────────

/** Cambia el estado de una ficha (bien, regular, dañado). */
export async function cambiarEstadoActivo(teamId: number, activoId: number, estado: string): Promise<void> {
  await exigirDisponible();
  if (!estadoActivoValido(estado)) throw new PlantaError('El estado no es válido.', 400);
  const r = await db.execute(sql`
    UPDATE contabilidad_activos_fijos SET estado = ${estado} WHERE id = ${activoId} AND team_id = ${teamId} AND activa RETURNING id`) as unknown as unknown[];
  if (r.length === 0) throw new PlantaError('El activo no existe.', 404);
}

/**
 * Agrega un activo desde la pantalla del aula, con el aula ya elegida. Es la misma
 * creación de ficha de contabilidad (`registrarActivoFijo`): mismas reglas, mismas
 * cuentas por categoría.
 */
export async function crearActivoEnAula(
  teamId: number, userId: number, espacioId: number,
  input: NuevoActivoFijoInput & { estado?: string; deprecAcumCents?: number },
): Promise<number> {
  await exigirDisponible();
  const [e] = await db.execute(sql`SELECT id FROM escolar_espacios WHERE id = ${espacioId} AND team_id = ${teamId} AND activo`) as unknown as { id: number }[];
  if (!e) throw new PlantaError('El aula no existe.', 404);
  const estado = input.estado ?? 'bien';
  if (!estadoActivoValido(estado)) throw new PlantaError('El estado no es válido.', 400);
  // Desde el aula no se asienta la compra: la ficha se anota como «ya está en los libros» (compra registrada en
  // Compras o saldo inicial). Una ficha de solo control no lleva asiento de ningún modo.
  const { deprecAcumCents, ...ficha } = input;
  return registrarActivoFijo(teamId, ficha, userId, {
    espacioId, estado,
    libros: input.soloControl ? null : { cuentaActivoId: null, deprecAcumCents: deprecAcumCents ?? 0 },
  });
}

export interface TrasladoInput {
  teamId: number;
  userId: number;
  activoId: number;
  /** Aula a la que van las unidades. */
  espacioDestinoId: number;
  unidades: number;
  nota?: string | null;
}

export interface ResultadoTraslado {
  /** La ficha se dividió en dos (se movió solo una parte). */
  dividida: boolean;
  /** La ficha nueva, con las unidades que se movieron; solo si se dividió. */
  nuevoActivoId: number | null;
}

/**
 * Mueve unidades de una ficha a otra aula. Si se mueven todas, cambia el aula de la
 * ficha. Si se mueve una parte, la ficha se divide en dos —costo, residual y
 * depreciación acumulada en proporción, en centavos exactos— y la nueva queda en el
 * aula de destino. No hay asientos nuevos: lo ya asentado se reparte fila por fila.
 * Todo queda en `escolar_activo_traslados`.
 */
export async function trasladarUnidades(input: TrasladoInput): Promise<ResultadoTraslado> {
  await exigirDisponible();
  const nota = input.nota?.replace(/\s+/g, ' ').trim().slice(0, 300) || null;
  if (!Number.isSafeInteger(input.unidades) || input.unidades < 1) throw new PlantaError('Indica cuántas unidades se mueven (al menos una).', 400);

  // Que las cuotas vencidas estén asentadas antes de repartirlas, para que cada mitad herede lo que le toca.
  try {
    await generarDepreciacionesPendientes(input.teamId, input.userId);
  } catch { /* sin cuentas de depreciación: se reparte lo que haya asentado */ }

  try {
    return await db.transaction(async (tx) => {
      const [a] = await tx.execute(sql`
        SELECT id, nombre, costo_cents AS costo, valor_residual_cents AS residual, vida_util_meses AS vida,
               to_char(fecha_adquisicion, 'YYYY-MM-DD') AS adquirido, activa, cantidad, ubicacion, categoria,
               cuenta_activo_id AS "cuentaActivoId", cuenta_deprec_acum_id AS "cuentaDeprecId", cuenta_gasto_deprec_id AS "cuentaGastoId",
               en_revision AS "enRevision", compra_id AS "compraId", compra_linea AS "compraLinea",
               espacio_id AS "espacioId", estado, solo_control AS "soloControl"
        FROM contabilidad_activos_fijos WHERE id = ${input.activoId} AND team_id = ${input.teamId} FOR UPDATE`) as unknown as {
          id: number; nombre: string; costo: unknown; residual: unknown; vida: number; adquirido: string; activa: boolean; cantidad: number;
          ubicacion: string | null; categoria: string | null; cuentaActivoId: number | null; cuentaDeprecId: number | null; cuentaGastoId: number | null;
          enRevision: boolean; compraId: number | null; compraLinea: number | null; espacioId: number | null; estado: string; soloControl: boolean }[];
      if (!a) throw new PlantaError('El activo no existe.', 404);
      if (!a.activa) throw new PlantaError('Este activo ya está dado de baja por completo.', 409);
      if (a.espacioId === input.espacioDestinoId) throw new PlantaError('Esas unidades ya están en esa aula.', 409);

      const [d] = await tx.execute(sql`SELECT id FROM escolar_espacios WHERE id = ${input.espacioDestinoId} AND team_id = ${input.teamId} AND activo`) as unknown as { id: number }[];
      if (!d) throw new PlantaError('El aula de destino no existe.', 404);

      const [b] = await tx.execute(sql`
        SELECT COALESCE(sum(unidades), 0) AS unidades, COALESCE(sum(costo_baja_cents), 0) AS costo, COALESCE(sum(deprec_baja_cents), 0) AS deprec
        FROM contabilidad_activos_bajas WHERE activo_id = ${a.id} AND team_id = ${input.teamId}`) as unknown as { unidades: unknown; costo: unknown; deprec: unknown }[];
      const vigentes = a.cantidad - n(b.unidades);
      if (input.unidades > vigentes) throw new PlantaError(`Solo quedan ${vigentes} ${vigentes === 1 ? 'unidad' : 'unidades'} de este activo.`, 422);

      // Se mueve todo: cambia el aula de la ficha y listo.
      if (input.unidades === vigentes) {
        const [dep] = await tx.execute(sql`SELECT COALESCE(sum(monto_cents), 0) AS acumulada FROM contabilidad_depreciaciones WHERE activo_id = ${a.id} AND team_id = ${input.teamId}`) as unknown as { acumulada: unknown }[];
        await tx.execute(sql`UPDATE contabilidad_activos_fijos SET espacio_id = ${input.espacioDestinoId} WHERE id = ${a.id} AND team_id = ${input.teamId}`);
        await tx.execute(sql`
          INSERT INTO escolar_activo_traslados
            (team_id, activo_id, activo_nuevo_id, nombre, espacio_origen_id, espacio_destino_id, unidades, costo_cents, residual_cents, deprec_cents, nota, created_by)
          VALUES (${input.teamId}, ${a.id}, NULL, ${a.nombre}, ${a.espacioId}, ${input.espacioDestinoId}, ${input.unidades},
                  ${n(a.costo) - n(b.costo)}, ${n(a.residual)}, ${n(dep.acumulada) - n(b.deprec)}, ${nota}, ${input.userId})`);
        return { dividida: false, nuevoActivoId: null };
      }

      // Se mueve una parte: la ficha se divide.
      if (n(b.unidades) > 0) {
        throw new PlantaError('Este activo ya tiene unidades dadas de baja: muévelo completo, o pídele a contabilidad que lo divida.', 409);
      }
      if (a.enRevision) throw new PlantaError('Confirma primero la ficha (categoría y vida útil): viene de una compra y no está lista para dividirse.', 409);

      const cuotas = await tx.execute(sql`
        SELECT id, to_char(periodo, 'YYYY-MM-DD') AS periodo, monto_cents AS monto, asiento_id AS "asientoId"
        FROM contabilidad_depreciaciones WHERE activo_id = ${a.id} AND team_id = ${input.teamId}
        ORDER BY periodo, id FOR UPDATE`) as unknown as { id: number; periodo: string; monto: unknown; asientoId: number | null }[];

      const div = dividirFicha({
        costoCents: n(a.costo), valorResidualCents: n(a.residual), cantidad: a.cantidad,
        depreciaciones: cuotas.map((c) => ({ periodo: c.periodo, montoCents: n(c.monto) })),
      }, input.unidades);

      // Una ficha que viene de una compra sigue atada a ella (se anula con ella): la nueva toma la clave de línea
      // «línea + 1000·n», que nunca choca con una línea real de la compra.
      let lineaHija: number | null = null;
      if (a.compraId != null && a.compraLinea != null) {
        const [m] = await tx.execute(sql`
          SELECT max(compra_linea) AS max FROM contabilidad_activos_fijos
          WHERE team_id = ${input.teamId} AND compra_id = ${a.compraId} AND (compra_linea % 1000) = ${a.compraLinea % 1000}`) as unknown as { max: unknown }[];
        lineaHija = n(m?.max) + 1000;
      }

      const [hija] = await tx.execute(sql`
        INSERT INTO contabilidad_activos_fijos
          (team_id, nombre, costo_cents, valor_residual_cents, vida_util_meses, fecha_adquisicion, activa, created_by,
           cantidad, ubicacion, categoria, cuenta_activo_id, cuenta_deprec_acum_id, cuenta_gasto_deprec_id, en_revision,
           compra_id, compra_linea, espacio_id, estado, solo_control)
        VALUES (${input.teamId}, ${a.nombre}, ${div.hija.costoCents}, ${div.hija.valorResidualCents}, ${a.vida}, ${a.adquirido}::date, true, ${input.userId},
                ${div.hija.cantidad}, ${a.ubicacion}, ${a.categoria}, ${a.cuentaActivoId}, ${a.cuentaDeprecId}, ${a.cuentaGastoId}, false,
                ${a.compraId}, ${lineaHija}, ${input.espacioDestinoId}, ${a.estado}, ${a.soloControl})
        RETURNING id`) as unknown as { id: number }[];

      await tx.execute(sql`
        UPDATE contabilidad_activos_fijos
        SET costo_cents = ${div.madre.costoCents}, valor_residual_cents = ${div.madre.valorResidualCents}, cantidad = ${div.madre.cantidad}
        WHERE id = ${a.id} AND team_id = ${input.teamId}`);

      // Cada cuota ya asentada se parte en dos: la madre conserva su parte y la hija recibe la suya, con el mismo asiento.
      for (let i = 0; i < cuotas.length; i++) {
        await tx.execute(sql`UPDATE contabilidad_depreciaciones SET monto_cents = ${div.madre.depreciaciones[i].montoCents} WHERE id = ${cuotas[i].id} AND team_id = ${input.teamId}`);
        await tx.execute(sql`
          INSERT INTO contabilidad_depreciaciones (team_id, activo_id, periodo, monto_cents, asiento_id)
          VALUES (${input.teamId}, ${hija.id}, ${cuotas[i].periodo}::date, ${div.hija.depreciaciones[i].montoCents}, ${cuotas[i].asientoId})`);
      }

      const deprecHija = div.hija.depreciaciones.reduce((s, x) => s + x.montoCents, 0);
      await tx.execute(sql`
        INSERT INTO escolar_activo_traslados
          (team_id, activo_id, activo_nuevo_id, nombre, espacio_origen_id, espacio_destino_id, unidades, costo_cents, residual_cents, deprec_cents, nota, created_by)
        VALUES (${input.teamId}, ${a.id}, ${hija.id}, ${a.nombre}, ${a.espacioId}, ${input.espacioDestinoId}, ${input.unidades},
                ${div.hija.costoCents}, ${div.hija.valorResidualCents}, ${deprecHija}, ${nota}, ${input.userId})`);
      return { dividida: true, nuevoActivoId: hija.id };
    });
  } catch (e) {
    if (e instanceof TrasladoError) throw new PlantaError(e.message, e.status);
    throw e;
  }
}
