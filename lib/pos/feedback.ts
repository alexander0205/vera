/**
 * Respuesta física de la caja: sonido y vibración.
 *
 * En una cafetería de colegio quien atiende mira al cliente, no a la pantalla.
 * La confirmación visual —insignia, destello, aviso— sirve cuando se está
 * mirando; cuando no, el toque se da por perdido y se repite. El oído no
 * necesita mirar, y por eso el clic al agregar vale más que cualquier animación.
 *
 * Cuatro señales porque pasan cuatro cosas distintas que hoy se ven casi igual:
 *   agregar  → clic corto y agudo
 *   quitar   → el mismo clic, una octava abajo: se deshizo, no falló nada
 *   cobrar   → dos notas subiendo, «se cerró»
 *   rechazo  → tono grave y áspero: sin stock, sin permiso, algo no entró
 *
 * ── Por qué sintetizado y no ficheros de audio ────────────────────────────────
 * Un .mp3 son kilobytes que hay que descargar y que llegan tarde con el internet
 * de un colegio; el primer clic de la mañana saldría mudo. Un oscilador suena
 * desde el primer toque y no pesa nada. Medido en el navegador: 5,3 ms de
 * latencia, o sea en el mismo instante del dedo.
 *
 * ── El desbloqueo ─────────────────────────────────────────────────────────────
 * El navegador crea el AudioContext en `suspended` y no deja sonar nada hasta que
 * haya un gesto del usuario (medido: `state: "suspended"` al cargar). En una caja
 * eso es invisible —el primer toque de la venta lo desbloquea— pero hay que
 * hacerlo AHÍ y no al cargar la página, o el primer producto de cada turno sale
 * mudo y parece que el sonido no funciona.
 *
 * ── Nada de esto puede tumbar una venta ───────────────────────────────────────
 * Todo va envuelto en try/catch y se traga los errores. Un navegador sin audio,
 * una política rara o un permiso denegado dejan la caja sin sonido; nunca sin
 * cobrar.
 */

export type Senal = 'agregar' | 'quitar' | 'cobrar' | 'rechazo';

export interface PrefsFeedback {
  sonido:    boolean;
  vibracion: boolean;
  /** 0–1. Multiplica el volumen de cada señal. */
  volumen:   number;
}

/**
 * Pasos del volumen.
 *
 * Discretos y no un deslizador: en una caja se ajusta con el dedo, de pie y
 * deprisa, y acertar un punto exacto de una barra es justo lo que no se puede
 * hacer así. Cuatro pasos audibles y un silencio cubren el rango real —una
 * cafetería con ruido y una oficina callada— sin pedir puntería.
 */
export const PASOS_VOLUMEN = [0, 0.35, 0.6, 0.8, 1] as const;

/** El paso siguiente hacia arriba o hacia abajo desde el volumen actual. */
export function pasoVolumen(actual: number, direccion: 1 | -1): number {
  // Se busca el paso más cercano y se mueve desde ahí: el valor guardado puede
  // no ser exactamente uno de la lista (versión anterior, JSON tocado a mano).
  let i = 0;
  for (let k = 1; k < PASOS_VOLUMEN.length; k++) {
    if (Math.abs(PASOS_VOLUMEN[k] - actual) < Math.abs(PASOS_VOLUMEN[i] - actual)) i = k;
  }
  const j = Math.min(PASOS_VOLUMEN.length - 1, Math.max(0, i + direccion));
  return PASOS_VOLUMEN[j];
}

/** En qué peldaño está el volumen (0 = silencio). Para pintar las barritas. */
export function nivelVolumen(v: number): number {
  let i = 0;
  for (let k = 1; k < PASOS_VOLUMEN.length; k++) {
    if (Math.abs(PASOS_VOLUMEN[k] - v) < Math.abs(PASOS_VOLUMEN[i] - v)) i = k;
  }
  return i;
}

/**
 * Encendido de fábrica.
 *
 * En una cafetería con niños gritando, la confirmación callada se pierde — que
 * es justo el escenario que hizo falta arreglar. Quien no lo quiera lo apaga una
 * vez y se recuerda.
 */
export const PREFS_POR_DEFECTO: PrefsFeedback = { sonido: true, vibracion: true, volumen: 0.6 };

/** Por APARATO, no por empresa: la caja de la cafetería y la de administración
 *  entran con la misma cuenta y no quieren lo mismo. */
export const CLAVE_PREFS = 'pos-feedback';

/** Lee las preferencias guardadas. Cualquier cosa rara → los valores de fábrica. */
export function leerPrefs(almacen?: Pick<Storage, 'getItem'>): PrefsFeedback {
  try {
    const store = almacen ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    const crudo = store?.getItem(CLAVE_PREFS);
    if (!crudo) return { ...PREFS_POR_DEFECTO };
    const d = JSON.parse(crudo) as Partial<PrefsFeedback>;
    return {
      sonido:    typeof d.sonido    === 'boolean' ? d.sonido    : PREFS_POR_DEFECTO.sonido,
      vibracion: typeof d.vibracion === 'boolean' ? d.vibracion : PREFS_POR_DEFECTO.vibracion,
      // Se acota en vez de rechazarse: un valor fuera de rango es un descuido,
      // no una razón para devolver la caja al volumen de fábrica.
      volumen:   typeof d.volumen === 'number' && Number.isFinite(d.volumen)
        ? Math.min(1, Math.max(0, d.volumen))
        : PREFS_POR_DEFECTO.volumen,
    };
  } catch {
    return { ...PREFS_POR_DEFECTO };
  }
}

export function guardarPrefs(p: PrefsFeedback, almacen?: Pick<Storage, 'setItem'>): void {
  try {
    const store = almacen ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    store?.setItem(CLAVE_PREFS, JSON.stringify(p));
  } catch { /* almacenamiento bloqueado: se pierde la preferencia, no la venta */ }
}

/**
 * Receta de cada señal: tramos de (frecuencia, cuándo empieza, cuánto dura).
 *
 * Se define aparte de la reproducción para poder probarla sin un navegador: lo
 * que se puede equivocar aquí es la forma —una señal que dure medio segundo
 * cuando se toca tres veces por segundo se solapa consigo misma y suena a
 * cacharro roto—, y eso sí se comprueba con números.
 */
export interface Tramo {
  hz:      number;
  desdeMs: number;
  duraMs:  number;
  /** Volumen relativo del tramo (0–1). */
  vol:     number;
  onda:    OscillatorType;
}

export const RECETAS: Record<Senal, Tramo[]> = {
  // Corto y agudo. Se oye cientos de veces al día: cuanto menos dure, menos
  // cansa, y a 55 ms no llega a solaparse ni tocando muy rápido.
  agregar: [
    { hz: 1180, desdeMs: 0, duraMs: 55, vol: 0.16, onda: 'triangle' },
  ],
  // Quitar una línea a propósito NO es un error y no puede sonar como uno: el
  // cajero que borra algo aposta oiría la señal de avería y dudaría de si el
  // sistema falló. Es el mismo clic de agregar una octava abajo — se reconoce
  // como «la operación contraria», no como «algo salió mal».
  quitar: [
    { hz: 590, desdeMs: 0, duraMs: 60, vol: 0.14, onda: 'triangle' },
  ],
  // Dos notas subiendo: la forma universal de «esto terminó bien».
  cobrar: [
    { hz: 784,  desdeMs: 0,  duraMs: 110, vol: 0.18, onda: 'sine' },
    { hz: 1175, desdeMs: 90, duraMs: 190, vol: 0.18, onda: 'sine' },
  ],
  // Grave y algo más largo: se distingue del clic sin ser una alarma.
  rechazo: [
    { hz: 196, desdeMs: 0,  duraMs: 130, vol: 0.20, onda: 'sawtooth' },
    { hz: 147, desdeMs: 90, duraMs: 170, vol: 0.20, onda: 'sawtooth' },
  ],
};

/** Cuánto dura una señal de principio a fin, en ms. */
export function duracionMs(senal: Senal): number {
  return RECETAS[senal].reduce((max, t) => Math.max(max, t.desdeMs + t.duraMs), 0);
}

/** Patrón de vibración por señal, en ms. Vacío = no vibra. */
export const VIBRACIONES: Record<Senal, number[]> = {
  // Agregar y quitar: un toque seco, casi imperceptible. Se repiten cientos de
  // veces al día y una vibración larga acabaría cansando la mano.
  agregar: [12],
  quitar:  [10],
  // Cobrar es EL momento del turno: tres pulsos y uno final más largo, para que
  // se note con el aparato en la mano o en el bolsillo del delantal. Es la única
  // señal que hay que sentir sin estar mirando ni escuchando.
  cobrar:  [40, 50, 40, 50, 90],
  // Rechazo: pulsos largos e iguales, el patrón de «algo va mal».
  rechazo: [45, 60, 45],
};

// ─── Reproducción ─────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;

function contexto(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Despierta el audio. Hay que llamarlo DENTRO de un gesto del usuario (el primer
 * toque de la caja); si no, el navegador lo deja dormido y la primera señal de
 * la sesión no suena.
 */
export function despertarAudio(): void {
  try {
    const c = contexto();
    if (c && c.state === 'suspended') void c.resume();
  } catch { /* sin audio se sigue vendiendo */ }
}

/** Solo para las pruebas: olvida el contexto abierto. */
export function olvidarAudio(): void {
  try { void ctx?.close(); } catch { /* da igual */ }
  ctx = null;
}

function sonar(senal: Senal, volumen: number): void {
  if (volumen <= 0) return;
  const c = contexto();
  if (!c) return;
  // Si sigue dormido, se intenta despertar: la señal de este toque se pierde,
  // la del siguiente ya suena. Mejor que reventar.
  if (c.state === 'suspended') { void c.resume(); return; }

  const ahora = c.currentTime;
  for (const t of RECETAS[senal]) {
    const osc = c.createOscillator();
    const gan = c.createGain();
    osc.type = t.onda;
    osc.frequency.setValueAtTime(t.hz, ahora + t.desdeMs / 1000);

    const ini = ahora + t.desdeMs / 1000;
    const fin = ini + t.duraMs / 1000;
    // Rampa de subida muy corta y caída exponencial: cortar en seco produce un
    // chasquido (el famoso «click» de forma de onda) que suena a avería.
    gan.gain.setValueAtTime(0.0001, ini);
    gan.gain.exponentialRampToValueAtTime(Math.max(0.0002, t.vol * volumen), ini + 0.008);
    gan.gain.exponentialRampToValueAtTime(0.0001, fin);

    osc.connect(gan);
    gan.connect(c.destination);
    osc.start(ini);
    osc.stop(fin + 0.02);
  }
}

function vibrar(senal: Senal): void {
  try {
    // Android sí; Safari (iPad y iPhone) NO tiene esta API y nunca la ha tenido.
    // En iOS esto simplemente no hace nada — no hay alternativa fiable.
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    const patron = VIBRACIONES[senal];
    if (patron.length > 0) navigator.vibrate(patron);
  } catch { /* permiso denegado o aparato sin motor */ }
}

/** Emite la señal según lo que el aparato tenga encendido. */
export function emitir(senal: Senal, prefs: PrefsFeedback): void {
  try {
    if (prefs.sonido) sonar(senal, prefs.volumen);
    if (prefs.vibracion) vibrar(senal);
  } catch { /* nada de esto puede tumbar una venta */ }
}

/** ¿Este aparato puede vibrar? Sirve para no ofrecer un interruptor muerto. */
export function puedeVibrar(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}
