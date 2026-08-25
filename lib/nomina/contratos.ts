/**
 * contratos.ts — plantillas de contrato y autollenado (estilo Deel).
 *
 * Una plantilla es texto pregrabado con marcadores `{{clave}}`. Al generar el
 * contrato de un empleado se reemplazan por sus datos y los de la empresa, y el
 * resultado (texto ya lleno) se archiva como el contrato emitido. La firma
 * electrónica es fase 2; aquí solo se llena y se produce el PDF.
 *
 * Puro y sin BD: la ruta lee empleado/empresa y llama a estas funciones.
 */

/** Datos mínimos del empleado para llenar un contrato. */
export interface EmpleadoContrato {
  nombres: string;
  apellidos: string;
  cedula: string | null;
  cargo: string | null;
  salarioBaseCents: number;
  tipoContrato: string;
  frecuenciaPago: string;
  fechaIngreso: string | null;
}

/** Datos de la empresa (del team). */
export interface EmpresaContrato {
  nombre: string;
  rnc: string | null;
  direccion: string | null;
}

/** Catálogo de marcadores disponibles, para mostrarle al usuario qué puede usar. */
export const VARIABLES_CONTRATO: { clave: string; descripcion: string }[] = [
  { clave: 'nombre',        descripcion: 'Nombre completo del empleado' },
  { clave: 'cedula',        descripcion: 'Cédula del empleado' },
  { clave: 'cargo',         descripcion: 'Cargo / puesto' },
  { clave: 'salario',       descripcion: 'Salario mensual (RD$)' },
  { clave: 'salario_letras',descripcion: 'Salario en letras' },
  { clave: 'tipo_contrato', descripcion: 'Tipo de contrato' },
  { clave: 'frecuencia',    descripcion: 'Frecuencia de pago' },
  { clave: 'fecha_ingreso', descripcion: 'Fecha de ingreso' },
  { clave: 'empresa',       descripcion: 'Nombre de la empresa' },
  { clave: 'empresa_rnc',   descripcion: 'RNC de la empresa' },
  { clave: 'empresa_direccion', descripcion: 'Dirección de la empresa' },
  { clave: 'fecha',         descripcion: 'Fecha de hoy' },
];

const LABEL_CONTRATO: Record<string, string> = {
  indefinido: 'por tiempo indefinido', temporal: 'temporal',
  por_obra: 'por obra o servicio', pasantia: 'de pasantía',
};
const LABEL_FRECUENCIA: Record<string, string> = {
  mensual: 'mensual', quincenal: 'quincenal', semanal: 'semanal',
};

const fmtPesos = (cents: number) =>
  'RD$' + (cents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "2026-08-25" → "25 de agosto de 2026". Vacío → "—". */
export function fechaLarga(ymd: string | null): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  if (!y || !m || !d) return ymd;
  return `${d} de ${MESES[m - 1] ?? ''} de ${y}`;
}

/** Monto en centavos → letras ("Cincuenta mil con 00/100"). */
export function montoEnLetras(cents: number): string {
  const n = cents / 100;
  const UNI = ['', 'Un', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve',
    'Diez', 'Once', 'Doce', 'Trece', 'Catorce', 'Quince', 'Dieciséis', 'Diecisiete', 'Dieciocho', 'Diecinueve'];
  const DEC = ['', '', 'Veinte', 'Treinta', 'Cuarenta', 'Cincuenta', 'Sesenta', 'Setenta', 'Ochenta', 'Noventa'];
  const CEN = ['', 'Cien', 'Doscientos', 'Trescientos', 'Cuatrocientos', 'Quinientos',
    'Seiscientos', 'Setecientos', 'Ochocientos', 'Novecientos'];
  const c = (x: number): string => {
    if (x === 0) return '';
    if (x < 20) return UNI[x];
    if (x < 30) return x === 20 ? 'Veinte' : 'Veinti' + UNI[x % 10].toLowerCase();
    if (x < 100) return DEC[Math.floor(x / 10)] + (x % 10 ? ' y ' + UNI[x % 10].toLowerCase() : '');
    if (x === 100) return 'Cien';
    // 101..199 = "Ciento …" (no "Cien …"); el resto usa CEN[n].
    const cen = Math.floor(x / 100);
    const resto = x % 100;
    return (cen === 1 ? 'Ciento' : CEN[cen]) + (resto ? ' ' + c(resto) : '');
  };
  const entero = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);
  let t = '';
  const mill = Math.floor(entero / 1_000_000);
  const mil = Math.floor((entero % 1_000_000) / 1_000);
  const res = entero % 1_000;
  if (mill) t += (mill === 1 ? 'Un millón' : c(mill) + ' millones') + ' ';
  if (mil) t += (mil === 1 ? 'Mil' : c(mil) + ' mil') + ' ';
  if (res) t += c(res);
  if (!t) t = 'Cero';
  return t.trim() + ` con ${String(centavos).padStart(2, '0')}/100`;
}

/** Arma el mapa de valores para llenar los `{{marcadores}}`. */
export function variablesDeContrato(
  empleado: EmpleadoContrato,
  empresa: EmpresaContrato,
  hoyYMD: string,
): Record<string, string> {
  const nombre = [empleado.nombres, empleado.apellidos].filter(Boolean).join(' ').trim();
  return {
    nombre: nombre || '—',
    cedula: empleado.cedula ?? '—',
    cargo: empleado.cargo ?? '—',
    salario: fmtPesos(empleado.salarioBaseCents),
    salario_letras: montoEnLetras(empleado.salarioBaseCents) + ' pesos',
    tipo_contrato: LABEL_CONTRATO[empleado.tipoContrato] ?? empleado.tipoContrato,
    frecuencia: LABEL_FRECUENCIA[empleado.frecuenciaPago] ?? empleado.frecuenciaPago,
    fecha_ingreso: fechaLarga(empleado.fechaIngreso),
    empresa: empresa.nombre,
    empresa_rnc: empresa.rnc ?? '—',
    empresa_direccion: empresa.direccion ?? '—',
    fecha: fechaLarga(hoyYMD),
  };
}

/**
 * Reemplaza `{{clave}}` por su valor. Los marcadores desconocidos se dejan tal
 * cual, para que un typo se vea en el documento en vez de desaparecer callado.
 */
export function rellenarPlantilla(cuerpo: string, vars: Record<string, string>): string {
  return cuerpo.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, clave: string) => {
    const v = vars[clave.toLowerCase()];
    return v === undefined ? m : v;
  });
}

/**
 * Plantilla de ejemplo: contrato de trabajo RD. Base editable, no asesoría
 * legal — el usuario la ajusta a su realidad. Se ofrece con un botón para no
 * arrancar de una hoja en blanco.
 */
export const PLANTILLA_EJEMPLO = `CONTRATO DE TRABAJO {{tipo_contrato}}

Entre {{empresa}}, RNC {{empresa_rnc}}, con domicilio en {{empresa_direccion}}, en lo adelante "EL EMPLEADOR"; y {{nombre}}, portador(a) de la cédula de identidad y electoral No. {{cedula}}, en lo adelante "EL/LA TRABAJADOR(A)", se ha convenido el siguiente contrato de trabajo:

PRIMERO: EL/LA TRABAJADOR(A) prestará sus servicios para EL EMPLEADOR desempeñando el cargo de {{cargo}}, a partir del {{fecha_ingreso}}.

SEGUNDO: EL EMPLEADOR pagará a EL/LA TRABAJADOR(A) un salario de {{salario}} ({{salario_letras}}), con frecuencia de pago {{frecuencia}}, sujeto a las deducciones de ley (AFP, SFS e ISR) que correspondan.

TERCERO: La jornada de trabajo, las funciones y demás condiciones se regirán por el Código de Trabajo de la República Dominicana y por las políticas internas de EL EMPLEADOR.

CUARTO: Ambas partes se comprometen a cumplir de buena fe las obligaciones derivadas de este contrato.

Hecho y firmado en dos (2) originales, en la fecha {{fecha}}.


____________________________            ____________________________
      EL EMPLEADOR                              EL/LA TRABAJADOR(A)
      {{empresa}}                               {{nombre}}
`;
