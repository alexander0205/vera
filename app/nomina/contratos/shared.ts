// Tipos, defaults y helpers puros de las plantillas de contrato. Compartidos por
// la lista y el asistente (que ahora vive en su propia página, no en un modal).

/** Config estructurada de la plantilla (espejo de lib/nomina/contrato-estructura.ts). */
export interface ContratoConfig {
  incluirFunciones: boolean;
  funciones: string;
  lugarTrabajo: string;
  incluirJornada: boolean;
  jornadaTexto: string;
  formaPago: 'transferencia' | 'efectivo' | 'cheque';
  incluirBonos: boolean;
  bonos: string;
  incluirVacaciones: boolean;
  incluirRegalia: boolean;
  incluirTerminacion: boolean;
  confidencialidad: boolean;
  noCompetencia: boolean;
  propiedadIntelectual: boolean;
}

export const CONFIG_DEFAULT: ContratoConfig = {
  incluirFunciones: false, funciones: '', lugarTrabajo: '',
  incluirJornada: true, jornadaTexto: '',
  formaPago: 'transferencia', incluirBonos: false, bonos: '',
  incluirVacaciones: true, incluirRegalia: true,
  incluirTerminacion: true,
  confidencialidad: false, noCompetencia: false, propiedadIntelectual: false,
};

export interface Plantilla {
  id: number;
  nombre: string;
  cuerpo: string | null;
  config: ContratoConfig | null;
  activa: boolean;
}

export const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Resumen corto de las cláusulas incluidas, para la tarjeta de la lista. */
export function resumenClausulas(c: ContratoConfig): string {
  const on: string[] = ['Puesto', 'Compensación'];
  if (c.incluirJornada) on.push('Jornada');
  if (c.incluirVacaciones) on.push('Vacaciones');
  if (c.incluirRegalia) on.push('Regalía');
  if (c.incluirTerminacion) on.push('Terminación');
  if (c.confidencialidad) on.push('Confidencialidad');
  if (c.noCompetencia) on.push('No competencia');
  if (c.propiedadIntelectual) on.push('Propiedad intelectual');
  return on.join(' · ');
}
