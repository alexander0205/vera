/**
 * "¿Dónde se vende?" — una sola pregunta, tres respuestas.
 *
 * Por debajo siguen siendo los dos booleanos que ya existen (`visible_pos` y
 * `visible_facturacion`), pero al usuario NUNCA se le presentan como dos
 * interruptores sueltos. Dos interruptores obligan a razonar en negativo ("qué
 * apago para que no salga acá") y además permiten apagar los dos y dejar un
 * producto que no aparece en ningún lado sin que nadie se entere. Con una sola
 * pregunta de tres opciones ese estado no se puede construir.
 *
 * Client-safe: sin dependencias de servidor, lo usan el diálogo y la API.
 */

export type DondeSeVende = 'ambos' | 'facturacion' | 'pos';

export const OPCIONES_DONDE_SE_VENDE: { valor: DondeSeVende; label: string; ayuda: string }[] = [
  { valor: 'ambos',       label: 'En los dos',             ayuda: 'Disponible al facturar y en la caja.' },
  { valor: 'facturacion', label: 'Solo en Facturación',    ayuda: 'No aparece en la caja. Típico de servicios.' },
  { valor: 'pos',         label: 'Solo en Punto de Venta', ayuda: 'No aparece al facturar. Típico de la cafetería.' },
];

/**
 * Los dos sitios donde se puede vender, para presentarlos como casillas.
 *
 * Es la MISMA información que `OPCIONES_DONDE_SE_VENDE` vista al derecho: en
 * vez de tres respuestas cerradas, los dos canales que se marcan por separado.
 * Con dos casillas se ven las dos opciones sin abrir nada y «los dos» deja de
 * ser una tercera cosa que memorizar — es sencillamente tener las dos puestas.
 *
 * El estado de «ninguna marcada» no existe: lo impide la pantalla, que no deja
 * quitar la última. Por eso el tipo de abajo sigue siendo de dos valores y
 * `DondeSeVende` no necesita un cuarto.
 */
export const CANAL_FACTURACION = 'facturacion' as const;
export const CANAL_POS = 'pos' as const;
export type CanalDeVenta = typeof CANAL_FACTURACION | typeof CANAL_POS;

export const CANALES: { clave: CanalDeVenta; label: string; ayuda: string }[] = [
  { clave: CANAL_FACTURACION, label: 'Facturación',    ayuda: 'Se puede elegir al armar una factura.' },
  { clave: CANAL_POS,         label: 'Punto de venta', ayuda: 'Sale en la grilla de la caja.' },
];

/** Las dos columnas que se guardan, a partir de la respuesta elegida. */
export function aBanderas(donde: DondeSeVende): { visiblePos: boolean; visibleFacturacion: boolean } {
  switch (donde) {
    case 'facturacion': return { visiblePos: false, visibleFacturacion: true  };
    case 'pos':         return { visiblePos: true,  visibleFacturacion: false };
    default:            return { visiblePos: true,  visibleFacturacion: true  };
  }
}

/**
 * La respuesta, a partir de lo guardado. Si ambas vinieran apagadas (estado
 * imposible de crear desde la UI nueva, pero alcanzable por datos viejos o por
 * API), se lee como 'ambos': es preferible que el producto aparezca de más a
 * que desaparezca sin explicación.
 */
export function desdeBanderas(p: { visiblePos?: boolean | null; visibleFacturacion?: boolean | null }): DondeSeVende {
  const pos = p.visiblePos ?? true;
  const fac = p.visibleFacturacion ?? true;
  if (pos && !fac) return 'pos';
  if (!pos && fac) return 'facturacion';
  return 'ambos';
}

/** Default según el tipo: un servicio (mensualidad, matrícula) no va a la caja. */
export function defaultPorTipo(tipo: string | null | undefined): DondeSeVende {
  return tipo === 'bien' ? 'ambos' : 'facturacion';
}

/**
 * Las dos banderas que le tocan a un ítem por su naturaleza, cuando nadie
 * respondió la pregunta.
 *
 * Existe porque la columna `visible_pos` no puede tener un DEFAULT correcto en
 * SQL: el valor bueno depende de `tipo`, y un DEFAULT no mira otras columnas.
 * La 0139 dejó el default en `false` (la dirección segura: falta un botón, no
 * sobra un comprobante) y este helper es el que pone el valor de verdad. Toda
 * ruta que inserte en `products` —alta manual, importadores, servicios de
 * sistema— debe pasar por acá en vez de confiar en el default, o el producto
 * nace escondido sin que nadie lo haya decidido.
 */
export function banderasPorTipo(tipo: string | null | undefined) {
  return aBanderas(defaultPorTipo(tipo));
}
