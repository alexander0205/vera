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
  /**
   * Saldo con el que arranca la página pedida: el inicial más el efecto de los
   * movimientos saltados por el `offset`. En la página 1 coincide con
   * `saldoInicialCents`.
   */
  saldoPrevioPaginaCents: number;
  /** Sumas de TODO el tramo filtrado, no de la página. */
  debeCents:         number;
  haberCents:        number;
  saldoFinalCents:   number;
  /** Movimientos totales del tramo (para paginar). */
  total:             number;
  movimientos:       MovimientoMayor[];
}

export interface OpcionesMayor extends RangoFechas {
  limit?:  number;
  offset?: number;
}

/** Tope de movimientos que se traen de una vez si nadie pide otra cosa. */
const TOPE_MOVIMIENTOS = 500;

/**
 * Movimientos de UNA cuenta con su saldo corriente, paginados.
 *
 * Los totales (`debeCents`/`haberCents`/`saldoFinalCents`) se calculan en SQL
 * sobre el tramo COMPLETO, no sobre la página: mismo criterio que la cartera y
 * el libro diario — un total recortado presentado como total confunde más que
 * no darlo. El saldo corriente de cada fila sí depende de dónde empieza la
 * página, y para eso está `saldoPrevioPaginaCents`: la suma de lo saltado por
 * el `offset`, calculada también en SQL con el mismo orden de la lista.
 *
 * Devuelve `null` si la cuenta no existe o es de otro team — así la ruta puede
 * responder 404 sin que este archivo sepa nada de HTTP, y sin filtrar la
 * existencia de cuentas ajenas.
 */
export async function mayorGeneral(
  teamId: number,
  cuentaId: number,
  opciones: OpcionesMayor = {},
): Promise<MayorCuenta | null> {
  const rango  = { desde: opciones.desde, hasta: opciones.hasta };
  const limit  = Math.max(1, opciones.limit ?? TOPE_MOVIMIENTOS);
  const offset = Math.max(0, opciones.offset ?? 0);

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

  // Las tres consultas no dependen entre sí: van en paralelo.
  const [[tot], previas, filas] = await Promise.all([
    // Totales y conteo del tramo COMPLETO, para que las cifras de arriba y la
    // paginación no dependan de qué página se está mirando.
    db.execute<{ total: unknown; debe: unknown; haber: unknown }>(sql`
      SELECT count(*)::bigint AS total,
             COALESCE(sum(l.debe_cents), 0)::bigint  AS debe,
             COALESCE(sum(l.haber_cents), 0)::bigint AS haber
      FROM contabilidad_asiento_lineas l
      JOIN contabilidad_asientos a ON a.id = l.asiento_id
      WHERE ${where}
    `),
    // El efecto de las filas que el offset salta, con EL MISMO orden de la
    // lista: si ordenaran distinto, el saldo corriente de la página no
    // empalmaría con la anterior. Solo se consulta si hay algo saltado.
    offset > 0
      ? db.execute<{ debe: unknown; haber: unknown }>(sql`
          SELECT COALESCE(sum(debe_cents), 0)::bigint  AS debe,
                 COALESCE(sum(haber_cents), 0)::bigint AS haber
          FROM (
            SELECT l.debe_cents, l.haber_cents
            FROM contabilidad_asiento_lineas l
            JOIN contabilidad_asientos a ON a.id = l.asiento_id
            WHERE ${where}
            ORDER BY a.fecha ASC, a.id ASC, l.orden ASC
            LIMIT ${offset}
          ) saltadas
        `)
      : Promise.resolve(null),
    // Orden ASCENDENTE, al revés que el libro diario: un mayor se lee de arriba
    // abajo acumulando, así que el saldo corriente solo tiene sentido si el más
    // antiguo va primero.
    db.execute(sql`
      SELECT a.id AS "asientoId", to_char(a.fecha, 'YYYY-MM-DD') AS fecha,
             a.concepto, a.origen_tipo AS "origenTipo",
             l.descripcion, l.debe_cents AS "debeCents", l.haber_cents AS "haberCents"
      FROM contabilidad_asiento_lineas l
      JOIN contabilidad_asientos a ON a.id = l.asiento_id
      WHERE ${where}
      ORDER BY a.fecha ASC, a.id ASC, l.orden ASC
      LIMIT ${limit} OFFSET ${offset}
    `),
  ]);

  const debeCents  = aNumero(tot.debe);
  const haberCents = aNumero(tot.haber);

  const saldoPrevioPaginaCents = previas
    ? saldoInicialCents + saldoSegunNaturaleza(
        cuenta.naturaleza, aNumero(previas[0].debe), aNumero(previas[0].haber),
      )
    : saldoInicialCents;

  let saldo = saldoPrevioPaginaCents;
  const movimientos: MovimientoMayor[] = (
    filas as unknown as Omit<MovimientoMayor, 'saldoCents'>[]
  ).map((m) => {
    const debe  = aNumero(m.debeCents);
    const haber = aNumero(m.haberCents);
    saldo += saldoSegunNaturaleza(cuenta.naturaleza, debe, haber);
    return { ...m, debeCents: debe, haberCents: haber, saldoCents: saldo };
  });

  return {
    cuenta,
    saldoInicialCents,
    saldoPrevioPaginaCents,
    debeCents,
    haberCents,
    // Del agregado del tramo, no del acumulado de la página: el último
    // movimiento visible no es el último del tramo salvo en la página final.
    saldoFinalCents: saldoInicialCents
      + saldoSegunNaturaleza(cuenta.naturaleza, debeCents, haberCents),
    total: aNumero(tot.total),
    movimientos,
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
  opts: { excluirOrigen?: string[] } = {},
): Promise<BalanceComprobacion> {
  const cond = [sql`l.team_id = ${teamId}`];
  if (rango.desde) cond.push(sql`a.fecha >= ${rango.desde}::date`);
  if (rango.hasta) cond.push(sql`a.fecha <= ${rango.hasta}::date`);
  // El estado de resultados excluye los asientos de cierre: si los contara, el
  // propio cierre pondría el resultado del año en cero. El balance general, en
  // cambio, SÍ los cuenta (el resultado ya vive en 3102 tras cerrar).
  if (opts.excluirOrigen && opts.excluirOrigen.length > 0) {
    cond.push(sql`a.origen_tipo NOT IN (${sql.join(opts.excluirOrigen.map((o) => sql`${o}`), sql`, `)})`);
  }
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
