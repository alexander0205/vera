// Tipos, etiquetas y helpers puros del maestro de empleados. Viven aquí (sin
// JSX) para que tanto la lista (`_page-client`) como el asistente (`wizard`) los
// compartan sin import circular.

export interface Empleado {
  id: number;
  cedula: string | null;
  nombres: string;
  apellidos: string;
  cargo: string | null;
  tipoContrato: string;
  salarioBaseCents: number;
  frecuenciaPago: string;
  fechaIngreso: string | null;
  fechaSalida: string | null;
  estado: string;
  afp: string | null;
  ars: string | null;
  bancoNombre: string | null;
  bancoCuenta: string | null;
  bancoTipoCuenta: string | null;
  sexo: string | null;
  fechaNacimiento: string | null;
  nacionalidad: string | null;
  pais: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  jornada: string | null;
  turno: string | null;
  vacacionesDias: number | null;
  diasLibres: string | null;
  origen: string;
  origenRef: string | null;
}

export const fetcher = (url: string) => fetch(url).then((r) => r.json());

const RD = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 });
export const pesos = (cents: number) => RD.format((cents ?? 0) / 100);

export function nombreCompleto(e: Empleado): string {
  return [e.nombres, e.apellidos].filter(Boolean).join(' ').trim() || 'Sin nombre';
}
export function iniciales(e: Empleado): string {
  const n = (e.nombres ?? '').trim()[0] ?? '';
  const a = (e.apellidos ?? '').trim()[0] ?? '';
  return (n + a).toUpperCase() || '·';
}
export const esActivo = (estado: string) => estado === 'activo';

export const LABEL_CONTRATO: Record<string, string> = {
  indefinido: 'Indefinido', temporal: 'Temporal', por_obra: 'Por obra', pasantia: 'Pasantía',
};
export const LABEL_FRECUENCIA: Record<string, string> = {
  mensual: 'Mensual', quincenal: 'Quincenal', semanal: 'Semanal',
};
export const LABEL_JORNADA: Record<string, string> = {
  tiempo_completo: 'Tiempo completo', medio_tiempo: 'Medio tiempo', por_horas: 'Por horas',
};
export const LABEL_TURNO: Record<string, string> = {
  diurno: 'Diurno', nocturno: 'Nocturno', mixto: 'Mixto', rotativo: 'Rotativo',
};
export const LABEL_TIPO_DOC: Record<string, string> = {
  antecedentes: 'Verificación de antecedentes', cedula: 'Cédula', titulo: 'Título', otro: 'Otro',
};

/** Bytes legibles para el listado de documentos. */
export function tam(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Estado en blanco del formulario (crear). Salario en pesos, texto para el input. */
export function formVacio() {
  return {
    cedula: '', nombres: '', apellidos: '', cargo: '',
    tipoContrato: 'indefinido', salarioBase: '', frecuenciaPago: 'mensual',
    fechaIngreso: '', afp: '', ars: '',
    bancoNombre: '', bancoCuenta: '', bancoTipoCuenta: '',
    sexo: '', fechaNacimiento: '', nacionalidad: '', pais: 'República Dominicana',
    telefono: '', email: '', notas: '',
    jornada: 'tiempo_completo', turno: 'diurno', vacacionesDias: '', diasLibres: '',
    estado: 'activo', fechaSalida: '',
  };
}
export type FormState = ReturnType<typeof formVacio>;

export function empleadoAForm(e: Empleado): FormState {
  return {
    cedula: e.cedula ?? '', nombres: e.nombres, apellidos: e.apellidos, cargo: e.cargo ?? '',
    tipoContrato: e.tipoContrato, salarioBase: e.salarioBaseCents ? String(e.salarioBaseCents / 100) : '',
    frecuenciaPago: e.frecuenciaPago, fechaIngreso: e.fechaIngreso ?? '',
    afp: e.afp ?? '', ars: e.ars ?? '',
    bancoNombre: e.bancoNombre ?? '', bancoCuenta: e.bancoCuenta ?? '', bancoTipoCuenta: e.bancoTipoCuenta ?? '',
    sexo: e.sexo ?? '', fechaNacimiento: e.fechaNacimiento ?? '', nacionalidad: e.nacionalidad ?? '',
    pais: e.pais ?? '', telefono: e.telefono ?? '', email: e.email ?? '', notas: e.notas ?? '',
    jornada: e.jornada ?? '', turno: e.turno ?? '',
    vacacionesDias: e.vacacionesDias != null ? String(e.vacacionesDias) : '', diasLibres: e.diasLibres ?? '',
    estado: e.estado, fechaSalida: e.fechaSalida ?? '',
  };
}
