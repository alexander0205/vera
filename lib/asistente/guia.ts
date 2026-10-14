import type { ModuleKey } from '@/lib/config/modules';
import type { Permission } from '@/lib/config/roles';
import { MAPA_SISTEMA, type EntradaMapa } from './mapa-sistema';
import { normalizar } from './util';

export { normalizar };

/**
 * «¿Dónde encuentro…?» y «¿cómo hago…?»: busca en el mapa de navegación de
 * Zero y devuelve la pantalla, su camino en el menú y, si es una acción, los
 * pasos. Pura y sin servidor, así se prueba sin base de datos.
 *
 * Filtra por lo que ESTA persona puede abrir: un módulo que la empresa no tiene
 * contratado o una pantalla que su rol no ve no se recomienda como destino. Eso
 * sí se avisa aparte (`noDisponibles`), porque «eso es del módulo de Nómina,
 * que tu empresa no tiene activo» es una respuesta útil y «no existe» no lo es.
 */

export const NOMBRE_MODULO: Record<ModuleKey, string> = {
  facturacion: 'Facturación',
  administracion: 'Administración',
  pos: 'Punto de Venta',
  escolar: 'Gobernanza de Colegios',
  nomina: 'Nómina',
  contabilidad: 'Contabilidad',
};

export interface Capacidades {
  tieneModulo: (m: ModuleKey) => boolean;
  puede: (p: Permission) => boolean;
}

export interface ResultadoGuia {
  titulo: string;
  modulo: string;
  menu: string;
  ruta: string;
  que: string;
  pasos?: string[];
  /** Qué tan bien coincide con la pregunta: lo usa el contestador local para decidir si responde solo. */
  puntaje: number;
}

const PARADAS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en', 'y', 'o', 'u', 'que', 'se',
  'por', 'para', 'con', 'sin', 'como', 'donde', 'cual', 'cuales', 'es', 'esta', 'este', 'mi', 'mis', 'me', 'lo',
  'hago', 'hacer', 'puedo', 'quiero', 'necesito', 'encuentro', 'encontrar', 'esta', 'estan', 'ver', 'sistema',
  'zero', 'crear', 'nuevo', 'nueva', 'agregar', 'anadir', 'registrar', 'hay', 'tengo',
  'creo', 'crea', 'registro', 'registre', 'agrego', 'agrega', 'anado', 'hacemos', 'hace', 'dime', 'indicame', 'muestrame',
  'quiero', 'podria', 'puede', 'pueden', 'estan', 'esta', 'son', 'tiene', 'tienen',
]);

/**
 * Plural a singular solo si queda una palabra de verdad: «facturas» → «factura»,
 * «clientes» → «client», pero «mes» se queda «mes» (antes quedaba «m» y
 * coincidía con casi todo el mapa).
 */
function singular(t: string): string {
  const sinEs = t.replace(/es$/, '');
  if (sinEs !== t && sinEs.length >= 4) return sinEs;
  const sinS = t.replace(/s$/, '');
  return sinS !== t && sinS.length >= 4 ? sinS : t;
}

export function terminos(consulta: string): string[] {
  const todos = normalizar(consulta).split(' ').filter((t) => t.length > 2);
  const utiles = todos.filter((t) => !PARADAS.has(t)).map(singular).filter((t) => !PARADAS.has(t));
  // «crear una cotización»: si lo único que queda son verbos, se usan todos.
  return [...new Set(utiles.length ? utiles : todos.map(singular))];
}

const PIDE_ACCION = /\b(creo|crear|crea|nuevo|nueva|registro|registrar|agrego|agregar|anado|hago|hacer|emito|emitir|doy de alta)\b/;
const ES_ACCION = /\b(crear|nuev\w*|registrar|agregar|emitir|hacer|alta)\b/;

/** ¿Alguna palabra del texto empieza por el término? «pago» ↔ «pagos», pero «mes» no ↔ «comestibles». */
const enPalabras = (texto: string, t: string) => texto.split(' ').some((w) => w.startsWith(t));

function puntaje(e: EntradaMapa, ts: string[], frase: string): number {
  const titulo = normalizar(e.titulo);
  const menu = normalizar(e.menu);
  const que = normalizar(e.que);
  const palabras = e.palabras.map(normalizar);
  const pasos = normalizar((e.como ?? []).join(' '));
  // «un nuevo asiento»: si lo que dijo contiene una de las frases del mapa, es esa pantalla.
  const porFrase = palabras.some((p) => p.length >= 5 && p.includes(' ') && frase.includes(p));
  let total = porFrase ? 8 : 0;
  // «¿Cómo creo un asiento?» busca la pantalla donde se CREA, no la lista donde
  // se consulta: si la pregunta es de hacer algo, suben las entradas de acción.
  const pideAccion = PIDE_ACCION.test(frase);
  const esAccion = ES_ACCION.test(`${titulo} ${palabras.join(' ')}`);
  if (pideAccion && esAccion) total += 6;
  for (const t of ts) {
    let mejor = 0;
    if (enPalabras(titulo, t)) mejor = Math.max(mejor, 6);
    if (palabras.some((p) => p === t || p.split(' ').includes(t))) mejor = Math.max(mejor, 5);
    else if (palabras.some((p) => enPalabras(p, t))) mejor = Math.max(mejor, 4);
    if (enPalabras(menu, t)) mejor = Math.max(mejor, 2);
    if (enPalabras(que, t)) mejor = Math.max(mejor, 1.5);
    if (enPalabras(pasos, t)) mejor = Math.max(mejor, 1);
    total += mejor;
  }
  // Una consulta de varias palabras debe acertar en varias: evita que
  // «libro» arrastre todo lo que dice «libro» una vez.
  const aciertos = ts.filter((t) =>
    enPalabras(titulo, t) || palabras.some((p) => enPalabras(p, t)) || enPalabras(menu, t) || enPalabras(que, t)).length;
  if (!porFrase && ts.length > 1 && aciertos < Math.ceil(ts.length / 2)) return 0;
  // Si pide hacer algo, una pantalla de solo consulta queda por detrás de la de acción.
  return pideAccion && !esAccion ? total * 0.6 : total;
}

const aResultado = (e: EntradaMapa, puntaje: number): ResultadoGuia => ({
  puntaje,
  titulo: e.titulo,
  modulo: NOMBRE_MODULO[e.modulo],
  menu: e.menu,
  ruta: e.ruta,
  que: e.que,
  ...(e.como?.length ? { pasos: e.como } : {}),
});

export function buscarEnMapa(
  consulta: string,
  cap: Capacidades,
  opts: { limite?: number; mapa?: EntradaMapa[] } = {},
): { resultados: ResultadoGuia[]; noDisponibles: { titulo: string; modulo: string; motivo: string }[] } {
  const ts = terminos(consulta);
  if (!ts.length) return { resultados: [], noDisponibles: [] };
  const mapa = opts.mapa ?? MAPA_SISTEMA;
  const limite = opts.limite ?? 4;

  const puntuadas = mapa
    .map((e) => ({ e, p: puntaje(e, ts, ' ' + normalizar(consulta) + ' ') }))
    .filter((x) => x.p >= 3)
    .sort((a, b) => b.p - a.p);

  const resultados: ResultadoGuia[] = [];
  const noDisponibles: { titulo: string; modulo: string; motivo: string }[] = [];
  for (const { e, p } of puntuadas) {
    if (!cap.tieneModulo(e.modulo)) {
      if (noDisponibles.length < 2) {
        noDisponibles.push({
          titulo: e.titulo, modulo: NOMBRE_MODULO[e.modulo],
          motivo: `El módulo ${NOMBRE_MODULO[e.modulo]} no está activo en esta empresa`,
        });
      }
      continue;
    }
    if (e.permiso && !cap.puede(e.permiso)) {
      if (noDisponibles.length < 2) {
        noDisponibles.push({ titulo: e.titulo, modulo: NOMBRE_MODULO[e.modulo], motivo: 'El rol de este usuario no tiene acceso a esa pantalla' });
      }
      continue;
    }
    if (resultados.length < limite) resultados.push(aResultado(e, p));
  }
  return { resultados, noDisponibles };
}
