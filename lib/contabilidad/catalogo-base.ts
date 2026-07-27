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
  // Cuenta puente de las pasarelas (CardNet/Azul). El dinero de un cobro en
  // línea NO entra al banco en el momento: la pasarela liquida días después y
  // retiene su comisión. Mandarlo directo a Bancos inflaría el banco con plata
  // que todavía no llegó. Se queda aquí hasta que la liquidación lo mueve.
  { codigo: '1106', nombre: 'Cobros por liquidar',         tipo: 'activo', imputable: true },
  // Lo que el cliente retuvo y le paga a la DGII por cuenta de la empresa. No
  // entra al banco, pero deja un crédito fiscal a favor: es un activo, no un
  // menor ingreso — la venta fue por el total.
  { codigo: '1107', nombre: 'Retenciones por cobrar',      tipo: 'activo', imputable: true },
  // Activo no corriente: los bienes de larga vida y su depreciación (Nivel 4.2).
  { codigo: '12',   nombre: 'Activo no corriente',          tipo: 'activo', imputable: false },
  { codigo: '1201', nombre: 'Activos fijos',                tipo: 'activo', imputable: true },
  // Contra-activo: es activo pero RESTA (acumula lo depreciado). Naturaleza
  // acreedora, invertida respecto a su clase, igual que 4103 en ingresos.
  {
    codigo: '1202',
    nombre: 'Depreciación acumulada',
    tipo: 'activo',
    naturaleza: 'acreedora',
    imputable: true,
  },

  // ─── 2 Pasivo ───────────────────────────────────────────────────────────
  { codigo: '2',    nombre: 'Pasivo',                      tipo: 'pasivo', imputable: false },
  { codigo: '21',   nombre: 'Pasivo corriente',            tipo: 'pasivo', imputable: false },
  { codigo: '2101', nombre: 'Cuentas por pagar',           tipo: 'pasivo', imputable: true },
  // ITBIS cobrado en las ventas, que se le debe a la DGII.
  { codigo: '2102', nombre: 'ITBIS por pagar',             tipo: 'pasivo', imputable: true },
  { codigo: '2103', nombre: 'Retenciones por pagar',       tipo: 'pasivo', imputable: true },
  // Cuando una nota de crédito supera lo que el cliente debía, el sobrante es
  // dinero que la empresa le debe a él. Tratarlo como menor cuenta por cobrar
  // dejaría la cartera en negativo.
  { codigo: '2104', nombre: 'Saldos a favor de clientes',  tipo: 'pasivo', imputable: true },

  // ─── 3 Patrimonio ───────────────────────────────────────────────────────
  { codigo: '3',    nombre: 'Patrimonio',                  tipo: 'patrimonio', imputable: false },
  { codigo: '31',   nombre: 'Capital',                     tipo: 'patrimonio', imputable: false },
  { codigo: '3101', nombre: 'Capital social',              tipo: 'patrimonio', imputable: true },
  { codigo: '3102', nombre: 'Resultados acumulados',       tipo: 'patrimonio', imputable: true },

  // ─── 4 Ingresos ─────────────────────────────────────────────────────────
  { codigo: '4',    nombre: 'Ingresos',                    tipo: 'ingreso', imputable: false },
  { codigo: '41',   nombre: 'Ingresos operacionales',      tipo: 'ingreso', imputable: false },
  // Se separan bien y servicio porque el Paso 3 mapea la cuenta de ingreso
  // según `products.tipo`, y porque el estado de resultados suele pedirlos
  // aparte.
  { codigo: '4101', nombre: 'Ingresos por venta de mercancía', tipo: 'ingreso', imputable: true },
  { codigo: '4104', nombre: 'Ingresos por servicios',      tipo: 'ingreso', imputable: true },
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
  // La comisión que retiene la pasarela al liquidar. Es gasto, no un menor
  // ingreso: la venta fue por el total y el costo de cobrarla va aparte.
  { codigo: '6102', nombre: 'Comisiones por cobro electrónico', tipo: 'gasto', imputable: true },
  // El desgaste mensual de los activos fijos (Nivel 4.2). Su contrapartida es
  // 1202, no la caja: la depreciación no saca dinero, solo reconoce el gasto.
  { codigo: '6103', nombre: 'Gasto por depreciación',      tipo: 'gasto', imputable: true },
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

  return insertarCuentasBase(teamId, userId);
}

/**
 * Inserta las cuentas del catálogo base que le falten al team, **sin el chequeo
 * de "ya tiene catálogo"**.
 *
 * Existe porque `sembrarCatalogoBase` se planta en cuanto hay una sola cuenta,
 * así que un team sembrado con una versión anterior del catálogo nunca vería
 * las cuentas nuevas. Pasó de verdad al llegar el Paso 3, que necesita
 * `1106 Cobros por liquidar`, `4104 Ingresos por servicios` y
 * `6102 Comisiones por cobro electrónico`.
 *
 * Es explícita y la dispara el usuario desde el catálogo, no automática: si
 * alguien borró una cuenta base a propósito, no se la devolvemos a sus espaldas
 * en cada render.
 *
 * @returns cuántas cuentas se insertaron.
 */
export async function sembrarCuentasBaseFaltantes(
  teamId: number,
  userId?: number,
): Promise<number> {
  return insertarCuentasBase(teamId, userId);
}

/**
 * El INSERT en sí. Recorre el catálogo en orden para que cada cuenta encuentre
 * a su padre ya insertado, y deja pasar los conflictos: lo que ya existe no se
 * toca.
 */
async function insertarCuentasBase(teamId: number, userId?: number): Promise<number> {
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

/** Los códigos que el motor contable espera encontrar. Para sugerir valores. */
export const CODIGO = {
  cuentasPorCobrar:   '1103',
  cobrosPorLiquidar:  '1106',
  retencionesPorCobrar:'1107',
  itbisPorPagar:      '2102',
  retencionesPorPagar:'2103',
  saldosFavorClientes:'2104',
  ingresosMercancia:  '4101',
  ingresosServicios:  '4104',
  ingresosMora:       '4102',
  descuentos:         '4103',
  caja:               '1101',
  bancos:             '1102',
  comisionCobro:      '6102',
  activoFijo:         '1201',
  depreciacionAcum:   '1202',
  gastoDepreciacion:  '6103',
} as const;
