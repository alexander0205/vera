/**
 * Registro de formatos de archivo de dispersión por banco.
 *
 * Cada banco dominicano define su propio layout para el archivo de nómina que
 * se sube a la banca en línea, y **los específicos (posiciones exactas) no son
 * públicos**: el banco los entrega en su instructivo al cliente empresarial.
 * Por eso aquí NO se inventan posiciones de bytes; se modela lo que sí se puede
 * parametrizar de forma segura y suele bastar para los portales que aceptan
 * CSV/Excel: qué columnas, en qué orden, con qué separador, con o sin cabecera,
 * cómo se escribe el tipo de cuenta y cómo el monto.
 *
 * Agregar el layout exacto de un banco = una entrada nueva en FORMATOS, sin
 * tocar el generador. Cada preset lleva una `nota` de verificación: los códigos
 * y el orden deben cotejarse contra el instructivo del banco antes de producir.
 */

export type ColumnaDispersion =
  | 'cedula' | 'nombre' | 'banco' | 'tipoCuenta' | 'cuenta' | 'monto' | 'referencia';

export interface FormatoBanco {
  key: string;
  /** Nombre para el usuario (el selector). */
  nombre: string;
  /** Separador de campos. */
  delimitador: string;
  /** ¿Incluir fila de cabecera con los nombres de columna? */
  cabecera: boolean;
  extension: 'csv' | 'txt';
  /** Columnas y su orden. */
  columnas: ColumnaDispersion[];
  /** Encabezados por columna (si `cabecera`). */
  etiquetas: Record<ColumnaDispersion, string>;
  /** Cómo escribir el tipo de cuenta (p. ej. 'ahorros' → 'AH'). */
  tipoCuentaMap: Record<'ahorros' | 'corriente', string>;
  /** true: monto en pesos con 2 decimales ("41192.17"); false: centavos enteros ("4119217"). */
  montoConDecimales: boolean;
  /** Aviso de verificación mostrado al usuario. */
  nota?: string;
}

const ETIQUETAS_ES: Record<ColumnaDispersion, string> = {
  cedula: 'Cedula', nombre: 'Nombre', banco: 'Banco', tipoCuenta: 'TipoCuenta',
  cuenta: 'Cuenta', monto: 'MontoRD', referencia: 'Referencia',
};

const NOTA_CONFIRMAR =
  'Plantilla base: confirma el orden de columnas, los códigos de tipo de cuenta y ' +
  'el formato del monto contra el instructivo de nómina de tu banco antes de usarla.';

export const FORMATOS_BANCO: FormatoBanco[] = [
  {
    key: 'generico',
    nombre: 'Genérico (CSV)',
    delimitador: ',',
    cabecera: true,
    extension: 'csv',
    columnas: ['cedula', 'nombre', 'banco', 'tipoCuenta', 'cuenta', 'monto', 'referencia'],
    etiquetas: ETIQUETAS_ES,
    tipoCuentaMap: { ahorros: 'ahorros', corriente: 'corriente' },
    montoConDecimales: true,
  },
  {
    key: 'banreservas',
    nombre: 'Banreservas',
    delimitador: ',',
    cabecera: false,
    extension: 'csv',
    // Pago a terceros: cuenta destino, monto, tipo de cuenta, identificación y nombre.
    columnas: ['cuenta', 'monto', 'tipoCuenta', 'cedula', 'nombre'],
    etiquetas: ETIQUETAS_ES,
    tipoCuentaMap: { ahorros: 'AH', corriente: 'CT' },
    montoConDecimales: true,
    nota: NOTA_CONFIRMAR,
  },
  {
    key: 'popular',
    nombre: 'Banco Popular',
    delimitador: ',',
    cabecera: true,
    extension: 'csv',
    columnas: ['cuenta', 'tipoCuenta', 'monto', 'cedula', 'nombre', 'referencia'],
    etiquetas: ETIQUETAS_ES,
    tipoCuentaMap: { ahorros: '1', corriente: '2' },
    montoConDecimales: true,
    nota: NOTA_CONFIRMAR,
  },
  {
    key: 'bhd',
    nombre: 'BHD',
    delimitador: ',',
    cabecera: true,
    extension: 'csv',
    columnas: ['cedula', 'nombre', 'cuenta', 'tipoCuenta', 'monto'],
    etiquetas: ETIQUETAS_ES,
    tipoCuentaMap: { ahorros: 'AHO', corriente: 'COR' },
    montoConDecimales: true,
    nota: NOTA_CONFIRMAR,
  },
];

export const FORMATO_POR_DEFECTO = 'generico';

export function getFormatoBanco(key: string | null | undefined): FormatoBanco {
  return FORMATOS_BANCO.find((f) => f.key === key) ?? FORMATOS_BANCO[0];
}
