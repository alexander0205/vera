import type { ModuleKey } from '@/lib/config/modules';
import type { Permission } from '@/lib/config/roles';
import { MAPA_SISTEMA, type EntradaMapa } from './mapa-sistema';

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
}

const PARADAS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en', 'y', 'o', 'u', 'que', 'se',
  'por', 'para', 'con', 'sin', 'como', 'donde', 'cual', 'cuales', 'es', 'esta', 'este', 'mi', 'mis', 'me', 'lo',
  'hago', 'hacer', 'puedo', 'quiero', 'necesito', 'encuentro', 'encontrar', 'esta', 'estan', 'ver', 'sistema',
  'zero', 'crear', 'nuevo', 'nueva', 'agregar', 'anadir', 'registrar', 'hay', 'tengo',
  'creo', 'crea', 'registro', 'registre', 'agrego', 'agrega', 'anado', 'hacemos', 'hace', 'dime', 'indicame', 'muestrame',
  'quiero', 'podria', 'puede', 'pueden', 'estan', 'esta', 'son', 'tiene', 'tienen',
]);

export const normalizar = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');

function terminos(consulta: string): string[] {
  const todos = normalizar(consulta).split(/\s+/).filter((t) => t.length > 1);
  const utiles = todos.filter((t) => !PARADAS.has(t));
  // «crear una cotización»: si lo único que queda son verbos, se usan todos.
  return (utiles.length ? utiles : todos).map((t) => t.replace(/(es|s)$/, ''));
}

function puntaje(e: EntradaMapa, ts: string[], frase: string): number {
  const titulo = normalizar(e.titulo);
  const menu = normalizar(e.menu);
  const que = normalizar(e.que);
  const palabras = e.palabras.map(normalizar);
  const pasos = normalizar((e.como ?? []).join(' '));
  // «un nuevo asiento»: si lo que dijo contiene una de las frases del mapa, es esa pantalla.
  const porFrase = palabras.some((p) => p.length >= 5 && p.includes(' ') && frase.includes(p));
  let total = porFrase ? 8 : 0;
  for (const t of ts) {
    let mejor = 0;
    if (titulo.includes(t)) mejor = Math.max(mejor, 6);
    if (palabras.some((p) => p === t || p.split(/\s+/).includes(t))) mejor = Math.max(mejor, 5);
    else if (palabras.some((p) => p.includes(t))) mejor = Math.max(mejor, 4);
    if (menu.includes(t)) mejor = Math.max(mejor, 2);
    if (que.includes(t)) mejor = Math.max(mejor, 1.5);
    if (pasos.includes(t)) mejor = Math.max(mejor, 1);
    total += mejor;
  }
  // Una consulta de varias palabras debe acertar en varias: evita que
  // «libro» arrastre todo lo que dice «libro» una vez.
  const aciertos = ts.filter((t) =>
    titulo.includes(t) || palabras.some((p) => p.includes(t)) || menu.includes(t) || que.includes(t)).length;
  return !porFrase && ts.length > 1 && aciertos < Math.ceil(ts.length / 2) ? 0 : total;
}

const aResultado = (e: EntradaMapa): ResultadoGuia => ({
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
    .map((e) => ({ e, p: puntaje(e, ts, ' ' + normalizar(consulta).replace(/\s+/g, ' ').trim() + ' ') }))
    .filter((x) => x.p >= 3)
    .sort((a, b) => b.p - a.p);

  const resultados: ResultadoGuia[] = [];
  const noDisponibles: { titulo: string; modulo: string; motivo: string }[] = [];
  for (const { e } of puntuadas) {
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
    if (resultados.length < limite) resultados.push(aResultado(e));
  }
  return { resultados, noDisponibles };
}
