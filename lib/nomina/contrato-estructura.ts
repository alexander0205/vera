/**
 * contrato-estructura.ts — plantilla de contrato ESTRUCTURADA (estilo Deel).
 *
 * En vez de escribir prosa con marcadores, la empresa arma el contrato por
 * pasos: elige qué cláusulas incluir y sus parámetros. Esto guarda esa config,
 * y `ensamblarContrato` produce el texto legal RD juntando fragmentos de
 * cláusula predefinidos con los datos del empleado y la empresa.
 *
 * Puro y sin BD. Base revisada contra Código de Trabajo (Ley 16-92), art. 24;
 * no sustituye revisión jurídica de cláusulas especiales o casos concretos.
 */
import {
  type EmpleadoContrato, type EmpresaContrato, variablesDeContrato, rellenarPlantilla, fechaLarga,
} from '@/lib/nomina/contratos';

/** Empleado con los campos laborales extra que usan algunas cláusulas. */
export interface EmpleadoContratoExt extends EmpleadoContrato {
  jornada: string | null;
  turno: string | null;
  diasLibres: string | null;
  vacacionesDias: number | null;
  sexo: string | null;
  fechaNacimiento: string | null;
  nacionalidad: string | null;
  estadoCivil: string | null;
  direccion: string | null;
  fechaFinContrato: string | null;
  objetoContrato: string | null;
}

/** Configuración estructurada de una plantilla (lo que arma el wizard). */
export interface ContratoConfig {
  // Paso 2 · Puesto y funciones
  incluirFunciones: boolean;
  funciones: string;
  lugarTrabajo: string;
  // Paso 3 · Jornada y horario
  incluirJornada: boolean;
  jornadaTexto: string;
  // Paso 4 · Compensación
  formaPago: 'transferencia' | 'efectivo' | 'cheque';
  incluirBonos: boolean;
  bonos: string;
  // Paso 5 · Vacaciones y beneficios
  incluirVacaciones: boolean;
  incluirRegalia: boolean;
  // Paso 6 · Terminación
  incluirTerminacion: boolean;
  // Paso 7 · Cláusulas extra
  confidencialidad: boolean;
  noCompetencia: boolean;
  propiedadIntelectual: boolean;
}

/** Config por defecto: lo razonable para un contrato RD estándar. */
export const CONFIG_DEFAULT: ContratoConfig = {
  incluirFunciones: false,
  funciones: '',
  lugarTrabajo: '',
  incluirJornada: true,
  jornadaTexto: '',
  formaPago: 'transferencia',
  incluirBonos: false,
  bonos: '',
  incluirVacaciones: true,
  incluirRegalia: true,
  incluirTerminacion: true,
  confidencialidad: false,
  noCompetencia: false,
  propiedadIntelectual: false,
};

const LABEL_JORNADA: Record<string, string> = {
  tiempo_completo: 'tiempo completo', medio_tiempo: 'medio tiempo', por_horas: 'por horas',
};
const LABEL_TURNO: Record<string, string> = {
  diurno: 'diurno', nocturno: 'nocturno', mixto: 'mixto', rotativo: 'rotativo',
};
const LABEL_FORMA_PAGO: Record<ContratoConfig['formaPago'], string> = {
  transferencia: 'transferencia bancaria', efectivo: 'efectivo', cheque: 'cheque',
};
const LABEL_SEXO: Record<string, string> = { masculino: 'masculino', femenino: 'femenino' };

/** Edad declarada a la fecha de firma; el documento conserva esa fecha. */
function edadEnFecha(fechaNacimiento: string, hoyYMD: string): number {
  const [ny, nm, nd] = fechaNacimiento.split('-').map(Number);
  const [hy, hm, hd] = hoyYMD.split('-').map(Number);
  return hy - ny - (hm < nm || (hm === nm && hd < nd) ? 1 : 0);
}

/** Normaliza una config parcial (de la BD o del cliente) a una completa. */
export function normalizarConfig(raw: unknown): ContratoConfig {
  const c = (raw ?? {}) as Partial<ContratoConfig>;
  return {
    ...CONFIG_DEFAULT,
    ...c,
    funciones: String(c.funciones ?? ''),
    lugarTrabajo: String(c.lugarTrabajo ?? ''),
    jornadaTexto: String(c.jornadaTexto ?? ''),
    bonos: String(c.bonos ?? ''),
    formaPago: (['transferencia', 'efectivo', 'cheque'] as const).includes(c.formaPago as ContratoConfig['formaPago'])
      ? (c.formaPago as ContratoConfig['formaPago']) : 'transferencia',
    // Booleans: respeta lo que venga, cae al default si no es booleano.
    incluirFunciones: typeof c.incluirFunciones === 'boolean' ? c.incluirFunciones : CONFIG_DEFAULT.incluirFunciones,
    incluirJornada: typeof c.incluirJornada === 'boolean' ? c.incluirJornada : CONFIG_DEFAULT.incluirJornada,
    incluirBonos: typeof c.incluirBonos === 'boolean' ? c.incluirBonos : CONFIG_DEFAULT.incluirBonos,
    incluirVacaciones: typeof c.incluirVacaciones === 'boolean' ? c.incluirVacaciones : CONFIG_DEFAULT.incluirVacaciones,
    incluirRegalia: typeof c.incluirRegalia === 'boolean' ? c.incluirRegalia : CONFIG_DEFAULT.incluirRegalia,
    incluirTerminacion: typeof c.incluirTerminacion === 'boolean' ? c.incluirTerminacion : CONFIG_DEFAULT.incluirTerminacion,
    confidencialidad: typeof c.confidencialidad === 'boolean' ? c.confidencialidad : CONFIG_DEFAULT.confidencialidad,
    noCompetencia: typeof c.noCompetencia === 'boolean' ? c.noCompetencia : CONFIG_DEFAULT.noCompetencia,
    propiedadIntelectual: typeof c.propiedadIntelectual === 'boolean' ? c.propiedadIntelectual : CONFIG_DEFAULT.propiedadIntelectual,
  };
}

/**
 * Datos mínimos del modelo estructurado según art. 24, Ley 16-92. Las
 * plantillas de texto libre siguen editables porque su redactor controla el
 * contenido; no se puede inferir programáticamente que los incluyan.
 */
export function validarContratoEstructuradoRD(
  config: ContratoConfig,
  empleado: EmpleadoContratoExt,
  empresa: EmpresaContrato,
): string[] {
  const faltantes: string[] = [];
  const requiere = (ok: unknown, campo: string) => { if (!ok) faltantes.push(campo); };

  requiere(empleado.cedula, 'cédula del trabajador');
  requiere(empleado.nacionalidad, 'nacionalidad del trabajador');
  requiere(empleado.fechaNacimiento, 'fecha de nacimiento del trabajador');
  requiere(empleado.sexo, 'sexo del trabajador');
  requiere(empleado.estadoCivil, 'estado civil del trabajador');
  requiere(empleado.direccion, 'dirección de residencia del trabajador');
  requiere(empleado.cargo, 'servicio o cargo');
  requiere(empleado.fechaIngreso, 'fecha de inicio');
  requiere(empleado.salarioBaseCents > 0, 'salario');
  requiere(config.incluirJornada && config.jornadaTexto.trim(), 'horario de trabajo');
  requiere(config.lugarTrabajo.trim(), 'lugar de trabajo');
  requiere(empresa.rnc, 'RNC del empleador');
  requiere(empresa.direccion, 'domicilio del empleador');
  requiere(empresa.representanteNombre, 'representante legal del empleador');
  requiere(empresa.representanteCedula, 'cédula del representante legal');

  if (empleado.tipoContrato === 'temporal') requiere(empleado.fechaFinContrato, 'fecha de finalización del contrato temporal');
  if (empleado.tipoContrato === 'por_obra') requiere(empleado.objetoContrato?.trim(), 'obra o servicio determinado');
  if (empleado.tipoContrato === 'pasantia') faltantes.push('modelo específico de pasantía validado legalmente');
  return faltantes;
}

const ORDINALES = [
  'PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO', 'SÉPTIMO', 'OCTAVO',
  'NOVENO', 'DÉCIMO', 'DÉCIMO PRIMERO', 'DÉCIMO SEGUNDO', 'DÉCIMO TERCERO', 'DÉCIMO CUARTO',
  'DÉCIMO QUINTO', 'DÉCIMO SEXTO',
];

/**
 * Ensambla el texto del contrato desde la config + los datos del empleado y la
 * empresa. Numera las cláusulas incluidas (PRIMERO, SEGUNDO…) en orden.
 */
export function ensamblarContrato(
  config: ContratoConfig,
  empleado: EmpleadoContratoExt,
  empresa: EmpresaContrato,
  hoyYMD: string,
): string {
  const v = variablesDeContrato(empleado, empresa, hoyYMD);
  const clausulas: string[] = [];

  // Modalidad: Ley 16-92, arts. 25, 26 y 31.
  if (empleado.tipoContrato === 'temporal') {
    clausulas.push(`Este contrato se celebra por cierto tiempo, desde el ${v.fecha_ingreso} hasta el ${fechaLarga(empleado.fechaFinContrato)}, conforme a la naturaleza temporal del servicio pactado.`);
  } else if (empleado.tipoContrato === 'por_obra') {
    clausulas.push(`Este contrato se celebra para la obra o servicio determinado siguiente: ${empleado.objetoContrato?.trim()}. Concluye al terminar dicha obra o servicio, conforme al Código de Trabajo de la República Dominicana.`);
  } else {
    clausulas.push('Este contrato se celebra por tiempo indefinido, conforme al Código de Trabajo de la República Dominicana.');
  }

  // Puesto y funciones (siempre)
  let puesto = `EL/LA TRABAJADOR(A) prestará sus servicios a EL EMPLEADOR desempeñando el cargo de ${v.cargo}, a partir del ${v.fecha_ingreso}`;
  if (config.lugarTrabajo.trim()) puesto += `, en ${config.lugarTrabajo.trim()}`;
  puesto += '.';
  if (config.incluirFunciones && config.funciones.trim()) {
    puesto += ` Sus funciones principales serán: ${config.funciones.trim()}.`;
  }
  clausulas.push(puesto);

  // Jornada
  if (config.incluirJornada) {
    const partes: string[] = [];
    if (empleado.jornada) partes.push(`a ${LABEL_JORNADA[empleado.jornada] ?? empleado.jornada}`);
    if (empleado.turno) partes.push(`en turno ${LABEL_TURNO[empleado.turno] ?? empleado.turno}`);
    let j = partes.length ? `La jornada de trabajo será ${partes.join(', ')}` : 'La jornada de trabajo se regirá por el Código de Trabajo';
    if (empleado.diasLibres?.trim()) j += `, con descanso semanal el ${empleado.diasLibres.trim()}`;
    j += '.';
    if (config.jornadaTexto.trim()) j += ` Horario: ${config.jornadaTexto.trim()}.`;
    clausulas.push(j);
  }

  // Compensación (siempre)
  let comp = `EL EMPLEADOR pagará a EL/LA TRABAJADOR(A) un salario de ${v.salario} (${v.salario_letras}), con frecuencia de pago ${v.frecuencia}, mediante ${LABEL_FORMA_PAGO[config.formaPago]}, sujeto únicamente a las deducciones y retenciones legalmente aplicables, incluyendo AFP, SFS e ISR cuando correspondan.`;
  if (config.incluirBonos && config.bonos.trim()) comp += ` Adicionalmente: ${config.bonos.trim()}.`;
  clausulas.push(comp);

  // Vacaciones
  if (config.incluirVacaciones) {
    const dias = empleado.vacacionesDias && empleado.vacacionesDias > 0 ? `${empleado.vacacionesDias} días` : 'los días que establece la ley';
    clausulas.push(`EL/LA TRABAJADOR(A) tendrá derecho a un período de vacaciones anuales de ${dias}, conforme al Código de Trabajo de la República Dominicana.`);
  }
  // Regalía
  if (config.incluirRegalia) {
    clausulas.push('EL/LA TRABAJADOR(A) tendrá derecho al salario de Navidad (regalía pascual) conforme a los artículos 219 y siguientes del Código de Trabajo.');
  }
  // Terminación
  if (config.incluirTerminacion) {
    clausulas.push('La terminación de este contrato se regirá por el Código de Trabajo de la República Dominicana, incluyendo el preaviso y el auxilio de cesantía cuando correspondan.');
  }
  // Cláusulas extra
  if (config.confidencialidad) {
    clausulas.push('EL/LA TRABAJADOR(A) se obliga a guardar estricta confidencialidad sobre la información, datos y secretos de EL EMPLEADOR, durante la vigencia del contrato y después de su terminación.');
  }
  if (config.noCompetencia) {
    clausulas.push('Durante la vigencia del contrato, EL/LA TRABAJADOR(A) se abstendrá de realizar, por cuenta propia o ajena, actividades que compitan directamente con EL EMPLEADOR.');
  }
  if (config.propiedadIntelectual) {
    clausulas.push('Las obras, invenciones y desarrollos creados por EL/LA TRABAJADOR(A) en ejercicio de sus funciones pertenecen a EL EMPLEADOR.');
  }
  // Regla general (siempre, al final)
  clausulas.push('Las demás condiciones no previstas en este contrato se regirán por el Código de Trabajo de la República Dominicana y por las políticas internas de EL EMPLEADOR.');

  const cuerpoClausulas = clausulas
    .map((c, i) => `${ORDINALES[i] ?? `CLÁUSULA ${i + 1}`}: ${c}`)
    .join('\n\n');

  return `CONTRATO DE TRABAJO ${v.tipo_contrato.toUpperCase()}

Entre ${v.empresa}, RNC ${v.empresa_rnc}, con domicilio en ${v.empresa_direccion}, debidamente representada por ${empresa.representanteNombre ?? '—'}, titular de la cédula No. ${empresa.representanteCedula ?? '—'}, en lo adelante «EL EMPLEADOR»; y ${v.nombre}, de nacionalidad ${empleado.nacionalidad ?? '—'}, ${empleado.fechaNacimiento ? `${edadEnFecha(empleado.fechaNacimiento, hoyYMD)} años de edad` : '—'}, de sexo ${LABEL_SEXO[empleado.sexo ?? ''] ?? empleado.sexo ?? '—'}, estado civil ${empleado.estadoCivil ?? '—'}, con domicilio en ${empleado.direccion ?? '—'}, portador(a) de la cédula de identidad y electoral No. ${v.cedula}, en lo adelante «EL/LA TRABAJADOR(A)», se ha convenido el siguiente contrato de trabajo:

${cuerpoClausulas}

Hecho y firmado de buena fe en dos (2) originales de un mismo tenor, en la fecha ${v.fecha}.


____________________________            ____________________________
      EL EMPLEADOR                              EL/LA TRABAJADOR(A)
      ${v.empresa}                              ${v.nombre}
`;
}

/** El título del contrato = su primera línea (para el snapshot emitido). */
export function tituloDeContrato(cuerpo: string, fallback: string): string {
  return (cuerpo.split('\n').find((l) => l.trim()) ?? fallback).trim().slice(0, 200);
}

/**
 * Texto lleno del contrato de un empleado desde una plantilla, sea estructurada
 * (config → ensamblar) o de prosa vieja (cuerpo → rellenar marcadores). Devuelve
 * el cuerpo y su título. Un solo lugar para que la generación y la vista previa
 * no se desincronicen.
 */
export function cuerpoDeContrato(
  plantilla: { nombre: string; cuerpo: string | null; config: unknown },
  empleado: EmpleadoContratoExt,
  empresa: EmpresaContrato,
  hoyYMD: string,
): { cuerpo: string; titulo: string } {
  let cuerpo: string;
  if (plantilla.config != null && typeof plantilla.config === 'object') {
    cuerpo = ensamblarContrato(normalizarConfig(plantilla.config), empleado, empresa, hoyYMD);
  } else {
    cuerpo = rellenarPlantilla(plantilla.cuerpo ?? '', variablesDeContrato(empleado, empresa, hoyYMD));
  }
  return { cuerpo, titulo: tituloDeContrato(cuerpo, plantilla.nombre) };
}

/**
 * Empleado de ejemplo para previsualizar una plantilla SIN un empleado real
 * (en el editor). Usa etiquetas entre corchetes donde irían los datos.
 */
export const EMPLEADO_EJEMPLO: EmpleadoContratoExt = {
  nombres: '[Nombre',
  apellidos: 'del empleado]',
  cedula: '[cédula]',
  cargo: '[cargo]',
  salarioBaseCents: 3000000,
  tipoContrato: 'indefinido',
  frecuenciaPago: 'mensual',
  fechaIngreso: null,
  jornada: 'tiempo_completo',
  turno: 'diurno',
  diasLibres: 'domingo',
  vacacionesDias: 14,
  sexo: '—',
  fechaNacimiento: '1990-01-01',
  nacionalidad: '—',
  estadoCivil: '—',
  direccion: '—',
  fechaFinContrato: null,
  objetoContrato: null,
};

export { fechaLarga };
