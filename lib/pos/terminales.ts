/**
 * POS — Terminales (puntos de venta). Lógica de negocio.
 *
 * Cada terminal es una caja física con config FIJA: almacén del que vende y
 * descuenta stock, impresora, lista de precios y tipo de comprobante por
 * defecto. El cajero no elige nada al abrir turno — todo viene de aquí.
 */

import { and, eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { posTerminales, almacenes, impresoras, listasPrecios, type PosTerminal } from '@/lib/db/schema';

export interface TerminalConDetalle extends PosTerminal {
  almacenNombre:   string | null;
  impresoraNombre: string | null;
  listaNombre:     string | null;
}

/** Lista las terminales del equipo (con nombres de sus relaciones). */
export async function listarTerminales(teamId: number): Promise<TerminalConDetalle[]> {
  const rows = await db
    .select({
      t:               posTerminales,
      almacenNombre:   almacenes.nombre,
      impresoraNombre: impresoras.nombre,
      listaNombre:     listasPrecios.nombre,
    })
    .from(posTerminales)
    .leftJoin(almacenes,     eq(posTerminales.almacenId, almacenes.id))
    .leftJoin(impresoras,    eq(posTerminales.impresoraId, impresoras.id))
    .leftJoin(listasPrecios, eq(posTerminales.listaPreciosId, listasPrecios.id))
    .where(eq(posTerminales.teamId, teamId))
    .orderBy(asc(posTerminales.nombre));

  return rows.map((r) => ({
    ...r.t,
    almacenNombre:   r.almacenNombre,
    impresoraNombre: r.impresoraNombre,
    listaNombre:     r.listaNombre,
  }));
}

export async function getTerminal(teamId: number, id: number): Promise<PosTerminal | null> {
  const [t] = await db
    .select()
    .from(posTerminales)
    .where(and(eq(posTerminales.id, id), eq(posTerminales.teamId, teamId)))
    .limit(1);
  return t ?? null;
}

export interface TerminalInput {
  nombre:         string;
  almacenId:      number;
  impresoraId?:   number | null;
  listaPreciosId?: number | null;
  tipoEcf?:       string;
  activo?:        boolean;
}

/** Valida que las FKs pertenezcan al mismo equipo (no fugar entre tenants). */
async function validarRefs(teamId: number, input: TerminalInput): Promise<void> {
  if (!input.nombre?.trim()) throw new Error('El nombre de la terminal es obligatorio');

  const [alm] = await db.select({ id: almacenes.id }).from(almacenes)
    .where(and(eq(almacenes.id, input.almacenId), eq(almacenes.teamId, teamId))).limit(1);
  if (!alm) throw new Error('Almacén inválido');

  if (input.impresoraId) {
    const [imp] = await db.select({ id: impresoras.id }).from(impresoras)
      .where(and(eq(impresoras.id, input.impresoraId), eq(impresoras.teamId, teamId))).limit(1);
    if (!imp) throw new Error('Impresora inválida');
  }
  if (input.listaPreciosId) {
    const [lp] = await db.select({ id: listasPrecios.id }).from(listasPrecios)
      .where(and(eq(listasPrecios.id, input.listaPreciosId), eq(listasPrecios.teamId, teamId))).limit(1);
    if (!lp) throw new Error('Lista de precios inválida');
  }
}

export async function crearTerminal(teamId: number, input: TerminalInput): Promise<PosTerminal> {
  await validarRefs(teamId, input);
  const [t] = await db.insert(posTerminales).values({
    teamId,
    nombre:         input.nombre.trim(),
    almacenId:      input.almacenId,
    impresoraId:    input.impresoraId ?? null,
    listaPreciosId: input.listaPreciosId ?? null,
    tipoEcf:        input.tipoEcf ?? 'sin-ncf',
    activo:         input.activo ?? true,
  }).returning();
  return t;
}

export async function actualizarTerminal(teamId: number, id: number, input: TerminalInput): Promise<PosTerminal> {
  const existente = await getTerminal(teamId, id);
  if (!existente) throw new Error('Terminal no encontrada');
  await validarRefs(teamId, input);

  const [t] = await db.update(posTerminales).set({
    nombre:         input.nombre.trim(),
    almacenId:      input.almacenId,
    impresoraId:    input.impresoraId ?? null,
    listaPreciosId: input.listaPreciosId ?? null,
    tipoEcf:        input.tipoEcf ?? existente.tipoEcf,
    activo:         input.activo ?? existente.activo,
  }).where(and(eq(posTerminales.id, id), eq(posTerminales.teamId, teamId))).returning();
  return t;
}

/** Baja lógica (activo=false) para no romper turnos históricos que la referencian. */
export async function desactivarTerminal(teamId: number, id: number): Promise<void> {
  const existente = await getTerminal(teamId, id);
  if (!existente) throw new Error('Terminal no encontrada');
  await db.update(posTerminales).set({ activo: false })
    .where(and(eq(posTerminales.id, id), eq(posTerminales.teamId, teamId)));
}
