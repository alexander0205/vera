/**
 * POS — Modo Restaurante. Lógica de negocio de mesas, comandas y meseros.
 *
 * Capacidad componible: solo aplica a terminales con `mesas = true`. Las cuentas
 * (comandas) viven en DB porque son compartidas entre meseros en la misma
 * pantalla. Al cobrar, la comanda alimenta el motor de e-CF existente.
 */

import { and, eq, sql, asc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  mesas, comandas, comandaItems, posMeseros,
  type Mesa, type Comanda, type ComandaItem, type PosMesero,
} from '@/lib/db/schema';

// ─── Totales ────────────────────────────────────────────────────────────────

function tasaFloat(t: string): number {
  if (!t || t === 'exento') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export interface ItemComandaInput {
  productoId:   number | null;
  nombre:       string;
  precioCentavos: number;
  qty:          number;
  tasaItbis:    string;
  tipo:         string;
  descuentoPct?: number;
  notas?:       string | null;
}

/** Gran total (con ITBIS) de un conjunto de líneas, en centavos. */
export function totalComanda(items: { precioCentavos: number; qty: number; tasaItbis: string; descuentoPct?: number | null }[]): number {
  let total = 0;
  for (const it of items) {
    const bruto = it.precioCentavos * it.qty;
    const desc = Math.round(bruto * (Number(it.descuentoPct ?? 0)) / 100);
    const base = bruto - desc;
    total += base + Math.round(base * tasaFloat(it.tasaItbis));
  }
  return total;
}

// ─── Meseros ────────────────────────────────────────────────────────────────

export async function listarMeseros(teamId: number): Promise<PosMesero[]> {
  return db.select().from(posMeseros)
    .where(and(eq(posMeseros.teamId, teamId), eq(posMeseros.activo, true)))
    .orderBy(asc(posMeseros.nombre));
}

export async function crearMesero(teamId: number, nombre: string, pin: string): Promise<PosMesero> {
  if (!nombre.trim()) throw new Error('El nombre del mesero es obligatorio');
  if (!/^\d{4,6}$/.test(pin)) throw new Error('El PIN debe ser de 4 a 6 dígitos');
  try {
    const [m] = await db.insert(posMeseros).values({ teamId, nombre: nombre.trim(), pin }).returning();
    return m;
  } catch (e: unknown) {
    if (e instanceof Error && /pos_meseros_team_pin_uniq/.test(e.message)) {
      throw new Error('Ya existe un mesero activo con ese PIN');
    }
    throw e;
  }
}

/** Verifica PIN y devuelve el mesero, o null si no coincide. */
export async function meseroPorPin(teamId: number, pin: string): Promise<PosMesero | null> {
  const [m] = await db.select().from(posMeseros)
    .where(and(eq(posMeseros.teamId, teamId), eq(posMeseros.pin, pin), eq(posMeseros.activo, true)))
    .limit(1);
  return m ?? null;
}

// ─── Mesas ──────────────────────────────────────────────────────────────────

export async function crearMesa(teamId: number, terminalId: number, nombre: string, zona?: string | null): Promise<Mesa> {
  if (!nombre.trim()) throw new Error('El nombre de la mesa es obligatorio');
  const [m] = await db.insert(mesas).values({ teamId, terminalId, nombre: nombre.trim(), zona: zona ?? null }).returning();
  return m;
}

export interface MesaVista {
  id:       number;
  nombre:   string;
  zona:     string | null;
  ocupada:  boolean;
  comandaId: number | null;
  meseroNombre: string | null;
  totalCentavos: number;
  items:    number;
}

/** Mesas de una terminal con su estado derivado (libre/ocupada) desde comandas. */
export async function listarMesas(teamId: number, terminalId: number): Promise<MesaVista[]> {
  const rows = await db
    .select({
      id:            mesas.id,
      nombre:        mesas.nombre,
      zona:          mesas.zona,
      comandaId:     comandas.id,
      meseroNombre:  posMeseros.nombre,
      totalCentavos: comandas.totalCentavos,
      items:         sql<number>`(
        SELECT coalesce(sum(${comandaItems.qty}), 0) FROM ${comandaItems}
        WHERE ${comandaItems.comandaId} = ${comandas.id}
      )`,
    })
    .from(mesas)
    .leftJoin(comandas, and(eq(comandas.mesaId, mesas.id), eq(comandas.estado, 'abierta')))
    .leftJoin(posMeseros, eq(comandas.meseroId, posMeseros.id))
    .where(and(eq(mesas.teamId, teamId), eq(mesas.terminalId, terminalId), eq(mesas.activo, true)))
    .orderBy(asc(mesas.nombre));

  return rows.map((r) => ({
    id:            r.id,
    nombre:        r.nombre,
    zona:          r.zona,
    ocupada:       r.comandaId != null,
    comandaId:     r.comandaId,
    meseroNombre:  r.meseroNombre,
    totalCentavos: Number(r.totalCentavos ?? 0),
    items:         Number(r.items ?? 0),
  }));
}

// ─── Comandas ─────────────────────────────────────────────────────────────────

export interface ComandaConItems {
  comanda: Comanda;
  items:   ComandaItem[];
}

export async function getComandaAbierta(teamId: number, mesaId: number): Promise<ComandaConItems | null> {
  const [c] = await db.select().from(comandas)
    .where(and(eq(comandas.teamId, teamId), eq(comandas.mesaId, mesaId), eq(comandas.estado, 'abierta')))
    .limit(1);
  if (!c) return null;
  const items = await db.select().from(comandaItems)
    .where(eq(comandaItems.comandaId, c.id)).orderBy(asc(comandaItems.id));
  return { comanda: c, items };
}

export async function getComanda(teamId: number, comandaId: number): Promise<ComandaConItems | null> {
  const [c] = await db.select().from(comandas)
    .where(and(eq(comandas.teamId, teamId), eq(comandas.id, comandaId))).limit(1);
  if (!c) return null;
  const items = await db.select().from(comandaItems)
    .where(eq(comandaItems.comandaId, c.id)).orderBy(asc(comandaItems.id));
  return { comanda: c, items };
}

/** Abre (o devuelve) la comanda viva de una mesa. Idempotente por mesa. */
export async function abrirComanda(input: {
  teamId: number; terminalId: number; mesaId: number;
  meseroId?: number | null; turnoId?: number | null;
}): Promise<Comanda> {
  const existente = await getComandaAbierta(input.teamId, input.mesaId);
  if (existente) return existente.comanda;
  try {
    const [c] = await db.insert(comandas).values({
      teamId:     input.teamId,
      terminalId: input.terminalId,
      mesaId:     input.mesaId,
      meseroId:   input.meseroId ?? null,
      turnoId:    input.turnoId ?? null,
    }).returning();
    return c;
  } catch (e: unknown) {
    // Carrera: otra pantalla abrió la misma mesa. Devuelve la existente.
    if (e instanceof Error && /comandas_mesa_abierta_uniq/.test(e.message)) {
      const c = await getComandaAbierta(input.teamId, input.mesaId);
      if (c) return c.comanda;
    }
    throw e;
  }
}

/** Reemplaza las líneas de la comanda con el estado del carrito y recalcula total. */
export async function guardarItems(teamId: number, comandaId: number, items: ItemComandaInput[], meseroId?: number | null): Promise<Comanda> {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(comandas)
      .where(and(eq(comandas.teamId, teamId), eq(comandas.id, comandaId))).for('update').limit(1);
    if (!c) throw new Error('Comanda no encontrada');
    if (c.estado !== 'abierta') throw new Error('La comanda ya no está abierta');

    await tx.delete(comandaItems).where(eq(comandaItems.comandaId, comandaId));
    if (items.length > 0) {
      await tx.insert(comandaItems).values(items.map((it) => ({
        comandaId,
        productoId:     it.productoId,
        nombre:         it.nombre,
        precioCentavos: it.precioCentavos,
        qty:            it.qty,
        tasaItbis:      it.tasaItbis,
        tipo:           it.tipo,
        descuentoPct:   it.descuentoPct ?? 0,
        notas:          it.notas ?? null,
      })));
    }

    const total = totalComanda(items);
    const [actualizada] = await tx.update(comandas)
      .set({ totalCentavos: total, meseroId: meseroId ?? c.meseroId, updatedAt: new Date() })
      .where(eq(comandas.id, comandaId)).returning();
    return actualizada;
  });
}

/** Marca la comanda como cobrada, atándola al e-CF emitido. */
export async function marcarCobrada(teamId: number, comandaId: number, ecfDocumentId: number): Promise<void> {
  await db.update(comandas)
    .set({ estado: 'cobrada', ecfDocumentId, updatedAt: new Date() })
    .where(and(eq(comandas.teamId, teamId), eq(comandas.id, comandaId)));
}

/**
 * Reabre la comanda de un e-CF anulado (unsettle): vuelve a 'abierta' y suelta
 * el vínculo al documento. Los `comanda_items` no se tocan al cobrar, así que la
 * cuenta queda editable tal como estaba. Devuelve null si no había comanda cobrada
 * atada a ese documento. */
export async function reabrirComanda(teamId: number, ecfDocumentId: number): Promise<Comanda | null> {
  const [c] = await db.select().from(comandas)
    .where(and(
      eq(comandas.teamId, teamId),
      eq(comandas.ecfDocumentId, ecfDocumentId),
      eq(comandas.estado, 'cobrada'),
    )).limit(1);
  if (!c) return null;
  const [reab] = await db.update(comandas)
    .set({ estado: 'abierta', ecfDocumentId: null, updatedAt: new Date() })
    .where(eq(comandas.id, c.id)).returning();
  return reab;
}

/** Cancela una comanda abierta (libera la mesa sin cobrar). */
export async function cancelarComanda(teamId: number, comandaId: number): Promise<void> {
  await db.update(comandas)
    .set({ estado: 'cancelada', updatedAt: new Date() })
    .where(and(eq(comandas.teamId, teamId), eq(comandas.id, comandaId), eq(comandas.estado, 'abierta')));
}
