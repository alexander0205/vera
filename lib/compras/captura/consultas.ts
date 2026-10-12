import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { capturaFacturas, capturaFacturasArchivos } from '@/lib/db/schema';
import type { DatosCaptura } from './datos';

export type EstadoCaptura = 'procesando' | 'por_revisar' | 'registrada' | 'descartada';

export interface FilaCaptura {
  id: number;
  estado: EstadoCaptura;
  metodo: 'qr' | 'ia' | 'manual' | null;
  subidoPor: string | null;
  nota: string | null;
  creadoEn: string;
  datos: DatosCaptura | null;
  error: string | null;
  compraId: number | null;
  archivos: { id: number; mime: string }[];
}

export async function crearCaptura(input: { teamId: number; enlaceId: number | null; subidoPor: string | null; nota: string | null }): Promise<number> {
  const [fila] = await db.insert(capturaFacturas).values({
    teamId: input.teamId, enlaceId: input.enlaceId, subidoPor: input.subidoPor, nota: input.nota,
  }).returning({ id: capturaFacturas.id });
  return fila.id;
}

/**
 * ¿Ya llegó esta misma foto? El mensajero que toca «Enviar» dos veces con mala
 * señal, o la reenvía para estar seguro, no debe crear dos facturas por revisar.
 */
export async function capturaConArchivo(teamId: number, sha256: string): Promise<number | null> {
  const [fila] = await db
    .select({ id: capturaFacturas.id })
    .from(capturaFacturasArchivos)
    .innerJoin(capturaFacturas, eq(capturaFacturas.id, capturaFacturasArchivos.capturaId))
    .where(and(
      eq(capturaFacturasArchivos.teamId, teamId),
      eq(capturaFacturasArchivos.sha256, sha256),
      sql`${capturaFacturas.estado} <> 'descartada'`,
    ))
    .limit(1);
  return fila?.id ?? null;
}

export async function listarCapturas(teamId: number, estados: EstadoCaptura[], limite = 60): Promise<FilaCaptura[]> {
  const filas = await db
    .select()
    .from(capturaFacturas)
    .where(and(eq(capturaFacturas.teamId, teamId), inArray(capturaFacturas.estado, estados)))
    .orderBy(desc(capturaFacturas.creadoEn), desc(capturaFacturas.id))
    .limit(limite);
  if (!filas.length) return [];
  const archivos = await db
    .select({ id: capturaFacturasArchivos.id, capturaId: capturaFacturasArchivos.capturaId, mime: capturaFacturasArchivos.mime })
    .from(capturaFacturasArchivos)
    .where(and(eq(capturaFacturasArchivos.teamId, teamId), inArray(capturaFacturasArchivos.capturaId, filas.map((f) => f.id))))
    .orderBy(capturaFacturasArchivos.orden, capturaFacturasArchivos.id);
  return filas.map((f) => ({
    id: f.id,
    estado: f.estado as EstadoCaptura,
    metodo: (f.metodo as FilaCaptura['metodo']) ?? null,
    subidoPor: f.subidoPor,
    nota: f.nota,
    creadoEn: f.creadoEn.toISOString(),
    datos: (f.datos as DatosCaptura | null) ?? null,
    error: f.error,
    compraId: f.compraId,
    archivos: archivos.filter((a) => a.capturaId === f.id).map((a) => ({ id: a.id, mime: a.mime })),
  }));
}

export async function detalleCaptura(teamId: number, id: number): Promise<FilaCaptura | null> {
  const filas = await db.select({ estado: capturaFacturas.estado }).from(capturaFacturas)
    .where(and(eq(capturaFacturas.id, id), eq(capturaFacturas.teamId, teamId))).limit(1);
  if (!filas.length) return null;
  const [fila] = (await listarCapturas(teamId, [filas[0].estado as EstadoCaptura], 1000)).filter((c) => c.id === id);
  return fila ?? null;
}

async function cambiarEstado(teamId: number, id: number, desde: EstadoCaptura[], cambios: Partial<typeof capturaFacturas.$inferInsert>): Promise<boolean> {
  const filas = await db.update(capturaFacturas).set(cambios)
    .where(and(eq(capturaFacturas.id, id), eq(capturaFacturas.teamId, teamId), inArray(capturaFacturas.estado, desde)))
    .returning({ id: capturaFacturas.id });
  return filas.length > 0;
}

/** Borra una captura recién creada cuyas fotos no se pudieron guardar. */
export async function borrarCapturaFallida(teamId: number, id: number): Promise<void> {
  await db.delete(capturaFacturas).where(and(eq(capturaFacturas.id, id), eq(capturaFacturas.teamId, teamId), eq(capturaFacturas.estado, 'procesando')));
}

export const descartarCaptura = (teamId: number, id: number, userId: number) =>
  cambiarEstado(teamId, id, ['procesando', 'por_revisar'], { estado: 'descartada', revisadoPor: userId, revisadoEn: new Date() });

export const marcarRegistrada = (teamId: number, id: number, compraId: number, userId: number) =>
  cambiarEstado(teamId, id, ['por_revisar'], { estado: 'registrada', compraId, revisadoPor: userId, revisadoEn: new Date() });

/** Vuelve a leer una que ya está por revisar (p. ej. tras activar la IA). */
export const volverAProcesar = (teamId: number, id: number) =>
  cambiarEstado(teamId, id, ['por_revisar'], { estado: 'procesando', error: null });

export async function contarPorRevisar(teamId: number): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(capturaFacturas)
    .where(and(eq(capturaFacturas.teamId, teamId), inArray(capturaFacturas.estado, ['procesando', 'por_revisar'])));
  return Number(r?.n ?? 0);
}
