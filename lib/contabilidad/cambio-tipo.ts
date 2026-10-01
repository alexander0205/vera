/**
 * lib/contabilidad/cambio-tipo.ts — Cuándo se le puede cambiar el tipo a una
 * cuenta que ya tiene movimientos.
 *
 * Los reportes leen el tipo de la cuenta cada vez que se generan; no hay foto
 * histórica. Cambiar el tipo no toca ningún asiento, pero mueve el saldo de la
 * cuenta de un reporte a otro, también en meses anteriores. Por eso antes estaba
 * prohibido sin excepciones, y una empresa que creó una cuenta de gasto como
 * Activo por error (pasó en 2026-10, cuentas 6301/6304/6320) no tenía salida.
 *
 * Ahora se permite cuando no daña nada (reglas revisadas con el tech lead,
 * 2026-10-01):
 *   1. la naturaleza del tipo nuevo es la naturaleza actual de la cuenta, y no
 *      cambia en la misma operación: el saldo nunca se da vuelta;
 *   2. sin movimientos en un ejercicio cerrado: esos saldos no se mueven hacia
 *      atrás, y hay que reabrir el ejercicio primero;
 *   3. sin romper un método de cobro: su cuenta de entrada es de activo y su
 *      cuenta de comisión es de gasto (las mismas reglas de `guardarMetodo`);
 *   4. con confirmación explícita de quien lo hace.
 *
 * Pura: quien la llama junta los hechos con consultas (ver `editarCuenta`).
 */

import { naturalezaPorTipo, type TipoCuenta, type NaturalezaCuenta } from './catalogo-base';
import { ETIQUETA_TIPO } from './cuentas-excel';

export type GrupoTipo = 'balance' | 'resultado';

/** En qué reporte vive el saldo de una cuenta de este tipo. */
export function grupoDeTipo(tipo: TipoCuenta): GrupoTipo {
  return tipo === 'ingreso' || tipo === 'costo' || tipo === 'gasto' ? 'resultado' : 'balance';
}

const NOMBRE_REPORTE: Record<GrupoTipo, string> = {
  balance: 'Balance general',
  resultado: 'Estado de resultados',
};

/** Un método de cobro que usa la cuenta, con la etiqueta que ve el usuario. */
export interface UsoEnMetodo {
  metodo: string;
  rol: 'entrada' | 'comision';
}

export interface HechosCambioTipo {
  codigo:   string;
  nombre:   string;
  tipoActual: TipoCuenta;
  tipoNuevo:  TipoCuenta;
  naturalezaActual: NaturalezaCuenta;
  /** La naturaleza con la que quedaría la cuenta tras guardar. */
  naturalezaFinal:  NaturalezaCuenta;
  movimientos: number;
  /** Si tiene líneas fechadas dentro de un ejercicio ya cerrado. */
  movimientosEnEjercicioCerrado: boolean;
  usosEnMetodos: UsoEnMetodo[];
  /** Quien lo pide ya vio el aviso y confirmó. */
  confirmado: boolean;
}

export type ResultadoCambioTipo =
  /** No hay cambio de tipo, o la cuenta no tiene movimientos. */
  | { decision: 'libre' }
  | { decision: 'bloqueado'; mensaje: string }
  | { decision: 'requiere-confirmacion'; mensaje: string }
  | { decision: 'permitido' };

export function evaluarCambioTipo(h: HechosCambioTipo): ResultadoCambioTipo {
  if (h.tipoNuevo === h.tipoActual || h.movimientos === 0) return { decision: 'libre' };

  const cuenta = `${h.codigo} ${h.nombre}`;
  const de = ETIQUETA_TIPO[h.tipoActual];
  const a  = ETIQUETA_TIPO[h.tipoNuevo];

  // 1. Con otra naturaleza, el saldo de la cuenta saldría con el signo
  // contrario en todos los reportes. Se compara contra la naturaleza GUARDADA:
  // una cuenta invertida (1202, activo acreedora) tampoco puede pasar a Gastos.
  if (naturalezaPorTipo(h.tipoNuevo) !== h.naturalezaActual) {
    const posibles = h.naturalezaActual === 'deudora'
      ? 'Activo, Costos o Gastos'
      : 'Pasivo, Patrimonio o Ingresos';
    return {
      decision: 'bloqueado',
      mensaje:
        `"${cuenta}" tiene movimientos, y pasarla de ${de} a ${a} daría vuelta a su saldo. ` +
        `Es de naturaleza ${h.naturalezaActual}, así que con movimientos solo puede pasar a ${posibles}.`,
    };
  }
  if (h.naturalezaFinal !== h.naturalezaActual) {
    return {
      decision: 'bloqueado',
      mensaje:
        `"${cuenta}" tiene movimientos: se le puede cambiar el tipo, pero no la naturaleza, ` +
        `que tiene que quedarse ${h.naturalezaActual}.`,
    };
  }

  // 2. Los saldos de un ejercicio cerrado no se mueven hacia atrás.
  if (h.movimientosEnEjercicioCerrado) {
    return {
      decision: 'bloqueado',
      mensaje:
        `"${cuenta}" tiene movimientos en un ejercicio ya cerrado, y esos saldos no se pueden ` +
        `mover hacia atrás. Para pasarla de ${de} a ${a}, reabre el ejercicio en ` +
        '«Cierre de ejercicio», cambia el tipo y vuelve a cerrarlo.',
    };
  }

  // 3. Las mismas reglas que pone la configuración al asignar la cuenta.
  for (const u of h.usosEnMetodos) {
    if (u.rol === 'entrada' && h.tipoNuevo !== 'activo') {
      return {
        decision: 'bloqueado',
        mensaje:
          `"${cuenta}" es la cuenta donde entra el dinero de ${u.metodo}, y esa cuenta tiene ` +
          'que ser de Activo. Cámbiala en Configuración contable antes de cambiarle el tipo.',
      };
    }
    if (u.rol === 'comision' && h.tipoNuevo !== 'gasto') {
      return {
        decision: 'bloqueado',
        mensaje:
          `"${cuenta}" es la cuenta de comisión de ${u.metodo}, y esa cuenta tiene que ser ` +
          'de Gastos. Cámbiala en Configuración contable antes de cambiarle el tipo.',
      };
    }
  }

  // 4. Nada lo impide, pero mueve cifras ya reportadas: que se vea antes.
  if (!h.confirmado) {
    const n = h.movimientos === 1 ? '1 movimiento' : `${h.movimientos} movimientos`;
    const grupoActual = grupoDeTipo(h.tipoActual);
    const grupoNuevo  = grupoDeTipo(h.tipoNuevo);
    const cruza = grupoActual !== grupoNuevo;
    const efecto = cruza
      ? `Su saldo pasa del ${NOMBRE_REPORTE[grupoActual]} al ${NOMBRE_REPORTE[grupoNuevo]}`
      : `Su saldo cambia de sección dentro del ${NOMBRE_REPORTE[grupoActual]}`;
    return {
      decision: 'requiere-confirmacion',
      mensaje:
        `"${cuenta}" tiene ${n}. Pasarla de ${de} a ${a} no cambia ningún asiento. ` +
        `${efecto}, también en los reportes de meses anteriores.`,
    };
  }

  return { decision: 'permitido' };
}
