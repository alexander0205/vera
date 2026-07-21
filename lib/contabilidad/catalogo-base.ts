/**
 * lib/contabilidad/catalogo-base.ts — El plan de cuentas mínimo con el que
 * arranca una empresa, y la siembra que lo instala.
 *
 * Numeración estándar dominicana, que es con la que trabajan los contadores
 * locales y contra la que van a comparar:
 *
 *   1 Activo · 2 Pasivo · 3 Patrimonio · 4 Ingresos · 5 Costos · 6 Gastos
 *
 * Tres niveles: clase (1) → grupo (11) → cuenta imputable (1101). Solo el
 * tercer nivel recibe asientos; los dos primeros agrupan y su saldo es la suma
 * de sus hijas.
 *
 * La siembra es PEREZOSA: no corre en la migración ni al crear el team, sino la
 * primera vez que alguien abre el módulo de contabilidad. Un team que nunca use
 * contabilidad no gana 20 cuentas que no pidió.
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';

/** Las 6 clases del catálogo. */
export type TipoCuenta =
  | 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'costo' | 'gasto';

export type NaturalezaCuenta = 'deudora' | 'acreedora';

/**
 * Naturaleza que le corresponde a una clase por defecto.
 *
 * Es solo el valor inicial que se propone al crear una cuenta: la naturaleza se
 * guarda por cuenta y puede invertirse. Las cuentas de contrapartida lo hacen
 * (ver `4103 Descuentos y devoluciones sobre ventas` más abajo).
 */
export function naturalezaPorTipo(tipo: TipoCuenta): NaturalezaCuenta {
  return tipo === 'activo' || tipo === 'costo' || tipo === 'gasto'
    ? 'deudora'
    : 'acreedora';
}

interface CuentaBase {
  codigo:     string;
  nombre:     string;
  tipo:       TipoCuenta;
  /** Solo cuando invierte la naturaleza de su clase. */
  naturaleza?: NaturalezaCuenta;
  /** Las cuentas de agrupación no reciben asientos. */
  imputable:  boolean;
}

/**
 * El catálogo base. El orden importa: cada cuenta se cuelga de la anterior más
 * corta que sea prefijo de su código, así que las padre tienen que ir primero.
 *
 * Cubre las 8 cuentas que exige el plan (caja, bancos, cuentas por cobrar,
 * ingresos por ventas, ITBIS por pagar, retenciones, descuentos/devoluciones y
 * mora) más el mínimo estructural para que un balance cuadre.
 */
export const CATALOGO_BASE: CuentaBase[] = [
  // ─── 1 Activo ───────────────────────────────────────────────────────────
  { codigo: '1',    nombre: 'Activo',                      tipo: 'activo', imputable: false },
  { codigo: '11',   nombre: 'Activo corriente',            tipo: 'activo', imputable: false },
  { codigo: '1101', nombre: 'Caja',                        tipo: 'activo', imputable: true },
  { codigo: '1102', nombre: 'Bancos',                      tipo: 'activo', imputable: true },
  { codigo: '1103', nombre: 'Cuentas por cobrar',          tipo: 'activo', imputable: true },
  // ITBIS pagado en las compras: se compensa contra el 2102 al liquidar.
  { codigo: '1104', nombre: 'ITBIS adelantado',            tipo: 'activo', imputable: true },
  { codigo: '1105', nombre: 'Inventario',                  tipo: 'activo', imputable: true },

  // ─── 2 Pasivo ───────────────────────────────────────────────────────────
  { codigo: '2',    nombre: 'Pasivo',                      tipo: 'pasivo', imputable: false },
  { codigo: '21',   nombre: 'Pasivo corriente',            tipo: 'pasivo', imputable: false },
  { codigo: '2101', nombre: 'Cuentas por pagar',           tipo: 'pasivo', imputable: true },
  // ITBIS cobrado en las ventas, que se le debe a la DGII.
  { codigo: '2102', nombre: 'ITBIS por pagar',             tipo: 'pasivo', imputable: true },
  { codigo: '2103', nombre: 'Retenciones por pagar',       tipo: 'pasivo', imputable: true },

  // ─── 3 Patrimonio ───────────────────────────────────────────────────────
  { codigo: '3',    nombre: 'Patrimonio',                  tipo: 'patrimonio', imputable: false },
  { codigo: '31',   nombre: 'Capital',                     tipo: 'patrimonio', imputable: false },
  { codigo: '3101', nombre: 'Capital social',              tipo: 'patrimonio', imputable: true },
  { codigo: '3102', nombre: 'Resultados acumulados',       tipo: 'patrimonio', imputable: true },

  // ─── 4 Ingresos ─────────────────────────────────────────────────────────
  { codigo: '4',    nombre: 'Ingresos',                    tipo: 'ingreso', imputable: false },
  { codigo: '41',   nombre: 'Ingresos operacionales',      tipo: 'ingreso', imputable: false },
  { codigo: '4101', nombre: 'Ingresos por ventas',         tipo: 'ingreso', imputable: true },
  // Los recargos por mora que cobra el módulo de cartera.
  { codigo: '4102', nombre: 'Ingresos por mora',           tipo: 'ingreso', imputable: true },
  // Cuenta de contrapartida: es ingreso, pero RESTA. De ahí la naturaleza
  // deudora, invertida respecto a su clase.
  {
    codigo: '4103',
    nombre: 'Descuentos y devoluciones sobre ventas',
    tipo: 'ingreso',
    naturaleza: 'deudora',
    imputable: true,
  },

  // ─── 5 Costos ───────────────────────────────────────────────────────────
  { codigo: '5',    nombre: 'Costos',                      tipo: 'costo', imputable: false },
  { codigo: '51',   nombre: 'Costo de ventas',             tipo: 'costo', imputable: false },
  { codigo: '5101', nombre: 'Costo de mercancía vendida',  tipo: 'costo', imputable: true },

  // ─── 6 Gastos ───────────────────────────────────────────────────────────
  { codigo: '6',    nombre: 'Gastos',                      tipo: 'gasto', imputable: false },
  { codigo: '61',   nombre: 'Gastos operacionales',        tipo: 'gasto', imputable: false },
  { codigo: '6101', nombre: 'Gastos generales',            tipo: 'gasto', imputable: true },
];

/**
 * Siembra el catálogo base en un team.
 *
 * Idempotente por dos vías: el `ON CONFLICT DO NOTHING` contra el índice único
 * `(team_id, codigo)`, y el chequeo previo de "ya tiene cuentas". Correrla dos
 * veces no duplica nada.
 *
 * **No sobrescribe.** Si el usuario renombró `1101` a "Caja chica", esa fila se
 * queda como está: el conflicto no actualiza. Es deliberado — el catálogo es
 * suyo desde el momento en que lo toca.
 *
 * @returns cuántas cuentas se insertaron (0 si el team ya tenía catálogo).
 */
export async function sembrarCatalogoBase(
  teamId: number,
  userId?: number,
): Promise<number> {
  // Si el team ya tiene aunque sea una cuenta, el catálogo ya está inicializado
  // y no hay nada que sembrar. Evita reinsertar las base que el usuario borró
  // a propósito.
  const [{ total }] = await db.execute<{ total: number }>(sql`
    SELECT count(*)::int AS total
    FROM contabilidad_cuentas
    WHERE team_id = ${teamId}
  `);
  if (total > 0) return 0;

  // Se insertan por nivel para poder resolver el padre por código: cuando toca
  // insertar 1101, la 11 ya existe y se puede buscar su id.
  let insertadas = 0;
  for (const c of CATALOGO_BASE) {
    const naturaleza = c.naturaleza ?? naturalezaPorTipo(c.tipo);
    // El padre es la cuenta cuyo código es el prefijo inmediato: 1101 → 11 → 1.
    const codigoPadre = c.codigo.length > 1
      ? c.codigo.slice(0, c.codigo.length === 4 ? 2 : 1)
      : null;

    const res = await db.execute(sql`
      INSERT INTO contabilidad_cuentas
        (team_id, codigo, nombre, tipo, naturaleza, cuenta_padre_id,
         imputable, activa, es_base, created_by, updated_by)
      VALUES (
        ${teamId}, ${c.codigo}, ${c.nombre}, ${c.tipo}, ${naturaleza},
        ${codigoPadre === null
          ? sql`NULL`
          : sql`(SELECT id FROM contabilidad_cuentas
                 WHERE team_id = ${teamId} AND codigo = ${codigoPadre})`},
        ${c.imputable}, true, true, ${userId ?? null}, ${userId ?? null}
      )
      ON CONFLICT (team_id, codigo) DO NOTHING
    `);
    insertadas += res.count ?? 0;
  }

  return insertadas;
}
