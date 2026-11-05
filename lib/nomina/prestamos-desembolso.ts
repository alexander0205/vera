/**
 * Desembolso de un préstamo o avance a un empleado: de dónde salió el dinero y su asiento.
 *
 * Al registrar el préstamo se elige una de dos cosas:
 *   · una caja o banco → nace el asiento Dr «cuentas por cobrar a empleados» / Cr esa cuenta;
 *   · «ya lo entregué antes (sin asiento)» → no se asienta nada y se avisa que el contable lo registre a mano.
 * Cancelar un préstamo al que todavía no se le descontó ninguna cuota revierte su desembolso.
 */

import { generarAsientoPrestamoEmpleado, borrarAsientoDeOrigen } from '@/lib/contabilidad/asientos';
import { asegurarCuentaPorCobrarEmpleados, vincularConceptosDePrestamo } from '@/lib/nomina/cuenta-por-cobrar-empleados';

export type DesembolsoSolicitado =
  | { tipo: 'cuenta'; cuentaSalidaId: number }
  | { tipo: 'ya-entregado' }
  | { tipo: 'sin-indicar' };

/** Lo que llegó en el cuerpo → qué se pidió. `cuentaSalidaId` ya validado como caja o banco. */
export function leerDesembolso(v: unknown): DesembolsoSolicitado {
  if (!v || typeof v !== 'object') return { tipo: 'sin-indicar' };
  const o = v as Record<string, unknown>;
  if (o.yaEntregado === true) return { tipo: 'ya-entregado' };
  if (typeof o.cuentaSalidaId === 'number' && Number.isSafeInteger(o.cuentaSalidaId) && o.cuentaSalidaId > 0) {
    return { tipo: 'cuenta', cuentaSalidaId: o.cuentaSalidaId };
  }
  return { tipo: 'sin-indicar' };
}

export const AVISO_SIN_ASIENTO =
  'El desembolso de este préstamo no se asentó: tu contable debe registrarlo a mano (Dr cuentas por cobrar a empleados / Cr caja o banco). Las cuotas que se descuenten sí abonarán a esa cuenta.';

export interface ResultadoDesembolso { asientoId: number | null; avisos: string[] }

/**
 * Asegura la cuenta por cobrar a empleados y, si se eligió de dónde salió el dinero, asienta el desembolso.
 * Nunca lanza por un problema contable: el préstamo ya existe y lo que no se pudo asentar se devuelve como aviso.
 */
export async function registrarDesembolso(input: {
  teamId: number; userId: number; prestamoId: number; montoCents: number; fecha: string; empleado: string;
  desembolso: DesembolsoSolicitado;
}): Promise<ResultadoDesembolso> {
  const avisos: string[] = [];
  const cuenta = await asegurarCuentaPorCobrarEmpleados(input.teamId, input.userId);
  if (cuenta) {
    await vincularConceptosDePrestamo(input.teamId, cuenta.cuentaId);
    if (cuenta.aviso) avisos.push(cuenta.aviso);
  }

  if (input.desembolso.tipo !== 'cuenta') {
    avisos.push(input.desembolso.tipo === 'ya-entregado' ? AVISO_SIN_ASIENTO : `No se indicó de dónde salió el dinero. ${AVISO_SIN_ASIENTO}`);
    return { asientoId: null, avisos };
  }
  if (!cuenta) {
    avisos.push(`La empresa no tiene catálogo de cuentas todavía, así que no se asentó el desembolso. ${AVISO_SIN_ASIENTO}`);
    return { asientoId: null, avisos };
  }
  try {
    const r = await generarAsientoPrestamoEmpleado(
      input.teamId,
      {
        prestamoId: input.prestamoId, montoCents: input.montoCents, cuentaPorCobrarId: cuenta.cuentaId,
        cuentaSalidaId: input.desembolso.cuentaSalidaId, fecha: input.fecha, concepto: `Préstamo a empleado · ${input.empleado}`,
      },
      input.userId,
    );
    if (r.creado) return { asientoId: r.asientoId ?? null, avisos };
    avisos.push(r.motivo === 'contabilidad-apagada'
      ? `La contabilidad está apagada: no se asentó el desembolso. ${AVISO_SIN_ASIENTO}`
      : `No se asentó el desembolso (${r.motivo}). ${AVISO_SIN_ASIENTO}`);
  } catch (err) {
    const code = (err as { code?: string; cause?: { code?: string } }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    // 23514: la restricción de orígenes aún no admite `prestamo_empleado` (falta la migración 0235).
    avisos.push(code === '23514'
      ? `Falta aplicar la migración 0235 para asentar desembolsos: no se asentó. ${AVISO_SIN_ASIENTO}`
      : `No se pudo asentar el desembolso. ${AVISO_SIN_ASIENTO}`);
  }
  return { asientoId: null, avisos };
}

/**
 * Al cancelar un préstamo: si todavía no se descontó ninguna cuota (saldo = monto), su desembolso se revierte
 * (se borra su asiento). Con cuotas ya descontadas el asiento se queda: ya hay movimiento sobre esa cuenta.
 */
export async function revertirDesembolsoSiSinCuotas(teamId: number, prestamo: { id: number; montoCents: number; saldoCents: number }): Promise<boolean> {
  if (prestamo.saldoCents !== prestamo.montoCents) return false;
  await borrarAsientoDeOrigen(teamId, 'prestamo_empleado', prestamo.id);
  return true;
}
