/**
 * lib/contabilidad/balance-general.ts — Balance general / estado de situación.
 * Paso 6, subpaso adicional acordado con el estado de resultados.
 *
 * La foto del negocio a una fecha: lo que tiene (activo) = lo que debe (pasivo)
 * + lo que vale (patrimonio). Sale de los mismos asientos que el balance de
 * comprobación, sin migración.
 *
 * ── El resultado del ejercicio es el que cuadra la foto ─────────────────────
 *
 * Mientras no exista el cierre de ejercicio (no implementado a propósito: se
 * diseña con un año real de datos), las cuentas de ingreso/costo/gasto siguen
 * con saldo. Su neto —la utilidad o pérdida del periodo— es patrimonio que
 * todavía no se ha trasladado a una cuenta de capital, así que se muestra como
 * una línea propia dentro de patrimonio: "Resultado del ejercicio".
 *
 * Con esa línea, el balance general cuadra EXACTAMENTE siempre que cuadre el
 * balance de comprobación. La razón es aritmética: sobre todos los asientos
 * Σdebe = Σhaber, y al separar por clase eso se convierte en
 * activo = pasivo + patrimonio + resultado. No es una coincidencia que haya que
 * vigilar, es una identidad.
 *
 * ── Por tipo y con debe/haber crudo, no por naturaleza ──────────────────────
 *
 * Igual que el estado de resultados: la magnitud de cada sección se agrega por
 * `tipo` con el signo que le toca a la clase. Así las cuentas de contrapartida
 * (una depreciación acumulada de tipo activo y naturaleza acreedora) restan
 * solas de su sección sin tratamiento especial.
 */

import { balanceComprobacion, type RangoFechas } from './reportes';

export interface LineaBalanceGeneral {
  /** null en la línea sintética "Resultado del ejercicio": no es una cuenta. */
  cuentaId: number | null;
  codigo:   string;
  nombre:   string;
  montoCents: number;
}

export interface SeccionBalanceGeneral {
  lineas:     LineaBalanceGeneral[];
  totalCents: number;
}

export interface BalanceGeneral {
  activo:     SeccionBalanceGeneral;
  pasivo:     SeccionBalanceGeneral;
  /** Cuentas de patrimonio + la línea "Resultado del ejercicio". */
  patrimonio: SeccionBalanceGeneral;
  /** Utilidad (>0) o pérdida (<0) del periodo, ya incluida en `patrimonio`. */
  resultadoEjercicioCents: number;
  totalActivoCents:            number;
  totalPasivoPatrimonioCents:  number;
  /** activo == pasivo + patrimonio + resultado. Debería ser siempre true. */
  cuadra:   boolean;
  hayDatos: boolean;
}

export async function balanceGeneral(
  teamId: number,
  rango: RangoFechas = {},
): Promise<BalanceGeneral> {
  const balance = await balanceComprobacion(teamId, rango);

  const activo:     SeccionBalanceGeneral = { lineas: [], totalCents: 0 };
  const pasivo:     SeccionBalanceGeneral = { lineas: [], totalCents: 0 };
  const patrimonio: SeccionBalanceGeneral = { lineas: [], totalCents: 0 };

  // Neto de las cuentas de resultado, para la línea del ejercicio.
  let ingresoNetoCents = 0; // crédito-positivo: ventas − descuentos
  let costoGastoCents  = 0; // débito-positivo: costos + gastos

  for (const f of balance.filas) {
    switch (f.tipo) {
      case 'activo': {
        const monto = f.debeCents - f.haberCents; // débito-positivo
        activo.lineas.push({ cuentaId: f.cuentaId, codigo: f.codigo, nombre: f.nombre, montoCents: monto });
        activo.totalCents += monto;
        break;
      }
      case 'pasivo': {
        const monto = f.haberCents - f.debeCents; // crédito-positivo
        pasivo.lineas.push({ cuentaId: f.cuentaId, codigo: f.codigo, nombre: f.nombre, montoCents: monto });
        pasivo.totalCents += monto;
        break;
      }
      case 'patrimonio': {
        const monto = f.haberCents - f.debeCents; // crédito-positivo
        patrimonio.lineas.push({ cuentaId: f.cuentaId, codigo: f.codigo, nombre: f.nombre, montoCents: monto });
        patrimonio.totalCents += monto;
        break;
      }
      case 'ingreso':
        ingresoNetoCents += f.haberCents - f.debeCents;
        break;
      case 'costo':
      case 'gasto':
        costoGastoCents += f.debeCents - f.haberCents;
        break;
    }
  }

  const resultadoEjercicioCents = ingresoNetoCents - costoGastoCents;

  // La utilidad del periodo es patrimonio no distribuido. Se agrega como línea
  // sintética (sin cuentaId: no es una cuenta del catálogo todavía).
  if (resultadoEjercicioCents !== 0 || patrimonio.lineas.length > 0) {
    patrimonio.lineas.push({
      cuentaId: null,
      codigo: '',
      nombre: resultadoEjercicioCents >= 0
        ? 'Resultado del ejercicio (utilidad)'
        : 'Resultado del ejercicio (pérdida)',
      montoCents: resultadoEjercicioCents,
    });
    patrimonio.totalCents += resultadoEjercicioCents;
  }

  const totalActivoCents           = activo.totalCents;
  const totalPasivoPatrimonioCents = pasivo.totalCents + patrimonio.totalCents;

  return {
    activo, pasivo, patrimonio,
    resultadoEjercicioCents,
    totalActivoCents,
    totalPasivoPatrimonioCents,
    cuadra: totalActivoCents === totalPasivoPatrimonioCents,
    hayDatos: balance.filas.length > 0,
  };
}
