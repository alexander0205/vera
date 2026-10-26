/**
 * Cómo se le habla a la persona cuando algo tarda o falla. Pura y sin imports de
 * servidor: la usa el panel y se prueba aparte.
 */

export type TipoError = 'red' | 'ritmo' | 'cuota' | 'largo' | 'general';

export interface DescripcionError {
  tipo: TipoError;
  titulo: string;
  detalle: string;
  /** ¿Tiene sentido ofrecer «Reintentar» ya? (con límite de ritmo o cuota, no). */
  puedeReintentar: boolean;
  /** ¿Ofrecer «Hablar con una persona»? */
  ofrecerPersona: boolean;
}

/** El texto del error que dejó el servidor o el navegador → qué le decimos a la persona. */
export function describirError(texto: string): DescripcionError {
  const t = texto.toLowerCase();
  if (/no hay conexi|sin conexi|failed to fetch|network/.test(t)) {
    return { tipo: 'red', titulo: 'Sin conexión', detalle: 'Revisa tu internet y vuelve a intentarlo. No se perdió nada.', puedeReintentar: true, ofrecerPersona: false };
  }
  if (/vas muy r[aá]pido|muchas consultas|demasiad/.test(t)) {
    return { tipo: 'ritmo', titulo: 'Vas muy rápido', detalle: 'Espera un par de minutos y vuelve a preguntar. Es un límite para cuidar el servicio.', puedeReintentar: false, ofrecerPersona: false };
  }
  if (/l[ií]mite de uso|cuota|alcanz[oó] su l[ií]mite/.test(t)) {
    return { tipo: 'cuota', titulo: 'El asistente llegó a su límite por ahora', detalle: 'Intenta más tarde. Mientras tanto, las preguntas de uso frecuente (ventas, cobros, gastos) se siguen contestando.', puedeReintentar: false, ofrecerPersona: true };
  }
  if (/muy largo|m[aá]ximo es/.test(t)) {
    return { tipo: 'largo', titulo: 'Tu mensaje es muy largo', detalle: texto, puedeReintentar: false, ofrecerPersona: false };
  }
  return { tipo: 'general', titulo: 'No pude responder', detalle: 'Fue un problema de mi lado, no de tu pregunta. Intenta de nuevo; si sigue, escríbele a una persona del equipo.', puedeReintentar: true, ofrecerPersona: true };
}

/** Qué decir mientras se espera, según los segundos transcurridos. */
export function mensajeDeEspera(segundos: number): string {
  if (segundos < 6) return 'Consultando tus datos…';
  if (segundos < 15) return 'Esto está tardando un poco más de lo normal…';
  if (segundos < 30) return 'Sigo en ello: las consultas grandes pueden tomar un momento.';
  return 'Está tardando demasiado. Puedes esperar, o intentar con una pregunta más corta.';
}
