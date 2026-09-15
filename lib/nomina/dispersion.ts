/**
 * Archivo de dispersión bancaria (Camino A) — función pura, sin BD.
 *
 * La app NO mueve dinero: arma el archivo de nómina que el dueño sube a su
 * banca en línea para que el banco pague a cada empleado. Así no somos
 * intermediarios de fondos (sin licencia, sin riesgo regulatorio).
 *
 * El layout se decide por un FormatoBanco (lib/nomina/formatos-banco.ts): qué
 * columnas, en qué orden, con qué separador y códigos. El formato exacto de
 * cada banco no es público —viene en su instructivo— así que los presets por
 * banco son plantillas base a confirmar; el genérico CSV siempre funciona. Un
 * empleado sin cuenta o sin tipo de cuenta no se puede dispersar: sale en
 * `incompletos` con el motivo.
 */

import {
  getFormatoBanco,
  type ColumnaDispersion,
  type FormatoBanco,
} from '@/lib/nomina/formatos-banco';

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
  formato: string;
  formatoNombre: string;
  nombreArchivo: string;
  contenido: string;
  /** Cuántos beneficiarios entraron y cuánto suman, en centavos. */
  totalBeneficiarios: number;
  totalCents: number;
  /** Empleados excluidos por no tener la cuenta completa (nombre + motivo). */
  incompletos: { empleadoId: number; nombre: string; motivo: string }[];
  /** Aviso de verificación del formato elegido (presets por banco). */
  nota?: string;
}

const pesos = (cents: number) => (cents / 100).toFixed(2);

/** Escapa un campo: comillas si trae el delimitador, comilla o salto de línea. */
function escapar(v: string, delim: string): string {
  if (v.includes(delim) || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** Los tipos de cuenta que entienden los formatos de banco. */
export const TIPOS_CUENTA_BANCO = ['ahorros', 'corriente'] as const;

/** ¿Es un tipo de cuenta que los formatos saben escribir? */
export function esTipoCuentaBanco(v: unknown): boolean {
  return (TIPOS_CUENTA_BANCO as readonly string[]).includes(String(v ?? '').trim().toLowerCase());
}

/**
 * Por qué un beneficiario NO puede entrar al archivo, o null si puede.
 *
 * El tipo de cuenta es obligatorio y no un adorno: los cuatro formatos lo
 * escriben en su columna (AH/CT, 1/2, AHO/COR) y un vacío ahí es una línea que
 * el banco rechaza. Antes solo se exigían banco y cuenta, y quien no tenía tipo
 * salía en el archivo con la columna en blanco sin que nadie se enterara.
 */
function motivoNoDispersable(b: BeneficiarioDispersion): string | null {
  if (!b.bancoNombre?.trim() || !b.bancoCuenta?.trim()) return 'Sin cuenta de banco';
  if (!esTipoCuentaBanco(b.bancoTipoCuenta)) return 'Falta el tipo de cuenta (ahorros o corriente)';
  return null;
}

/** Valor de una columna para un beneficiario, según el formato. */
function valorColumna(col: ColumnaDispersion, b: BeneficiarioDispersion, f: FormatoBanco, referencia: string): string {
  switch (col) {
    case 'cedula':     return b.cedula ?? '';
    case 'nombre':     return b.nombre;
    case 'banco':      return b.bancoNombre ?? '';
    case 'tipoCuenta': {
      const t = (b.bancoTipoCuenta ?? '').toLowerCase();
      if (t === 'ahorros' || t === 'corriente') return f.tipoCuentaMap[t];
      return b.bancoTipoCuenta ?? '';
    }
    case 'cuenta':     return b.bancoCuenta ?? '';
    case 'monto':      return f.montoConDecimales ? pesos(b.netoCents) : String(b.netoCents);
    case 'referencia': return referencia;
  }
}

/**
 * Arma el archivo de dispersión de una corrida. `formatoKey` elige el layout
 * (default: genérico CSV). `referencia` es el concepto que verá el empleado.
 */
export function generarArchivoDispersion(
  beneficiarios: BeneficiarioDispersion[],
  opts: { periodo: string; referencia: string; formatoKey?: string },
): ArchivoDispersion {
  const f = getFormatoBanco(opts.formatoKey);
  const incluidos = beneficiarios.filter((b) => motivoNoDispersable(b) === null);
  const incompletos = beneficiarios.flatMap((b) => {
    const motivo = motivoNoDispersable(b);
    return motivo ? [{ empleadoId: b.empleadoId, nombre: b.nombre, motivo }] : [];
  });

  const filas = incluidos.map((b) =>
    f.columnas
      .map((col) => escapar(valorColumna(col, b, f, opts.referencia), f.delimitador))
      .join(f.delimitador),
  );

  const lineas = f.cabecera
    ? [f.columnas.map((c) => f.etiquetas[c]).join(f.delimitador), ...filas]
    : filas;
  const contenido = lineas.join('\r\n') + '\r\n';
  const totalCents = incluidos.reduce((s, b) => s + b.netoCents, 0);

  return {
    formato: f.key,
    formatoNombre: f.nombre,
    nombreArchivo: `dispersion-nomina-${opts.periodo}-${f.key}.${f.extension}`,
    contenido,
    totalBeneficiarios: incluidos.length,
    totalCents,
    incompletos,
    nota: f.nota,
  };
}
