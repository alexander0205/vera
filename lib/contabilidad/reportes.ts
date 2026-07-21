/**
 * lib/contabilidad/reportes.ts — Mayor general y balance de comprobación.
 * Subpasos 2 y 3 del Paso 6.
 *
 * Los dos salen de las mismas dos tablas del Paso 4 y no necesitan migración:
 * un reporte contable no guarda nada, solo lee los asientos y los presenta como
 * los espera un contador.
 *
 * ── La regla del signo, que es donde se equivoca todo el mundo ───────────────
 *
 * El saldo de una cuenta depende de su **`naturaleza`**, no de su `tipo`:
 *   deudora  → debe − haber
 *   acreedora → haber − debe
 *
 * Y `naturaleza` hay que leerla de la columna, nunca deducirla del `tipo`. Las
 * cuentas de contrapartida la tienen invertida respecto a su clase: `4103
 * Descuentos y devoluciones sobre ventas` es de tipo ingreso pero de naturaleza
 * deudora, porque resta. Deducirla del tipo le daría el signo cambiado justo a
 * esas, que son las que más se miran al revisar el margen.
 *
 * ── Dónde NO se usa la naturaleza ───────────────────────────────────────────
 *
 * Las columnas "saldo deudor" y "saldo acreedor" del balance son aritmética
 * pura: `debe − haber` si sale positivo y `haber − debe` si sale positivo. No
 * miran la naturaleza a propósito, y por eso el balance cuadra siempre que los
 * asientos cuadren. La naturaleza se usa para otra cosa: para saber en qué
 * columna se **esperaba** que cayera la cuenta, y marcar como anomalía la que
 * cae en la contraria (una cuenta de banco con saldo acreedor está en números
 * rojos y eso merece verse).
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import type { TipoCuenta, NaturalezaCuenta } from './catalogo-base';

/**
 * Las columnas `bigint` llegan a JS como STRING: `0 + "701" + "0"` da `"07010"`.
 * Misma defensa que en `libro-diario.ts`, y por el mismo motivo — aquí se suman
 * importes de todo un ejercicio, así que una concatenación pasaría inadvertida
 * hasta que alguien mirase un total imposible.
 */
const aNumero = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));

/** Ambas en 'YYYY-MM-DD', inclusivas. */
export interface RangoFechas {
  desde?: string;
  hasta?: string;
}

/** El neto con el signo que le toca a la cuenta según su naturaleza. */
export function saldoSegunNaturaleza(
  naturaleza: NaturalezaCuenta,
  debeCents: number,
  haberCents: number,
): number {
  return naturaleza === 'deudora' ? debeCents - haberCents : haberCents - debeCents;
}

// ─── Mayor general ───────────────────────────────────────────────────────────

export interface MovimientoMayor {
  asientoId:   number;
  fecha:       string;
  concepto:    string;
  origenTipo:  string;
  descripcion: string | null;
  debeCents:   number;
  haberCents:  number;
  /** Saldo acumulado tras aplicar este movimiento, ya con el signo correcto. */
  saldoCents:  number;
}

export interface MayorCuenta {
  cuenta: {
    id:         number;
    codigo:     string;
    nombre:     string;
    tipo:       TipoCuenta;
    naturaleza: NaturalezaCuenta;
  };
  /** Arrastre de lo anterior a `desde`. Sin `desde` es 0: no hay nada antes. */
  saldoInicialCents: number;
  debeCents:         number;
  haberCents:        number;
  saldoFinalCents:   number;
  movimientos:       MovimientoMayor[];
  /** true si se recortó la lista por el tope. */
  hayMas:            boolean;
}

/** Tope de movimientos que se traen de una cuenta. */
const TOPE_MOVIMIENTOS = 500;

/**
 * Movimientos de UNA cuenta con su saldo corriente.
 *
 * Devuelve `null` si la cuenta no existe o es de otro team — así la ruta puede
 * responder 404 sin que este archivo sepa nada de HTTP, y sin filtrar la
 * existencia de cuentas ajenas.
 */
export async function mayorGeneral(
  teamId: number,
  cuentaId: number,
  rango: RangoFechas = {},
): Promise<MayorCuenta | null> {
  const [cuenta] = await db.execute<{
    id: number; codigo: string; nombre: string;
    tipo: TipoCuenta; naturaleza: NaturalezaCuenta;
  }>(sql`
    SELECT id, codigo, nombre, tipo, naturaleza
    FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND id = ${cuentaId}
    LIMIT 1
  `);
  if (!cuenta) return null;

  // ── Saldo inicial ─────────────────────────────────────────────────────────
  // Todo lo anterior a `desde`, comprimido en un número. Es lo que convierte el
  // mayor de un tramo en algo que se puede leer solo: sin el arrastre, el saldo
  // final de un mes suelto no significa nada.
  let saldoInicialCents = 0;
  if (rango.desde) {
    const [ini] = await db.execute<{ debe: unknown; haber: unknown }>(sql`
      SELECT COALESCE(sum(l.debe_cents), 0)::bigint  AS debe,
             COALESCE(sum(l.haber_cents), 0)::bigint AS haber
      FROM contabilidad_asiento_lineas l
      JOIN contabilidad_asientos a ON a.id = l.asiento_id
      WHERE l.team_id = ${teamId} AND l.cuenta_id = ${cuentaId}
        AND a.fecha < ${rango.desde}::date
    `);
    saldoInicialCents = saldoSegunNaturaleza(
      cuenta.naturaleza, aNumero(ini.debe), aNumero(ini.haber),
    );
  }

  // ── Movimientos del tramo ─────────────────────────────────────────────────
  const cond = [sql`l.team_id = ${teamId}`, sql`l.cuenta_id = ${cuentaId}`];
  if (rango.desde) cond.push(sql`a.fecha >= ${rango.desde}::date`);
  if (rango.hasta) cond.push(sql`a.fecha <= ${rango.hasta}::date`);
  const where = sql.join(cond, sql` AND `);

  // Orden ASCENDENTE, al revés que el libro diario: un mayor se lee de arriba
  // abajo acumulando, así que el saldo corriente solo tiene sentido si el más
  // antiguo va primero.
  const filas = await db.execute(sql`
    SELECT a.id AS "asientoId", to_char(a.fecha, 'YYYY-MM-DD') AS fecha,
           a.concepto, a.origen_tipo AS "origenTipo",
           l.descripcion, l.debe_cents AS "debeCents", l.haber_cents AS "haberCents"
    FROM contabilidad_asiento_lineas l
    JOIN contabilidad_asientos a ON a.id = l.asiento_id
    WHERE ${where}
    ORDER BY a.fecha ASC, a.id ASC, l.orden ASC
    LIMIT ${TOPE_MOVIMIENTOS + 1}
  `);

  const brutos = filas as unknown as Omit<MovimientoMayor, 'saldoCents'>[];
  const hayMas = brutos.length > TOPE_MOVIMIENTOS;
  const usados = hayMas ? brutos.slice(0, TOPE_MOVIMIENTOS) : brutos;

  let saldo = saldoInicialCents;
  let debeCents = 0;
  let haberCents = 0;

  const movimientos: MovimientoMayor[] = usados.map((m) => {
    const debe  = aNumero(m.debeCents);
    const haber = aNumero(m.haberCents);
    debeCents  += debe;
    haberCents += haber;
    saldo += saldoSegunNaturaleza(cuenta.naturaleza, debe, haber);
    return { ...m, debeCents: debe, haberCents: haber, saldoCents: saldo };
  });

  return {
    cuenta,
    saldoInicialCents,
    debeCents,
    haberCents,
    // Se recalcula en vez de usar el `saldo` corriente: si el tope recortó la
    // lista, el acumulado del último movimiento visible no es el saldo real.
    saldoFinalCents: saldoInicialCents
      + saldoSegunNaturaleza(cuenta.naturaleza, debeCents, haberCents),
    movimientos,
    hayMas,
  };
}

// ─── Balance de comprobación ─────────────────────────────────────────────────

export interface FilaBalance {
  cuentaId:   number;
  codigo:     string;
  nombre:     string;
  tipo:       TipoCuenta;
  naturaleza: NaturalezaCuenta;
  debeCents:  number;
  haberCents: number;
  /** Aritmética pura: uno de los dos es 0. */
  saldoDeudorCents:   number;
  saldoAcreedorCents: number;
  /**
   * El saldo cayó en la columna contraria a la naturaleza de la cuenta. No es
   * un error del sistema —un banco puede quedar en descubierto— pero es lo
   * primero que un contador quiere ver señalado.
   */
  anomala: boolean;
}

export interface BalanceComprobacion {
  filas:   FilaBalance[];
  totales: {
    debeCents:          number;
    haberCents:         number;
    saldoDeudorCents:   number;
    saldoAcreedorCents: number;
  };
  /**
   * El balance cuadra si las sumas coinciden y los saldos también. Con asientos
   * correctos es siempre true; que se muestre es justamente para que se note el
   * día que no lo sea, antes de que alguien declare con esos números.
   */
  cuadra: boolean;
}

/**
 * Todas las cuentas con movimientos, con sus sumas y saldos.
 *
 * Solo salen las que tienen apuntes: un balance con 30 filas en cero esconde
 * las 4 que importan. Las cuentas de agrupación tampoco aparecen — los asientos
 * se hacen contra cuentas imputables, así que una agrupadora no tiene apuntes
 * propios que sumar.
 */
export async function balanceComprobacion(
  teamId: number,
  rango: RangoFechas = {},
): Promise<BalanceComprobacion> {
  const cond = [sql`l.team_id = ${teamId}`];
  if (rango.desde) cond.push(sql`a.fecha >= ${rango.desde}::date`);
  if (rango.hasta) cond.push(sql`a.fecha <= ${rango.hasta}::date`);
  const where = sql.join(cond, sql` AND `);

  const filas = await db.execute(sql`
    SELECT c.id AS "cuentaId", c.codigo, c.nombre, c.tipo, c.naturaleza,
           COALESCE(sum(l.debe_cents), 0)::bigint  AS "debeCents",
           COALESCE(sum(l.haber_cents), 0)::bigint AS "haberCents"
    FROM contabilidad_asiento_lineas l
    JOIN contabilidad_asientos a ON a.id = l.asiento_id
    JOIN contabilidad_cuentas   c ON c.id = l.cuenta_id
    WHERE ${where}
    GROUP BY c.id, c.codigo, c.nombre, c.tipo, c.naturaleza
    ORDER BY c.codigo
  `);

  const totales = {
    debeCents: 0, haberCents: 0, saldoDeudorCents: 0, saldoAcreedorCents: 0,
  };

  const resultado: FilaBalance[] = (filas as unknown as {
    cuentaId: number; codigo: string; nombre: string;
    tipo: TipoCuenta; naturaleza: NaturalezaCuenta;
    debeCents: unknown; haberCents: unknown;
  }[]).map((f) => {
    const debe  = aNumero(f.debeCents);
    const haber = aNumero(f.haberCents);
    const neto  = debe - haber;

    const saldoDeudorCents   = neto > 0 ?  neto : 0;
    const saldoAcreedorCents = neto < 0 ? -neto : 0;

    totales.debeCents          += debe;
    totales.haberCents         += haber;
    totales.saldoDeudorCents   += saldoDeudorCents;
    totales.saldoAcreedorCents += saldoAcreedorCents;

    // Una cuenta en cero no es anómala: no cayó en ninguna columna.
    const anomala = neto !== 0 && (
      f.naturaleza === 'deudora' ? neto < 0 : neto > 0
    );

    return {
      cuentaId: f.cuentaId, codigo: f.codigo, nombre: f.nombre,
      tipo: f.tipo, naturaleza: f.naturaleza,
      debeCents: debe, haberCents: haber,
      saldoDeudorCents, saldoAcreedorCents, anomala,
    };
  });

  return {
    filas: resultado,
    totales,
    cuadra: totales.debeCents === totales.haberCents
         && totales.saldoDeudorCents === totales.saldoAcreedorCents,
  };
}
