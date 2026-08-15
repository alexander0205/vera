/**
 * Tipos del buscador global — compartidos cliente/servidor.
 *
 * Van en su propio archivo porque lib/busqueda/global.ts es `server-only` (toca
 * la base y los permisos) y el componente de la cabecera es `'use client'`:
 * importar los tipos desde allí arrastraría el módulo entero al bundle.
 */

/** Tipos de resultado. El orden de esta lista es el orden por defecto de los grupos. */
export const TIPOS_RESULTADO = [
  'cliente',
  'factura',
  'cotizacion',
  'producto',
  'venta',
  'estudiante',
  'responsable',
  'usuario',
] as const;

export type TipoResultado = (typeof TIPOS_RESULTADO)[number];

export interface ResultadoBusqueda {
  tipo: TipoResultado;
  /** Único dentro de su tipo. Se usa como key en la lista. */
  id: number;
  label: string;
  sublabel: string;
  href: string;
}

export interface GrupoResultados {
  tipo: TipoResultado;
  titulo: string;
  items: ResultadoBusqueda[];
}

/** Cómo se llama cada grupo en la lista. */
export const TITULO_GRUPO: Record<TipoResultado, string> = {
  cliente:     'Clientes',
  factura:     'Facturas',
  cotizacion:  'Cotizaciones',
  producto:    'Productos',
  venta:       'Ventas del POS',
  estudiante:  'Estudiantes',
  responsable: 'Responsables de pago',
  usuario:     'Usuarios del equipo',
};

/**
 * Longitud mínima del texto antes de disparar nada. Con una letra la consulta
 * barre media base, y detrás de cada llamada hay una consulta por fuente.
 */
export const MIN_CARACTERES = 2;
