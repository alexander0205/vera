/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  PERILLAS DE SUSCRIPCIÓN                                        ║
 * ║                                                                  ║
 * ║  Todo lo que se decide sobre pruebas, mora, límites y bajadas   ║
 * ║  de plan vive AQUÍ y en ningún otro sitio. Cambiar una regla    ║
 * ║  del negocio debe ser cambiar una línea de este archivo.        ║
 * ║                                                                  ║
 * ║  Los PRECIOS y los TOPES numéricos no están aquí: viven en      ║
 * ║  lib/config/plans.ts, que es el catálogo. Este archivo dice     ║
 * ║  qué se hace cuando alguien choca contra ellos.                 ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Client-safe: solo constantes y funciones puras. Lo que consulta la base
 * de datos vive en lib/suscripcion/.
 */

import type { ModuleKey } from '@/lib/config/modules';

// ─── Período de prueba ────────────────────────────────────────────────────────

export const PRUEBA = {
  /**
   * Días de prueba POR FAMILIA. Debe coincidir con `trial_period_days` del
   * checkout — Stripe es quien de verdad cuenta, esto es lo que le decimos y
   * lo que mostramos en pantalla. Si los dos se separan gana Stripe, y el
   * cliente se queda fuera antes de lo que le prometimos.
   *
   * No son el mismo número, y la diferencia no es comercial:
   *
   * · **e-CF, 15 días.** Emites una factura el primer día y ya sabes si te
   *   sirve. Más tiempo no enseña nada nuevo.
   *
   * · **Colegio, 30.** Lo que se vende ahí es el CICLO MENSUAL: la mensualidad
   *   que se emite sola, la mora que entra el día que toca, y los tres avisos
   *   colgados de esas fechas. Con 15 días no se ve un ciclo completo —
   *   literalmente no se puede comprobar lo que se compra. Y montar el colegio
   *   es cargar estudiantes, grados, tutores y conceptos: los propios planes
   *   reservan de 8 a 19 horas de implementación.
   *
   * `PRUEBA.dias` se queda como el valor de e-CF para que las pantallas que
   * no saben de qué familia hablan sigan diciendo algo cierto (la portada, por
   * ejemplo, anuncia el plan desde el que se entra).
   */
  dias: 15,
  diasPorFamilia: { ecf: 15, colegio: 30 } as Record<string, number>,

  /**
   * Cuántos días antes de que expire se le avisa. El aviso sale una vez por
   * cada número de la lista, no todos los días: un banner diario durante dos
   * semanas se vuelve invisible antes de que importe.
   */
  avisarDiasAntes: [3, 1],

  /**
   * ¿Se pide tarjeta para empezar la prueba?
   *
   * DECISIÓN PENDIENTE — hoy en `false`. Alegra tampoco la pide, y pedirla es
   * el filtro más caro que existe en la entrada del embudo. Ponerlo en `true`
   * sube la conversión de prueba→pago y baja la de visita→prueba.
   */
  pideTarjeta: false,
} as const;

/**
 * Días de prueba que le tocan a un plan.
 *
 * Recibe la FAMILIA y no la clave del plan a propósito: los cuatro tramos de
 * colegio comparten los 30 días, y hacerlo por plan invitaría a que alguien
 * los pusiera distintos sin querer.
 */
export function diasDePrueba(familia: string | null | undefined): number {
  return PRUEBA.diasPorFamilia[familia ?? ''] ?? PRUEBA.dias;
}

// ─── Qué pasa cuando se acaba y no pagan ──────────────────────────────────────

/**
 * Ni la prueba vencida ni la mora cortan en seco. En los dos casos la empresa
 * entra en SOLO LECTURA por unos días: puede entrar, ver sus facturas, sacar
 * sus reportes y bajarse su información, pero no crear nada nuevo.
 *
 * El corte seco es el error caro aquí. Un colegio que no puede entrar a ver a
 * quién le debe qué llama por teléfono furioso; uno que entra y ve todo pero
 * no puede emitir, paga.
 */
export const SOLO_LECTURA = {
  /** Días de solo-lectura tras vencer la prueba sin pagar. 0 = corte inmediato. */
  diasTrasPrueba: 7,
  /** Días de solo-lectura tras agotarse la gracia de mora. */
  diasTrasMora: 7,
} as const;

export const MORA = {
  /**
   * Días de acceso completo tras el primer cobro fallido. Stripe reintenta la
   * tarjeta varias veces durante la primera semana; cortar antes de que
   * termine de reintentar castiga a quien solo se le venció la tarjeta.
   */
  diasGracia: 8,
} as const;

// ─── Límites: qué bloquea y qué solo avisa ────────────────────────────────────

/**
 * Las cinco dimensiones que el modelo comercial limita.
 * `sms` y `whatsapp` están separados porque se cobran por unidad distinta.
 */
export type ClaveLimite = 'docs' | 'usuarios' | 'estudiantes' | 'whatsapp' | 'sms';

/**
 * `bloquea` — no deja pasar la acción.
 * `avisa`   — deja pasar y levanta bandera (banner al cliente, aviso a nosotros).
 * `ignora`  — el límite existe en el catálogo pero no se aplica.
 */
export type EfectoLimite = 'bloquea' | 'avisa' | 'ignora';

export interface ReglaLimite {
  efecto: EfectoLimite;
  /** A partir de qué % del tope se empieza a avisar. 0.8 = al 80%. */
  avisarDesde: number;
  /** Qué se le dice al usuario cuando choca. */
  mensaje: string;
}

export const LIMITES: Record<ClaveLimite, ReglaLimite> = {
  /** Es el corazón del plan de e-CF: si no bloquea, el plan no existe. */
  docs: {
    efecto: 'bloquea',
    avisarDesde: 0.8,
    mensaje: 'Llegaste al tope de comprobantes de tu plan para este mes.',
  },

  /** Bloquea AGREGAR, nunca expulsa a nadie. Ver puedeAgregarUsuario en plans.ts. */
  usuarios: {
    efecto: 'bloquea',
    avisarDesde: 1,
    mensaje: 'Tu plan no incluye más usuarios.',
  },

  /**
   * Avisa, NO bloquea — a propósito.
   *
   * El tope de estudiantes es cómo se elige el tramo, no un cupo que se
   * consume. Bloquear la matrícula 301 de un colegio en pleno agosto lo deja
   * sin poder inscribir a un niño que ya pagó, por una diferencia de precio
   * que se resuelve con una llamada. Se avisa, se cobra el tramo que toca, y
   * el colegio sigue trabajando.
   */
  estudiantes: {
    efecto: 'avisa',
    avisarDesde: 0.9,
    mensaje: 'Pasaste el tope de estudiantes de tu tramo. Te contactamos para ajustarlo.',
  },

  /**
   * Bloquea: cada mensaje que sale nos cuesta dinero de verdad. Es el único
   * límite donde no aplicar el tope se traduce en una factura nuestra.
   */
  whatsapp: {
    efecto: 'bloquea',
    avisarDesde: 0.8,
    mensaje: 'Se agotaron los avisos de WhatsApp de tu plan para este mes.',
  },

  /** Igual que WhatsApp, y el SMS sale más caro por unidad. */
  sms: {
    efecto: 'bloquea',
    avisarDesde: 0.8,
    mensaje: 'Se agotaron los avisos por SMS de tu plan para este mes.',
  },
};

/**
 * Canales que NUNCA se cortan por límite.
 *
 * El correo no se le tarifa a nadie: sale por Resend a costo despreciable y
 * es el único canal que le queda a una familia sin celular. Cortarlo por
 * cuota sería ahorrar centavos a cambio de que un padre no se entere de que
 * debe.
 */
export const CANALES_SIN_TOPE: readonly string[] = ['correo'];

// ─── Módulos ──────────────────────────────────────────────────────────────────

export const MODULOS = {
  /**
   * ¿El override manual del panel admin le gana al plan?
   *
   * DECISIÓN PENDIENTE — hoy en `true`. Es lo que nos deja regalar un módulo,
   * montar una demo o sostener a un cliente mientras se arregla un pago, sin
   * tocar Stripe. En `false`, el plan manda siempre y el panel admin queda
   * solo para mirar.
   */
  overrideManualGanaAlPlan: true,

  /**
   * Módulos que nunca se apagan pase lo que pase con la suscripción.
   *
   * Facturación y administración son la casa: aunque no pague, el dueño tiene
   * que poder entrar a ver su empresa y sus comprobantes ya emitidos. El
   * modo solo-lectura es lo que le impide crear cosas nuevas, no el gate de
   * módulos.
   */
  siempreEncendidos: ['facturacion', 'administracion'] as readonly ModuleKey[],
} as const;

// ─── Tramos escolares ─────────────────────────────────────────────────────────

export const TRAMO_ESCOLAR = {
  /**
   * ¿El tramo sube solo cuando el colegio pasa de estudiantes?
   *
   * DECISIÓN PENDIENTE — hoy en `false`. Subirle a un colegio de US$237 a
   * US$350 sin que nadie se lo diga es la forma más rápida de perderlo, aunque
   * el cobro sea correcto. Se avisa, se llama, y se sube con su visto bueno.
   */
  subeSolo: false,

  /** A partir de qué % del tope avisamos que se le viene el cambio de tramo. */
  avisarDesde: 0.9,
} as const;

// ─── Cambios de plan ──────────────────────────────────────────────────────────

/**
 * Un motivo por el que una bajada de plan no puede proceder tal cual.
 * `bloquea` obliga a resolverlo antes; `avisa` solo se le muestra.
 */
export type GravedadCambio = 'bloquea' | 'avisa';

/**
 * Una consecuencia concreta de un cambio de plan.
 *
 * Vive aquí y no junto a la lógica que lo calcula porque la PANTALLA también
 * necesita el tipo, y esa lógica es `server-only`. Una copia del tipo en el
 * cliente es una copia que un día deja de coincidir.
 */
export interface MotivoCambio {
  gravedad: GravedadCambio;
  /** Clave estable para la UI. No se traduce ni se muestra. */
  clave: string;
  /** Lo que lee el cliente. Concreto y con números: «442 estudiantes, tope 300». */
  mensaje: string;
  /** Qué tiene que hacer para desbloquearlo. null cuando solo es un aviso. */
  comoResolver: string | null;
}

/**
 * Los cuatro niveles con los que la pantalla de planes pinta cada tarjeta.
 *
 * `actual` es el contratado; los otros tres salen del veredicto.
 */
export type NivelDeCambio = 'actual' | 'bloquea' | 'avisa' | 'ok';

/**
 * El riesgo de cambiarse a un plan, listo para pintar ANTES del clic.
 *
 * Vive aquí por el mismo motivo que `MotivoCambio`: lo calcula
 * `lib/suscripcion/cambio-plan.ts`, que es server-only, y lo pinta un
 * componente cliente. Declararlo dos veces es garantizar que un día dejen de
 * coincidir.
 */
export interface RiesgoDeCambio {
  nivel: NivelDeCambio;
  /** Una línea, la más grave. Es lo que cabe en la tarjeta. */
  resumen: string;
  /** Todo el detalle, para el diálogo de confirmación. */
  bloqueos: MotivoCambio[];
  avisos: MotivoCambio[];
  modulosQueSePierden: ModuleKey[];
}

export const CAMBIO_PLAN = {
  /**
   * Subir de plan surte efecto YA, con el prorrateo cobrado en el momento:
   * quien paga más quiere lo que compró ahora mismo.
   */
  subidaInmediata: true,

  /**
   * Bajar surte efecto al terminar el período ya pagado. Está implementado con
   * Stripe Subscription Schedules en app/api/stripe/change-plan/route.ts —
   * Stripe NO lo hace solo, hay que programarlo.
   */
  bajadaAlFinDelPeriodo: true,

  /**
   * ¿Bajar de plan pide confirmación explícita cuando algo se va a romper?
   *
   * DECISIÓN PENDIENTE — hoy en `true`. Sin esto, quien baja de tramo se
   * entera de que perdió el módulo escolar el lunes por la mañana.
   */
  confirmacionCuandoBloquea: true,

  /**
   * ¿Se puede saltar de la familia e-CF a la de colegio (o al revés) por
   * autoservicio? Hoy no: un colegio que se pasa a "Negocio" pierde el módulo
   * escolar con todos sus estudiantes dentro. Ese cambio se hace hablando.
   */
  permiteCambiarDeFamilia: false,
} as const;

// ─── Cancelación ──────────────────────────────────────────────────────────────

/**
 * Qué se apaga cuando una empresa cancela.
 *
 * Esconderle el menú no es cancelar. Estos tres procesos corren SOLOS por
 * cron y siguen gastando dinero nuestro y mandando mensajes a nombre de un
 * cliente que ya se fue — que es peor que el gasto.
 */
export const AL_CANCELAR = {
  /** Deja de emitir la mensualidad automática de los colegios. */
  pausarRecurrentes: true,
  /** Deja de mandar recordatorios de cobro por WhatsApp, SMS y correo. */
  cortarAvisos: true,
  /** Los enlaces que las familias usan para subir documentos dejan de abrir. */
  cerrarPortalPadres: true,
  /**
   * Los datos NO se borran nunca por una cancelación. Se conservan por si
   * vuelve, y porque son comprobantes fiscales con retención legal.
   */
  borrarDatos: false,
} as const;

// ─── Derivados ────────────────────────────────────────────────────────────────

/** ¿Este canal de avisos se corta al agotarse la cuota? */
export function canalTieneTope(canal: string): boolean {
  return !CANALES_SIN_TOPE.includes(canal);
}

/** Clave de límite que le corresponde a un canal de avisos. */
export function limiteDelCanal(canal: string): ClaveLimite | null {
  if (canal === 'whatsapp') return 'whatsapp';
  if (canal === 'sms') return 'sms';
  return null;
}

/**
 * Cómo quedó una empresa contra un límite.
 * `usado`/`tope` van crudos para poder mostrar "180 de 200" sin recalcular.
 */
export interface EstadoLimite {
  clave: ClaveLimite;
  usado: number;
  /** -1 = sin tope. */
  tope: number;
  /** ¿Se debe impedir la acción? Solo cuando el efecto es 'bloquea'. */
  bloqueado: boolean;
  /** ¿Se debe mostrar la advertencia? */
  advertir: boolean;
  mensaje: string | null;
}

/**
 * Evalúa un límite. Es la función que decide, y la usan por igual la API que
 * corta y la UI que pinta la barra — así nunca se contradicen.
 *
 * @param aConsumir Cuántas unidades pide la acción. 1 al emitir una factura,
 *                  N al mandar una tanda de avisos.
 */
export function evaluarLimite(
  clave: ClaveLimite,
  usado: number,
  tope: number,
  aConsumir = 1,
): EstadoLimite {
  const regla = LIMITES[clave];

  // -1 es ilimitado y 'ignora' apaga la regla entera: en los dos casos pasa
  // sin mirar nada más.
  if (tope < 0 || regla.efecto === 'ignora') {
    return { clave, usado, tope, bloqueado: false, advertir: false, mensaje: null };
  }

  const excede  = usado + aConsumir > tope;
  const advertir = tope > 0 && usado / tope >= regla.avisarDesde;

  return {
    clave,
    usado,
    tope,
    bloqueado: excede && regla.efecto === 'bloquea',
    advertir:  advertir || excede,
    mensaje:   excede || advertir ? regla.mensaje : null,
  };
}
