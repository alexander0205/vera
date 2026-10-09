/**
 * Un sondeo que se deja pausar.
 *
 * Los sondeos del soporte eran `setInterval` fijos: cada pestaña abierta
 * preguntaba cada 3 segundos si soporte la llamaba, y otra vez cada 10 por el
 * chat, pasara lo que pasara —escondida detrás de otras pestañas, con la sesión
 * vencida o en una página de impresión—. Medido el 2026-09-17 en producción,
 * de 08:00 a 24:00: 24,949 de las 33,563 peticiones (74 %) fueron ese sondeo.
 *
 * Aquí el intervalo no es un número sino una pregunta que se hace después de
 * cada consulta: `intervalo()` devuelve cuánto esperar, o `null` para quedarse
 * quieto hasta que alguien llame a `refrescar()` (p. ej. al volver a la
 * pestaña). Así cada consumidor decide su ritmo con el estado que acaba de
 * leer, sin reiniciar temporizadores a mano.
 *
 * Nunca hay dos consultas a la vez: la siguiente se programa cuando termina la
 * anterior (con la DB lenta, un `setInterval` las amontonaba), y un
 * `refrescar()` que llega en mitad de una consulta la repite al terminar en vez
 * de perderse: la respuesta en vuelo puede ser de antes del cambio que motivó
 * el refresco.
 */

export interface Sondeo {
  /** Consulta ya y vuelve a programar. Si hay una en vuelo, repite al terminar. */
  refrescar(): void;
  /**
   * Recalcula la espera sin consultar. `null` pausa; si no, se queda con la
   * que llegue ANTES entre la ya programada y la nueva. Sirve para pausar (la
   * pestaña se escondió) y para adelantar (algo se movió en pleno turno lento),
   * y una ráfaga de llamadas —una por tecla— no empuja el turno hacia delante
   * sin que llegue nunca.
   */
  reprogramar(): void;
  /** Para para siempre: cancela lo programado y aborta lo que esté en vuelo. */
  detener(): void;
}

interface OpcionesSondeo {
  consultar: (senal: AbortSignal) => Promise<unknown>;
  /** Milisegundos hasta la próxima consulta, o `null` para pausar. */
  intervalo: () => number | null;
  /**
   * Corta una consulta colgada para que la siguiente pueda salir. Con Neon
   * despertando, una respuesta de 20 s es lenta pero posible; más ya no.
   */
  timeoutMs?: number;
}

export function crearSondeo({ consultar, intervalo, timeoutMs = 20_000 }: OpcionesSondeo): Sondeo {
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let venceEn = 0;
  let enVuelo: AbortController | null = null;
  let repetir = false;
  let detenido = false;

  function cancelarProgramado() {
    if (temporizador) clearTimeout(temporizador);
    temporizador = null;
  }

  function reprogramar() {
    // Con una consulta en vuelo no se programa nada: al terminar se reprograma
    // sola, ya con lo que haya leído.
    if (detenido || enVuelo) return;
    const ms = intervalo();
    if (ms == null) {
      cancelarProgramado();
      return;
    }
    const nuevo = Date.now() + ms;
    if (temporizador && venceEn <= nuevo) return;
    cancelarProgramado();
    venceEn = nuevo;
    temporizador = setTimeout(ejecutar, ms);
  }

  async function ejecutar() {
    temporizador = null;
    if (detenido) return;
    if (enVuelo) {
      repetir = true;
      return;
    }
    const control = new AbortController();
    enVuelo = control;
    const corte = setTimeout(() => control.abort(), timeoutMs);
    try {
      await consultar(control.signal);
    } catch {
      // Red caída, timeout o abortada: el próximo turno reintenta.
    } finally {
      clearTimeout(corte);
      enVuelo = null;
    }
    if (detenido) return;
    if (repetir) {
      repetir = false;
      void ejecutar();
      return;
    }
    reprogramar();
  }

  return {
    refrescar() {
      cancelarProgramado();
      void ejecutar();
    },
    reprogramar,
    detener() {
      detenido = true;
      cancelarProgramado();
      enVuelo?.abort();
    },
  };
}
