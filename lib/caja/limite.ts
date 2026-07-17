/**
 * Límite de duración del turno de caja — lógica pura (sin DB, sin React).
 *
 * Tres tramos:
 *   1. Antes del límite      → avisa (contador + toasts en hitos).
 *   2. Límite → +gracia      → vencido: sigue pudiendo operar, pero el contador
 *                              ya cuenta hacia el bloqueo.
 *   3. Pasada la gracia      → bloqueado: no factura ni cobra hasta cerrar caja.
 *
 * La gracia existe para que el bloqueo nunca sorprenda: al llegar, el cajero
 * lleva horas de avisos. Sin gracia, el corte caería a mitad de una venta.
 *
 * Se separa de la UI para poder probarla: los bordes (justo en el umbral, recién
 * vencido, sin límite, sin gracia) son exactamente donde esto se rompe.
 *
 * ── Por qué recibe MINUTOS y no una fecha ──────────────────────────────────
 * `caja_turnos.apertura_at` es `timestamp` SIN zona horaria y se llena con el
 * NOW() de Postgres, o sea en la TZ de la sesión de la DB (GMT). El driver, en
 * cambio, parsea ese valor desnudo como hora LOCAL del proceso. En un servidor
 * en UTC ambos coinciden por casualidad; en una máquina en UTC-4 el cálculo se
 * va 4 horas — medido en dev: Postgres decía 822 min y JS 581.
 *
 * Cuatro horas de error bloquean a un cajero antes de tiempo. Por eso los
 * minutos transcurridos se calculan SIEMPRE en Postgres (que es quien escribió
 * el valor y sabe en qué TZ lo hizo) y esta función recibe el número ya hecho.
 * Así no depende de la TZ del proceso ni de cómo el driver parsee la fecha.
 */

/** Nivel de urgencia del turno. Ordenado de menos a más grave. */
export type NivelTurno = 'ok' | 'aviso' | 'urgente' | 'vencido' | 'bloqueado';

/** Minutos restantes bajo los cuales el nivel pasa de 'aviso' a 'urgente'. */
export const UMBRAL_URGENTE_MIN = 30;

export interface EstadoLimite {
  /** Minutos hasta el límite. Negativo = pasado de tiempo. null = sin límite. */
  minutosRestantes: number | null;
  /** Minutos que lleva abierto el turno. */
  minutosAbierto: number;
  /** Minutos hasta que se bloquee. null = nunca bloquea. Negativo = ya bloqueado. */
  minutosHastaBloqueo: number | null;
  nivel: NivelTurno;
  /** true cuando ya no puede facturar ni cobrar hasta cerrar caja. */
  bloqueado: boolean;
  /** true cuando el contador debe mostrarse. */
  mostrarContador: boolean;
  /** Texto listo para pintar: "45 min", "1h 20m". */
  etiqueta: string;
}

function fmtDuracion(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Calcula el estado del turno respecto a su límite y su gracia.
 *
 * @param minutosAbierto Minutos que lleva abierto el turno, calculados en Postgres
 *                       (ver nota de TZ arriba — nunca los derives de apertura_at en JS).
 * @param limiteHoras  Duración máxima en horas. null/0 = sin límite (nunca avisa ni bloquea).
 * @param avisoMinutos Ventana previa en la que se muestra el contador.
 * @param graciaHoras  Horas de tolerancia tras el límite antes de bloquear.
 *                     null/0 = nunca bloquea (solo avisa).
 */
export function calcularEstadoLimite(
  minutosAbierto: number,
  limiteHoras: number | null | undefined,
  avisoMinutos: number = 60,
  graciaHoras: number | null | undefined = 2,
): EstadoLimite {
  // Sin límite configurado → nunca avisa ni bloquea. No es lo mismo que "límite 0".
  if (limiteHoras == null || limiteHoras <= 0) {
    return {
      minutosRestantes: null,
      minutosAbierto,
      minutosHastaBloqueo: null,
      nivel: 'ok',
      bloqueado: false,
      mostrarContador: false,
      etiqueta: fmtDuracion(Math.max(0, minutosAbierto)),
    };
  }

  const minutosRestantes = limiteHoras * 60 - minutosAbierto;
  // Gracia null/0 = nunca bloquea: el turno se queda en 'vencido' para siempre.
  const bloqueaAlguna = graciaHoras != null && graciaHoras > 0;
  const minutosHastaBloqueo = bloqueaAlguna
    ? (limiteHoras + graciaHoras!) * 60 - minutosAbierto
    : null;

  // Tramo 3 — pasada la gracia.
  if (minutosHastaBloqueo != null && minutosHastaBloqueo <= 0) {
    return {
      minutosRestantes,
      minutosAbierto,
      minutosHastaBloqueo,
      nivel: 'bloqueado',
      bloqueado: true,
      mostrarContador: true,
      etiqueta: fmtDuracion(minutosAbierto),
    };
  }

  // Tramo 2 — pasado el límite, dentro de la gracia.
  if (minutosRestantes <= 0) {
    return {
      minutosRestantes,
      minutosAbierto,
      minutosHastaBloqueo,
      nivel: 'vencido',
      bloqueado: false,
      mostrarContador: true,
      etiqueta: minutosHastaBloqueo != null
        ? fmtDuracion(minutosHastaBloqueo)
        : fmtDuracion(Math.abs(minutosRestantes)),
    };
  }

  // Tramo 1 — antes del límite.
  const nivel: NivelTurno = minutosRestantes <= UMBRAL_URGENTE_MIN ? 'urgente' : 'aviso';
  const dentroVentana = minutosRestantes <= avisoMinutos;

  return {
    minutosRestantes,
    minutosAbierto,
    minutosHastaBloqueo,
    nivel: dentroVentana ? nivel : 'ok',
    bloqueado: false,
    mostrarContador: dentroVentana,
    etiqueta: fmtDuracion(minutosRestantes),
  };
}

/**
 * Hitos (en minutos restantes) en los que se dispara un aviso. Se avisa UNA vez
 * por hito: repetir cada minuto entrena al cajero a ignorar el toast.
 * El 0 representa el vencimiento del límite.
 */
export const HITOS_AVISO_MIN = [60, 30, 15, 10, 5, 0] as const;

/**
 * Hitos ya cruzados según los minutos restantes, filtrados a los que caben en la
 * ventana de aviso configurada (con avisoMinutos=30 no tiene sentido avisar a los 60).
 * El hito 0 (vencimiento) siempre entra: es el que anuncia que empezó la gracia.
 */
export function hitosCruzados(minutosRestantes: number, avisoMinutos: number): number[] {
  return HITOS_AVISO_MIN.filter(h => h <= avisoMinutos || h === 0).filter(h => minutosRestantes <= h);
}

/**
 * Mensaje del aviso para un hito.
 * @param graciaHoras Si hay gracia, el aviso de vencimiento anuncia el bloqueo.
 */
export function mensajeHito(hito: number, graciaHoras?: number | null): string {
  if (hito === 0) {
    return graciaHoras && graciaHoras > 0
      ? `Tu turno pasó del límite. Tienes ${fmtDuracion(graciaHoras * 60)} para cerrar caja o no podrás seguir facturando.`
      : 'Tu turno de caja pasó del límite. Cierra caja lo antes posible.';
  }
  return `Te queda ${fmtDuracion(hito)} para cerrar tu turno de caja.`;
}
