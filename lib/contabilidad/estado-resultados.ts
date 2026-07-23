/**
 * lib/contabilidad/estado-resultados.ts — Estado de resultados (ganancias y
 * pérdidas) del Paso 6, subpaso 4.
 *
 * No guarda nada ni necesita migración: sale de los mismos asientos que el
 * balance de comprobación, agrupados por clase de cuenta.
 *
 * ── Por qué se agrupa por `tipo` y con debe/haber crudo, NO por `naturaleza` ──
 *
 * El estado de resultados quiere una MAGNITUD por sección, no el saldo con signo
 * de cada cuenta. La contribución de una cuenta a la sección depende de su papel
 * en el reporte, que lo fija su `tipo`:
 *
 *   ingreso → (haber − debe)   crédito-positivo: la venta suma, el descuento resta
 *   costo   → (debe − haber)   débito-positivo
 *   gasto   → (debe − haber)   débito-positivo
 *
 * Esto hace que las cuentas de contrapartida se comporten solas: `4103
 * Descuentos y devoluciones` es tipo ingreso, así que su (haber − debe) sale
 * NEGATIVO y resta de las ventas, que es justo lo que debe hacer. Si en cambio
 * sumáramos `saldoSegunNaturaleza` (que para la 4103 deudora da un positivo), el
 * descuento se sumaría al ingreso en vez de restarlo. Es la misma lección que
 * las "columnas de saldo aritmética pura" del balance: para presentar magnitudes
 * no se mira la naturaleza.
 */

import { balanceComprobacion, type RangoFechas } from './reportes';

export interface LineaResultado {
  cuentaId: number;
  codigo:   string;
  nombre:   string;
  /** Contribución con signo a su sección (una venta suma, un descuento resta). */
  montoCents: number;
}

export interface SeccionResultado {
  lineas:     LineaResultado[];
  totalCents: number;
}

export interface EstadoResultados {
  ingresos: SeccionResultado;
  costos:   SeccionResultado;
  gastos:   SeccionResultado;
  /** Ingresos − costos. El margen antes de los gastos operativos. */
  utilidadBrutaCents: number;
  /** Ingresos − costos − gastos. La línea final: ganó o perdió. */
  utilidadNetaCents:  number;
  /** true si hubo alguna cuenta de resultado en el periodo. */
  hayDatos: boolean;
}

/**
 * Estado de resultados de un periodo. Reusa el balance de comprobación (una sola
 * consulta) y reparte sus filas de tipo ingreso/costo/gasto en las tres
 * secciones. Las cuentas de activo, pasivo y patrimonio no entran aquí: son del
 * balance general.
 */
export async function estadoResultados(
  teamId: number,
  rango: RangoFechas = {},
): Promise<EstadoResultados> {
  const balance = await balanceComprobacion(teamId, rango);

  const ingresos: SeccionResultado = { lineas: [], totalCents: 0 };
  const costos:   SeccionResultado = { lineas: [], totalCents: 0 };
  const gastos:   SeccionResultado = { lineas: [], totalCents: 0 };

  for (const f of balance.filas) {
    if (f.tipo === 'ingreso') {
      const monto = f.haberCents - f.debeCents; // crédito-positivo
      ingresos.lineas.push({ cuentaId: f.cuentaId, codigo: f.codigo, nombre: f.nombre, montoCents: monto });
      ingresos.totalCents += monto;
    } else if (f.tipo === 'costo') {
      const monto = f.debeCents - f.haberCents; // débito-positivo
      costos.lineas.push({ cuentaId: f.cuentaId, codigo: f.codigo, nombre: f.nombre, montoCents: monto });
      costos.totalCents += monto;
    } else if (f.tipo === 'gasto') {
      const monto = f.debeCents - f.haberCents; // débito-positivo
      gastos.lineas.push({ cuentaId: f.cuentaId, codigo: f.codigo, nombre: f.nombre, montoCents: monto });
      gastos.totalCents += monto;
    }
  }

  const utilidadBrutaCents = ingresos.totalCents - costos.totalCents;
  const utilidadNetaCents  = utilidadBrutaCents - gastos.totalCents;

  return {
    ingresos, costos, gastos,
    utilidadBrutaCents, utilidadNetaCents,
    hayDatos: ingresos.lineas.length + costos.lineas.length + gastos.lineas.length > 0,
  };
}
