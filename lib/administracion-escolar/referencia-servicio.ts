/**
 * Referencia del servicio de facturación con el que se cobra una tarifa.
 *
 * Se arma con los nombres completos que ya están en la estructura, unidos con
 * guiones:
 *
 *     Colegiatura-Sexto-Primario-Matutina-2026-2027
 *
 * El grado solo aparece cuando la tarifa es suya: una tarifa puesta en el
 * servicio la comparten todos sus grados, así que su referencia no puede
 * nombrar a ninguno.
 *
 * Se prefieren los nombres largos sobre las siglas porque las siglas se
 * vuelven ambiguas enseguida — en un colegio real "P" ya significaba a la vez
 * "pago" y "párvulo" — y porque así la referencia se puede buscar escribiendo
 * lo que uno tiene en la cabeza ("sexto") y no un código que hay que recordar.
 *
 * La tanda va siempre, aunque el colegio tenga un solo turno: es la única
 * forma de que dos servicios homónimos (Primario matutino y vespertino) no
 * terminen pidiendo la misma referencia.
 */

/** Tope por trozo: sin esto un nombre de Sigerd se come la referencia entera. */
const MAX_TROZO = 24;

/**
 * Deja un trozo utilizable dentro de la referencia.
 *
 * Los guiones internos se respetan \u2014"2026-2027" tiene que seguir siendo
 * "2026-2027"\u2014 aunque el guion sea tambi\u00e9n el separador: la referencia es un
 * identificador para buscar y comparar, nunca se parte de vuelta en piezas.
 *
 * Lo que va entre par\u00e9ntesis se descarta: Sigerd lo usa para aclaraciones
 * ("Primer grado (7mo Nivel B\u00e1sico)") que alargan sin distinguir.
 */
function trozo(texto: string): string {
  const limpio = texto
    .replace(/\([^)]*\)/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // sin tildes: la referencia viaja por XML, URLs y Excel
    .replace(/[^a-zA-Z0-9-]+/g, ' ')
    .replace(/-+/g, '-')
    .trim();

  const camel = limpio
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');

  return camel.length > MAX_TROZO ? camel.slice(0, MAX_TROZO).replace(/-+$/, '') : camel;
}

export interface PartesReferencia {
  concepto: string;
  /** Nombre del grado. Se omite en las tarifas puestas sobre el servicio. */
  grado?: string | null;
  /** Nombre de la sección, solo cuando el aula cobra distinto que su grado. */
  seccion?: string | null;
  servicio: string;
  tanda?: string | null;
  periodo: string;
}

export function referenciaServicio(p: PartesReferencia): string {
  const seccion = p.seccion?.trim() ? `Seccion ${p.seccion}` : null;
  return [p.concepto, p.grado, seccion, p.servicio, p.tanda, p.periodo]
    .filter((x): x is string => !!x && !!x.trim())
    .map(trozo)
    .filter(Boolean)
    .join('-');
}

/**
 * Nombre del ítem tal como lo lee el padre en la factura. Aquí sí van los
 * acentos y los espacios: esto es texto, no identificador.
 */
export function descripcionItem(p: { concepto: string; grado?: string | null; servicio: string; periodo: string }): string {
  const lugar = [p.grado, p.servicio].filter(Boolean).join(' de ');
  return [lugar, p.periodo].filter(Boolean).join(' · ');
}
