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
