/**
 * Citas de la pantalla de carga de Zero.
 *
 * Salen debajo del logo mientras se cambia de empresa o se entra al sistema.
 * Se elige una al azar en cada carga, así el mismo usuario no ve siempre la
 * misma.
 *
 * ── REGLA AL AGREGAR UNA CITA ────────────────────────────────────────────────
 * Cada cita lleva `fuente` con la obra y el pasaje exacto, y solo entra si se
 * pudo rastrear hasta ahí. Internet está lleno de citas mal atribuidas y varias
 * de las más populares del género "motivación de negocios" son falsas; estas se
 * verificaron una por una contra Wikiquote y se descartaron, entre otras:
 *
 *   - "Escoge un trabajo que ames y no trabajarás un día"  → NO es de Confucio
 *   - "La definición de locura es hacer lo mismo…"          → NO es de Einstein
 *   - "Somos lo que hacemos repetidamente…"                 → NO es de Aristóteles
 *   - "No he fracasado, encontré 10.000 formas que no…"     → NO se le pudo
 *                                                             rastrear a Edison
 *   - "Un centavo ahorrado es un centavo ganado"            → Franklin escribió
 *                                                             "son dos centavos
 *                                                             limpios" (1737)
 *
 * Todos los autores son de dominio público. Si se agrega alguien vivo o
 * reciente, conviene revisar antes que la cita se pueda usar.
 */

export interface CitaCarga {
  /** La cita, en español. */
  texto: string;
  /** Quién la dijo — es lo que se muestra debajo. */
  autor: string;
  /** Obra y pasaje. No se muestra: existe para poder auditar la atribución. */
  fuente: string;
}

export const CITAS_CARGA: readonly CitaCarga[] = [
  {
    texto: 'Un viaje de mil millas comienza con un solo paso.',
    autor: 'Lao-Tsé',
    fuente: 'Tao Te King, cap. 64',
  },
  {
    texto: 'Para obtener conocimiento, añade algo cada día. Para obtener sabiduría, quita algo cada día.',
    autor: 'Lao-Tsé',
    fuente: 'Tao Te King, cap. 48',
  },
  {
    texto: 'No nos atrevemos a muchas cosas porque son difíciles; son difíciles porque no nos atrevemos.',
    autor: 'Séneca',
    fuente: 'Cartas a Lucilio, 104',
  },
  {
    texto: 'Mientras posponemos, la vida pasa de largo.',
    autor: 'Séneca',
    fuente: 'Cartas a Lucilio, 1',
  },
  {
    texto: 'Para quien no sabe a qué puerto se dirige, ningún viento es favorable.',
    autor: 'Séneca',
    fuente: 'Cartas a Lucilio, 71',
  },
  {
    texto: 'Los males de la ociosidad se sacuden con el trabajo.',
    autor: 'Séneca',
    fuente: 'Cartas a Lucilio, 56',
  },
  {
    texto: 'Recuerda que el tiempo es dinero.',
    autor: 'Benjamin Franklin',
    fuente: 'Consejos a un joven comerciante, 1748',
  },
  {
    texto: 'Lo bien hecho vale más que lo bien dicho.',
    autor: 'Benjamin Franklin',
    fuente: "Poor Richard's Almanack, 1737",
  },
  {
    texto: 'La felicidad no viene de los grandes golpes de fortuna, que rara vez ocurren, sino de las pequeñas ventajas de cada día.',
    autor: 'Benjamin Franklin',
    fuente: 'Autobiografía, parte III',
  },
  {
    texto: 'Un centavo ahorrado son dos centavos limpios.',
    autor: 'Benjamin Franklin',
    fuente: "Poor Richard's Almanack, 1737",
  },
  {
    texto: 'Estudiar sin pensar es inútil; pensar sin estudiar, peligroso.',
    autor: 'Confucio',
    fuente: 'Analectas, II, 15',
  },
  {
    texto: 'El hombre superior es modesto en sus palabras, pero se excede en sus actos.',
    autor: 'Confucio',
    fuente: 'Analectas, IV',
  },
  {
    texto: 'Concéntrate cada minuto en hacer lo que tienes delante.',
    autor: 'Marco Aurelio',
    fuente: 'Meditaciones, II, 5',
  },
  {
    texto: 'Haz lo correcto. Lo demás no importa.',
    autor: 'Marco Aurelio',
    fuente: 'Meditaciones, VI, 2',
  },
  {
    texto: 'Que ningún acto se haga al azar, ni de otro modo que conforme a la regla.',
    autor: 'Marco Aurelio',
    fuente: 'Meditaciones, IV, 2',
  },
  {
    texto: 'Sufres con razón: prefieres llegar a ser bueno mañana antes que serlo hoy.',
    autor: 'Marco Aurelio',
    fuente: 'Meditaciones, VIII, 22',
  },
  {
    texto: 'Lo que tenemos que aprender para poder hacerlo, lo aprendemos haciéndolo.',
    autor: 'Aristóteles',
    fuente: 'Ética a Nicómaco, II, 1103a',
  },
  {
    texto: 'Un todo es aquello que tiene principio, medio y fin.',
    autor: 'Aristóteles',
    fuente: 'Poética, 1450b',
  },
  {
    texto: 'El genio es un uno por ciento de inspiración y un noventa y nueve por ciento de transpiración.',
    autor: 'Thomas Edison',
    fuente: "Harper's Monthly, 1932",
  },
  {
    texto: 'Todo le llega a quien se mueve mientras espera.',
    autor: 'Thomas Edison',
    fuente: 'Sixty Years of an Inventor\'s Life, 1908',
  },
];

/**
 * Cita al azar. Llamar SOLO en cliente (useEffect / evento): si se ejecuta
 * durante el render del server, el HTML no coincide con el del cliente y React
 * tira error de hidratación.
 */
export function citaAleatoria(): CitaCarga {
  return CITAS_CARGA[Math.floor(Math.random() * CITAS_CARGA.length)];
}
