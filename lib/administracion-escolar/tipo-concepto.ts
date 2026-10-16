/**
 * Qué ES un cobro del colegio, separado de cada cuánto se cobra.
 *
 * Eran la misma pregunta y no lo son. El interruptor «Se cobra varias veces al
 * año» de la ficha del concepto escribía `frecuencia` Y `tipo` a la vez: al
 * encenderlo, el cobro pasaba a `mensualidad`; al apagarlo, volvía a `otro`.
 * Como no había ningún otro sitio donde tocar el tipo, todo lo que se repite
 * durante el año quedaba marcado como colegiatura.
 *
 * Mi Casita lo enseñó con un caso real: una evaluación que se cobra en tres
 * pagos (diciembre, marzo, junio). Para tener ese calendario había que
 * encender la recurrencia, y la evaluación quedó guardada como colegiatura. Y
 * el tipo no es una etiqueta: con `mensualidad`, la facturación recurrente
 * trata ese cargo como LA mensualidad de ese mes para deduplicar y enlazar
 * facturas, el plan de cobro lo reparte por cuota, la matrícula lo agrupa en
 * «Mensualidades» y le aplica la beca, y el dashboard lo suma como colegiatura.
 * La evaluación de diciembre podía acabar enlazada como la colegiatura de
 * diciembre.
 *
 * Así que ahora son dos preguntas: el interruptor dice si se repite, y este
 * tipo dice qué es. La columna y la ruta ya los aceptaban —`PATCH
 * /conceptos/[id]` valida `tipo` contra esta misma lista—; lo que faltaba era
 * un sitio donde una persona lo eligiera.
 *
 * Pruebas en `tests/unit/tipo-concepto.test.ts`.
 */

export const TIPOS_DE_CONCEPTO = [
  'mensualidad', 'inscripcion', 'uniforme', 'actividad', 'otro',
] as const;

export type TipoDeConcepto = typeof TIPOS_DE_CONCEPTO[number];

export function esTipoDeConcepto(v: unknown): v is TipoDeConcepto {
  return typeof v === 'string' && (TIPOS_DE_CONCEPTO as readonly string[]).includes(v);
}

/**
 * Cómo se llama cada tipo en el colegio. «Colegiatura» y no «mensualidad»: es
 * la palabra que usa la secretaria, y además dice qué es y no cada cuánto —que
 * es justo la confusión que esto viene a deshacer.
 */
export const ETIQUETA_TIPO: Record<TipoDeConcepto, string> = {
  mensualidad: 'Colegiatura',
  inscripcion: 'Inscripción',
  uniforme:    'Uniformes o materiales',
  actividad:   'Actividad',
  otro:        'Otro cobro',
};

/** Una línea bajo el desplegable: para qué sirve elegir bien. */
export const PISTA_TIPO: Record<TipoDeConcepto, string> = {
  mensualidad: 'Lo que la familia paga por el año escolar. La beca lo rebaja y la facturación del mes lo busca por aquí.',
  inscripcion: 'Lo que se paga al entrar al año escolar.',
  uniforme:    'Lo que el colegio vende aparte: uniformes, libros, materiales.',
  actividad:   'Excursiones, evaluaciones, actos: se cobran aparte de la colegiatura, se repitan o no.',
  otro:        'Cualquier otro cobro que no sea ninguno de los de arriba.',
};

/**
 * Si la beca del alumno rebaja este cobro, cuando nadie ha dicho lo contrario.
 *
 * Solo la colegiatura: una beca cubre lo que se paga por el año escolar, no el
 * uniforme ni la excursión. Antes esto lo decidía el interruptor de la
 * recurrencia —encenderlo ponía `admiteBeca` en sí—, y así una evaluación
 * trimestral nacía descontando beca.
 */
export function becaPorDefecto(tipo: TipoDeConcepto): boolean {
  return tipo === 'mensualidad';
}
