'use client';

/**
 * Orden del menú lateral según lo que cada quien usa.
 *
 * Las visitas se cuentan SIEMPRE, pero el orden que se ve no se recalcula al
 * momento: un menú que se reordena mientras trabajas es inusable, porque el
 * ítem que ibas a pulsar se mueve solo bajo el cursor. Por eso el orden queda
 * congelado y únicamente se vuelve a calcular cuando han pasado 24 horas desde
 * el último recálculo. Dentro de una misma carga de página no se mueve nunca.
 *
 * Todo vive en localStorage: es una maña de esta máquina, no un dato del
 * negocio, y no justifica ni tabla ni viaje al servidor.
 *
 *   zero:nav-uso = {
 *     v: 1,
 *     conteos:       { ingresos: 42, contabilidad: 7, ... },  // se suma siempre
 *     orden:         ['dashboard', 'ingresos', ...],          // el congelado
 *     recalculadoEn: 1755200000000                            // ms epoch
 *   }
 *
 * SSR: en el servidor no hay localStorage, así que el snapshot de servidor es
 * `null` = "usa el orden que trae el código". useSyncExternalStore pinta ese
 * mismo orden en la primera pasada del cliente y solo salta al guardado después
 * de hidratar — que es justo lo que evita el error de hidratación.
 */

import { useEffect, useSyncExternalStore } from 'react';

const CLAVE = 'zero:nav-uso';

/** Cada cuánto se permite que el menú cambie de orden. */
const VENTANA_MS = 24 * 60 * 60 * 1000;

interface EstadoUso {
  v: 1;
  conteos: Record<string, number>;
  orden: string[];
  recalculadoEn: number;
}

const VACIO: EstadoUso = { v: 1, conteos: {}, orden: [], recalculadoEn: 0 };

function leer(): EstadoUso {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return VACIO;
    const guardado = JSON.parse(crudo) as Partial<EstadoUso> | null;
    // Se valida campo por campo: lo que hay en storage lo pudo escribir una
    // versión anterior del menú, o quedar a medias tras un cierre bruto.
    if (!guardado || guardado.v !== 1) return VACIO;
    return {
      v: 1,
      conteos: guardado.conteos && typeof guardado.conteos === 'object' ? guardado.conteos : {},
      orden: Array.isArray(guardado.orden) ? guardado.orden.filter(id => typeof id === 'string') : [],
      recalculadoEn: typeof guardado.recalculadoEn === 'number' ? guardado.recalculadoEn : 0,
    };
  } catch {
    // Storage bloqueado (Safari en privado) o JSON corrupto: orden por defecto.
    return VACIO;
  }
}

function escribir(estado: EstadoUso) {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(estado));
  } catch {
    // Sin persistencia el menú sigue funcionando, solo que no aprende.
  }
}

/**
 * Mezcla el orden guardado con la lista que trae el código. Manda lo guardado;
 * lo que no conoce —una sección nueva, o una que apareció al ganar un permiso—
 * se cuela justo detrás del vecino que le tocaría por defecto, no al final:
 * si Caja aparece de golpe, tiene que salir pegada a Inventario como siempre.
 */
function fusionar(guardado: string[], ids: string[]): string[] {
  const salida = [...guardado];
  const conocidos = new Set(salida);
  let corte = 0;
  for (const id of ids) {
    if (conocidos.has(id)) {
      corte = salida.indexOf(id) + 1;
      continue;
    }
    salida.splice(corte, 0, id);
    conocidos.add(id);
    corte += 1;
  }
  return salida;
}

/** Más visitadas primero. El empate lo rompe el orden que ya traía la lista,
 *  así que dos secciones sin uso se quedan como estaban. */
function ordenarPorUso(ids: string[], conteos: Record<string, number>): string[] {
  return [...ids].sort((a, b) => (conteos[b] ?? 0) - (conteos[a] ?? 0));
}

// ─── Store ────────────────────────────────────────────────────────────────────

/** El orden efectivo se calcula UNA vez por carga de página y se cachea: esa
 *  es toda la implementación de "no se mueve mientras trabajas". La clave es la
 *  lista de secciones visibles, que cambia cuando terminan de cargar los
 *  permisos. */
let cache: { clave: string; orden: string[] } | null = null;

/** Recálculo que toca guardar. Se escribe desde un efecto y no aquí, para no
 *  tocar localStorage en mitad de un render. */
let pendienteDeGuardar: EstadoUso | null = null;

// Nadie avisa nunca a los oyentes, y es a propósito: registrar una visita no
// debe repintar el menú. useSyncExternalStore exige un `subscribe`, así que se
// le da uno que solo guarda la referencia.
const oyentes = new Set<() => void>();

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

function ordenEfectivo(ids: string[]): string[] {
  const clave = ids.join('|');
  if (cache && cache.clave === clave) return cache.orden;

  const estado = leer();
  const completo = fusionar(estado.orden, ids);

  // recalculadoEn = 0 (usuario nuevo) también entra aquí: con los contadores
  // vacíos el orden sale idéntico al del código, y de paso arranca la ventana
  // de 24h. Un caso menos que tratar aparte.
  const vencido = Date.now() - estado.recalculadoEn >= VENTANA_MS;
  const base = vencido ? ordenarPorUso(completo, estado.conteos) : completo;
  if (vencido) {
    pendienteDeGuardar = { ...estado, orden: base, recalculadoEn: Date.now() };
  } else if (completo.length !== estado.orden.length) {
    // El orden guardado no conocía todas las secciones: la primera vez se
    // escribe mientras los permisos aún cargan y el menú va a medias. Se
    // completa sin tocar `recalculadoEn` —fusionar no mueve nada de sitio,
    // solo añade—, así el próximo recálculo parte de la lista entera.
    pendienteDeGuardar = { ...estado, orden: completo };
  }

  // El orden guardado recuerda secciones que ahora no se ven (otra empresa,
  // otro rol); se filtran al pintar pero se conservan en disco.
  const visibles = new Set(ids);
  const orden = base.filter(id => visibles.has(id));
  cache = { clave, orden };
  return orden;
}

let ultimaRegistrada = '';

/**
 * Suma una visita a la sección. NO reordena nada ahora: solo alimenta el
 * contador que leerá el próximo recálculo.
 */
export function registrarVisitaNav(id: string) {
  // El menú se monta dos veces a la vez (rail de escritorio + drawer móvil, que
  // va con keepMounted). Sin esto cada navegación contaría doble.
  if (id === ultimaRegistrada) return;
  ultimaRegistrada = id;
  const estado = leer();
  escribir({ ...estado, conteos: { ...estado.conteos, [id]: (estado.conteos[id] ?? 0) + 1 } });
}

/**
 * Devuelve `ids` reordenado por uso. En el servidor y en la primera pasada del
 * cliente devuelve la lista tal cual llega — ver la nota de hidratación arriba.
 */
export function useOrdenNav(ids: string[]): string[] {
  const orden = useSyncExternalStore(
    suscribir,
    () => ordenEfectivo(ids),
    () => null,
  );

  useEffect(() => {
    if (!pendienteDeGuardar) return;
    escribir(pendienteDeGuardar);
    pendienteDeGuardar = null;
  });

  return orden ?? ids;
}
