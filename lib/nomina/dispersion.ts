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
 * empleado sin cuenta no se puede dispersar: sale en `incompletos`.
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
  /** Empleados excluidos por no tener cuenta de banco (nombre + motivo). */
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

/** ¿El beneficiario tiene lo mínimo para dispersar (banco + cuenta)? */
function dispersable(b: BeneficiarioDispersion): boolean {
  return Boolean(b.bancoNombre?.trim()) && Boolean(b.bancoCuenta?.trim());
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
  const incluidos = beneficiarios.filter(dispersable);
  const incompletos = beneficiarios
    .filter((b) => !dispersable(b))
    .map((b) => ({ empleadoId: b.empleadoId, nombre: b.nombre, motivo: 'Sin cuenta de banco' }));

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
