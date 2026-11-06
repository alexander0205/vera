/**
 * lib/contabilidad/inventario-valuacion.ts — «Valor del inventario».
 *
 * Por producto (o variante): existencia × costo promedio. El total se compara
 * con el saldo de la cuenta 1105 del libro; la diferencia se puede llevar a
 * cero con un asiento que el usuario confirma. Cubre lo que ningún movimiento
 * asentó: stock que ya existía antes de usar Contabilidad, ventas anteriores a
 * que el costo se asentara, productos creados con existencia sin movimiento.
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { getConfig } from './config';
import { CODIGO } from './catalogo-base';
import { insertarAsientoManualTx } from './asiento-tx';
import { AsientoManualError } from './asientos';
import { costoEfectivo, resumenValuacion, partidasCuadreInventario, valorFila, type ResumenValuacion } from '@/lib/inventario/costo';
import { hoyRD } from '@/lib/utils/format';

type Ejecutor = Pick<typeof db, 'execute'>;

export interface FilaValorInventario {
  productoId: number;
  varianteId: number | null;
  nombre: string;
  referencia: string | null;
  existencia: number;
  costoUnitarioCents: number;
  valorCents: number;
}

export interface ValorInventario extends ResumenValuacion {
  filas: FilaValorInventario[];
  cuentaInventario: { id: number; codigo: string; nombre: string } | null;
  /** Productos con existencia pero sin costo: valen cero hasta que se les ponga costo. */
  sinCosto: number;
}

export async function filasValorInventario(ex: Ejecutor, teamId: number): Promise<FilaValorInventario[]> {
  const filas = await ex.execute(sql`
    SELECT p.id AS "productoId", v.id AS "varianteId", p.nombre, v.nombre AS "varianteNombre", p.referencia,
           COALESCE(v.stock_actual, p.stock_actual) AS existencia,
           p.costo AS "costoProducto", v.costo AS "costoVariante"
    FROM products p
    LEFT JOIN product_variants v ON v.product_id = p.id AND v.team_id = p.team_id AND v.activo
    WHERE p.team_id = ${teamId} AND p.tipo = 'bien' AND p.controla_inventario AND p.es_mora = false
      AND COALESCE(v.stock_actual, p.stock_actual) > 0
    ORDER BY p.nombre, v.nombre`) as unknown as {
      productoId: number; varianteId: number | null; nombre: string; varianteNombre: string | null; referencia: string | null;
      existencia: unknown; costoProducto: unknown; costoVariante: unknown;
    }[];
  return filas.map((f) => {
    const existencia = Number(f.existencia ?? 0);
    const costo = costoEfectivo(Number(f.costoProducto ?? 0), Number(f.costoVariante ?? 0));
    return {
      productoId: f.productoId, varianteId: f.varianteId,
      nombre: f.varianteNombre ? `${f.nombre} · ${f.varianteNombre}` : f.nombre,
      referencia: f.referencia, existencia, costoUnitarioCents: costo,
      valorCents: valorFila({ existencia, costoUnitarioCents: costo }),
    };
  });
}

async function cuentaYSaldo(ex: Ejecutor, teamId: number): Promise<{ cuenta: { id: number; codigo: string; nombre: string } | null; saldo: number }> {
  const cfg = await getConfig(teamId);
  const [cuenta] = await ex.execute(sql`
    SELECT id, codigo, nombre FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND imputable AND activa
      AND (${cfg.cuentaInventarioId ? sql`id = ${cfg.cuentaInventarioId}` : sql`codigo = ${CODIGO.inventario}`})
    LIMIT 1`) as unknown as { id: number; codigo: string; nombre: string }[];
  if (!cuenta) return { cuenta: null, saldo: 0 };
  const [s] = await ex.execute(sql`
    SELECT COALESCE(sum(debe_cents - haber_cents), 0) AS saldo
    FROM contabilidad_asiento_lineas WHERE team_id = ${teamId} AND cuenta_id = ${cuenta.id}`) as unknown as { saldo: unknown }[];
  return { cuenta, saldo: Number(s?.saldo ?? 0) };
}

export async function valorInventario(ex: Ejecutor, teamId: number): Promise<ValorInventario> {
  const [filas, { cuenta, saldo }] = await Promise.all([filasValorInventario(ex, teamId), cuentaYSaldo(ex, teamId)]);
  const resumen = resumenValuacion(filas.map((f) => ({ existencia: f.existencia, costoUnitarioCents: f.costoUnitarioCents })), saldo);
  return { ...resumen, filas, cuentaInventario: cuenta, sinCosto: filas.filter((f) => f.costoUnitarioCents === 0).length };
}

/**
 * Lleva 1105 al valor del inventario. `diferenciaEsperadaCents` es la que el
 * usuario VIO al confirmar: si el libro o el stock cambiaron, se rechaza en vez
 * de asentar un número que ya no es el que aprobó. Con el candado por empresa,
 * un doble clic deja la segunda petición viendo la diferencia en cero.
 */
export async function cuadrarInventario(
  teamId: number,
  userId: number,
  opts: { diferenciaEsperadaCents: number; contrapartidaId: number },
): Promise<{ asientoId: number; diferenciaCents: number }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('inventario_asientos'), ${teamId})`);
    const v = await valorInventario(tx, teamId);
    if (!v.cuentaInventario) throw new AsientoManualError('No hay cuenta de inventario (1105) en el catálogo.');
    if (v.diferenciaCents === 0) throw new AsientoManualError('El inventario ya cuadra con el libro: no hay nada que ajustar.');
    if (v.diferenciaCents !== opts.diferenciaEsperadaCents) {
      throw new AsientoManualError('La diferencia cambió desde que abriste la pantalla. Recarga y revísala otra vez.');
    }
    const lineas = partidasCuadreInventario(v.diferenciaCents, v.cuentaInventario.id, opts.contrapartidaId);
    const { asientoId } = await insertarAsientoManualTx(tx, teamId, {
      fecha: hoyRD(),
      concepto: 'Ajuste para cuadrar el inventario con su valor',
      lineas,
    }, userId);
    return { asientoId, diferenciaCents: v.diferenciaCents };
  });
}
