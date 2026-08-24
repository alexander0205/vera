/**
 * Archivo de dispersión bancaria (Camino A) — función pura, sin BD.
 *
 * La app NO mueve dinero: arma el archivo de nómina que el dueño sube a su
 * banca en línea para que el banco pague a cada empleado. Así no somos
 * intermediarios de fondos (sin licencia, sin riesgo regulatorio) y el
 * resultado es igual de útil que el de Alegra en RD.
 *
 * El formato por defecto es un CSV con los campos que todo banco pide para una
 * nómina; los layouts propietarios de cada banco (Banreservas/Popular/BHD) se
 * agregan como formatos nuevos sin tocar el resto. Un empleado sin cuenta de
 * banco no se puede dispersar: sale en `incompletos`, no en el archivo.
 */

export type FormatoDispersion = 'csv';

/** Un beneficiario de la dispersión: la línea de la corrida + su banco. */
export interface BeneficiarioDispersion {
  empleadoId: number;
  nombre: string;
  cedula: string | null;
  netoCents: number;
  bancoNombre: string | null;
  bancoCuenta: string | null;
  bancoTipoCuenta: string | null;
}

export interface ArchivoDispersion {
  formato: FormatoDispersion;
  nombreArchivo: string;
  contenido: string;
  /** Cuántos beneficiarios entraron y cuánto suman, en centavos. */
  totalBeneficiarios: number;
  totalCents: number;
  /** Empleados excluidos por no tener cuenta de banco (nombre + motivo). */
  incompletos: { empleadoId: number; nombre: string; motivo: string }[];
}

const pesos = (cents: number) => (cents / 100).toFixed(2);

/** Escapa un campo CSV: comillas si trae coma, comilla o salto de línea. */
function csvCampo(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

const CABECERA_CSV = ['Cedula', 'Nombre', 'Banco', 'TipoCuenta', 'Cuenta', 'MontoRD', 'Referencia'];

/** ¿El beneficiario tiene lo mínimo para dispersar (banco + cuenta)? */
function dispersable(b: BeneficiarioDispersion): boolean {
  return Boolean(b.bancoNombre?.trim()) && Boolean(b.bancoCuenta?.trim());
}

/**
 * Arma el archivo de dispersión de una corrida. `referencia` es el concepto que
 * verá el empleado en su cuenta (p. ej. "Nomina 2026-07").
 */
export function generarArchivoDispersion(
  beneficiarios: BeneficiarioDispersion[],
  opts: { periodo: string; referencia: string; formato?: FormatoDispersion },
): ArchivoDispersion {
  const formato = opts.formato ?? 'csv';
  const incluidos = beneficiarios.filter(dispersable);
  const incompletos = beneficiarios
    .filter((b) => !dispersable(b))
    .map((b) => ({ empleadoId: b.empleadoId, nombre: b.nombre, motivo: 'Sin cuenta de banco' }));

  const filas = incluidos.map((b) =>
    [
      b.cedula ?? '',
      b.nombre,
      b.bancoNombre ?? '',
      b.bancoTipoCuenta ?? '',
      b.bancoCuenta ?? '',
      pesos(b.netoCents),
      opts.referencia,
    ].map(csvCampo).join(','),
  );

  const contenido = [CABECERA_CSV.join(','), ...filas].join('\r\n') + '\r\n';
  const totalCents = incluidos.reduce((s, b) => s + b.netoCents, 0);

  return {
    formato,
    nombreArchivo: `dispersion-nomina-${opts.periodo}.csv`,
    contenido,
    totalBeneficiarios: incluidos.length,
    totalCents,
    incompletos,
  };
}
