/**
 * Buscador de la Academia. Sin IA y sin base: recibe los videos publicados y
 * una pregunta, y devuelve los videos en orden de qué tan bien responden, cada
 * uno con el momento (segundo) del video donde más se habla de lo preguntado.
 *
 * Busca en título, descripción, capítulos y transcripción. Entiende palabras
 * parecidas (cobro, pago, abono, cobrar) y no distingue tildes ni mayúsculas.
 */

export interface VideoBuscable {
  id: number;
  slug: string;
  titulo: string;
  descripcion: string;
  capitulos: readonly { t: number; titulo: string }[];
  transcripcion: readonly { t: number; texto: string }[];
}

export interface Momento { t: number; texto: string }

export interface Resultado<V extends VideoBuscable = VideoBuscable> {
  video: V;
  puntaje: number;
  /** El tramo del video que mejor responde; `null` si solo coincidió el título o la descripción. */
  momento: Momento | null;
}

export function normalizar(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

const RELLENO = new Set([
  'como', 'que', 'cual', 'cuales', 'donde', 'cuando', 'por', 'para', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'al', 'en', 'con', 'sin', 'y', 'o', 'a', 'mi', 'mis', 'su', 'sus', 'se', 'me', 'es', 'lo', 'le', 'les',
  'puedo', 'puede', 'hago', 'hacer', 'quiero', 'necesito', 'debo', 'si', 'no', 'ya', 'hay', 'esto', 'eso', 'esta', 'este',
  'zero', 'sistema',
]);

/** Palabras que significan lo mismo para quien busca: todas se leen como la primera. */
const GRUPOS: readonly (readonly string[])[] = [
  ['cobro', 'cobrar', 'cobranza', 'cobrando', 'cobran', 'cobre', 'cobrado', 'cobrada', 'cobre', 'cobraste', 'cobramos', 'pago', 'pagos', 'pagar', 'pagado', 'pagada', 'pague', 'pagaste', 'pagamos', 'pagan', 'pagando', 'abono', 'abonos', 'abonar', 'abona', 'abone', 'abonado', 'abonamos'],
  ['factura', 'facturas', 'facturar', 'facturacion', 'facturando', 'comprobante', 'comprobantes', 'ecf', 'ncf'],
  ['emitir', 'emision', 'emito', 'emite', 'emiti', 'emitimos', 'emitido', 'emitiendo', 'crear', 'creo', 'creado', 'hacer', 'generar', 'genero', 'nueva', 'nuevo'],
  ['cliente', 'clientes', 'contacto', 'contactos', 'comprador'],
  ['anular', 'anulo', 'anulado', 'anule', 'anulacion', 'cancelar', 'cancelo', 'cancelado', 'cancelacion', 'eliminar', 'elimino', 'borrar', 'borro'],
  ['producto', 'productos', 'articulo', 'articulos', 'servicio', 'servicios', 'inventario'],
  ['alumno', 'alumnos', 'estudiante', 'estudiantes', 'matricula', 'matricular', 'inscribir'],
  ['empleado', 'empleados', 'nomina', 'sueldo', 'salario'],
];

const CANONICA = new Map<string, string>();
for (const g of GRUPOS) for (const w of g) CANONICA.set(w, g[0]);

function raiz(w: string): string {
  const c = CANONICA.get(w);
  if (c) return c;
  // Plural simple: «cuentas» → «cuenta», «reportes» → «reporte».
  return w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w;
}

/** Las palabras que importan de una pregunta, ya en su forma de comparar. */
export function palabrasClave(pregunta: string): string[] {
  const salida: string[] = [];
  for (const w of normalizar(pregunta).split(' ')) {
    if (w.length < 2 || RELLENO.has(w)) continue;
    const r = raiz(w);
    if (!salida.includes(r)) salida.push(r);
  }
  return salida;
}

/** El tramo de una palabra que se compara: sirve para conjugaciones («emito»/«emitir»). */
function prefijo(w: string): string {
  return w.length >= 5 ? w.slice(0, Math.max(4, w.length - 2)) : w;
}

/** ¿Dos raíces se parecen? Iguales, o una empieza con el prefijo de la otra («anulo» ~ «anular»). */
export function parecidas(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 && b.length < 5) return false;
  return a.startsWith(prefijo(b)) || b.startsWith(prefijo(a));
}

/** Las raíces de un texto (para compararlo contra las palabras clave). */
function raices(texto: string): string[] {
  const s = new Set<string>();
  for (const w of normalizar(texto).split(' ')) if (w) s.add(raiz(w));
  return [...s];
}

/** ¿Lo escrito es una pregunta en lenguaje natural y no una palabra suelta? */
export function esPregunta(q: string): boolean {
  const t = q.trim();
  if (!t) return false;
  if (/[?¿]/.test(t)) return true;
  const n = normalizar(t);
  if (/^(como|que|cual|cuales|donde|cuando|por que|puedo|se puede|para que|quien)\b/.test(n)) return true;
  return n.split(' ').length >= 4;
}

const PESO = { titulo: 6, frase: 8, capitulo: 3, descripcion: 2, transcripcion: 1 };

function cuantas(claves: readonly string[], texto: string): number {
  const r = raices(texto);
  let n = 0;
  for (const k of claves) if (r.some((w) => parecidas(w, k))) n++;
  return n;
}

export function buscarVideos<V extends VideoBuscable>(videos: readonly V[], pregunta: string): Resultado<V>[] {
  const claves = palabrasClave(pregunta);
  if (claves.length === 0) return [];
  const frase = normalizar(pregunta);
  const resultados: Resultado<V>[] = [];

  for (const video of videos) {
    let puntaje = 0;
    puntaje += cuantas(claves, video.titulo) * PESO.titulo;
    if (frase.length >= 4 && normalizar(video.titulo).includes(frase)) puntaje += PESO.frase;
    puntaje += cuantas(claves, video.descripcion) * PESO.descripcion;

    let mejor: Momento | null = null;
    let mejorN = 0;
    const candidatos: (Momento & { cap: boolean })[] = [
      ...video.capitulos.map((c) => ({ t: c.t, texto: c.titulo, cap: true })),
      ...video.transcripcion.map((s) => ({ t: s.t, texto: s.texto, cap: false })),
    ];
    let acumTranscripcion = 0;
    for (const c of candidatos) {
      const n = cuantas(claves, c.texto);
      if (n === 0) continue;
      if (c.cap) puntaje += n * PESO.capitulo;
      else acumTranscripcion += n * PESO.transcripcion;
      // El mejor momento: el que menciona más palabras; a igualdad, el primero.
      if (n > mejorN || (n === mejorN && mejor && c.t < mejor.t)) {
        mejor = { t: c.t, texto: c.texto };
        mejorN = n;
      }
    }
    puntaje += Math.min(acumTranscripcion, 10);
    // Un momento donde cae toda la pregunta vale más que varios sueltos.
    if (mejorN >= claves.length && claves.length > 1) puntaje += 4;

    if (puntaje > 0) resultados.push({ video, puntaje, momento: mejor });
  }
  return resultados.sort((a, b) => b.puntaje - a.puntaje || a.video.titulo.localeCompare(b.video.titulo, 'es'));
}

/**
 * ¿Hay que llamar al asistente? Sí cuando no salió nada, o cuando la persona
 * hizo una pregunta y lo mejor que salió es flojo (una sola palabra suelta).
 */
export function debeResponderAsistente(q: string, resultados: readonly Resultado[]): boolean {
  if (!q.trim()) return false;
  if (resultados.length === 0) return true;
  return esPregunta(q) && resultados[0].puntaje < PESO.titulo;
}

/**
 * Qué se le ofrece a la persona sobre el asistente. NUNCA se llama solo: el
 * buscador contesta primero y el asistente (que cuesta dinero) es un botón.
 *  - 'ninguna': no hay nada escrito o no hay ni un video que citar (el asistente
 *    no tendría con qué contestar, así que no se ofrece).
 *  - 'sugerida': preguntó en lenguaje natural y lo que salió es flojo.
 *  - 'disponible': hay buenos resultados; el botón está, sin insistir.
 */
export function ofertaAsistente(q: string, resultados: readonly Resultado[]): 'ninguna' | 'sugerida' | 'disponible' {
  if (!q.trim() || resultados.length === 0) return 'ninguna';
  return debeResponderAsistente(q, resultados) ? 'sugerida' : 'disponible';
}
