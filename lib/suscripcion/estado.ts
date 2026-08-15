/**
 * En qué punto del ciclo de vida está una suscripción.
 *
 * Stripe dice QUÉ pasa (`active`, `past_due`, `canceled`). Esto traduce eso a
 * lo único que el resto del sistema necesita saber: si la empresa puede
 * seguir creando cosas, y qué se le dice si no.
 *
 * Función pura sobre las columnas del team — sin llamadas a Stripe ni a la
 * base. Quien tenga la fila puede preguntar.
 */

import { BILLING_ENABLED } from '@/lib/config/billing';
import { PRUEBA, SOLO_LECTURA, MORA } from '@/lib/config/suscripcion';

/**
 * `sin-billing`     — el billing está apagado. Todo abierto. Es el estado de hoy.
 * `prueba`          — dentro de los días de prueba.
 * `prueba-por-vencer` — prueba con pocos días encima; toca avisar.
 * `activa`          — pagando.
 * `mora`            — falló el cobro pero la gracia sigue viva. Acceso completo.
 * `solo-lectura`    — se acabó la prueba o la gracia. Entra y ve; no crea nada.
 * `cerrada`         — se acabó también el solo-lectura, o canceló hace rato.
 */
export type EstadoSuscripcion =
  | 'sin-billing'
  | 'prueba'
  | 'prueba-por-vencer'
  | 'activa'
  | 'mora'
  | 'solo-lectura'
  | 'cerrada';

/** Lo que hace falta de un team para decidir. Nada más. */
export interface TeamSuscripcion {
  planName: string | null;
  subscriptionStatus: string | null;
  trialEnd: Date | null;
  periodoFin: Date | null;
  morosoDesde: Date | null;
  cancelarAlFin: boolean;
}

export interface Suscripcion {
  estado: EstadoSuscripcion;
  /** ¿Puede crear, emitir, cobrar? Lo que decide cada guard de escritura. */
  puedeEscribir: boolean;
  /** Días que le quedan en el estado actual. null = no aplica / indefinido. */
  diasRestantes: number | null;
  /** ¿Toca mostrar el banner? */
  avisar: boolean;
  /** Qué dice el banner. null cuando no hay nada que decir. */
  mensaje: string | null;
  /** Hay una cancelación programada para el fin del período. */
  cancelacionPendiente: boolean;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Días enteros de `desde` a `hasta`. Negativo = ya pasó. */
function diasHasta(hasta: Date, desde: Date): number {
  return Math.ceil((hasta.getTime() - desde.getTime()) / DIA_MS);
}

function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * DIA_MS);
}

/**
 * @param ahora Inyectable a propósito: sin esto no se puede probar "el día 16
 *              de la prueba" sin mover el reloj de la máquina.
 */
export function evaluarSuscripcion(
  team: TeamSuscripcion,
  ahora: Date = new Date(),
): Suscripcion {
  const abierto: Suscripcion = {
    estado: 'sin-billing',
    puedeEscribir: true,
    diasRestantes: null,
    avisar: false,
    mensaje: null,
    cancelacionPendiente: false,
  };

  // Producto en desarrollo: sin billing no se le corta nada a nadie.
  if (!BILLING_ENABLED) return abierto;

  const status = team.subscriptionStatus;

  // Acceso manual concedido por nosotros. No pasa por Stripe y no caduca.
  if (status === 'admin') return abierto;

  const cancelacionPendiente = Boolean(team.cancelarAlFin);

  // ── Prueba ────────────────────────────────────────────────────────────────
  if (status === 'trialing' && team.trialEnd) {
    const dias = diasHasta(team.trialEnd, ahora);

    if (dias > 0) {
      const avisar = PRUEBA.avisarDiasAntes.some(d => dias <= d);
      return {
        estado: avisar ? 'prueba-por-vencer' : 'prueba',
        puedeEscribir: true,
        diasRestantes: dias,
        avisar,
        mensaje: avisar
          ? `Te ${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`} de prueba. Agrega tu método de pago para no perder el acceso.`
          : null,
        cancelacionPendiente,
      };
    }

    // Se venció la prueba y no pagó: solo lectura por unos días antes de cerrar.
    return trasElVencimiento(
      team.trialEnd,
      SOLO_LECTURA.diasTrasPrueba,
      ahora,
      cancelacionPendiente,
      'Se acabó tu período de prueba. Puedes consultar y descargar tu información; para volver a emitir, activa tu plan.',
      'Se acabó tu período de prueba. Activa un plan para seguir usando Zero.',
    );
  }

  // ── Prueba terminada sin tarjeta ──────────────────────────────────────────
  // `paused` es lo que Stripe deja cuando se acaba una prueba y no hay método
  // de pago (`trial_settings.end_behavior: pause`). NO es «sin plan»: el plan
  // está elegido y la suscripción existe — solo falta la tarjeta.
  //
  // Sin esta rama caía al final del archivo y se le decía «tu empresa no tiene
  // un plan activo, elige uno», a alguien que ya eligió. Además de ser falso,
  // lo mandaba a escoger plan otra vez en vez de a pagar el que tiene.
  if (status === 'paused') {
    return trasElVencimiento(
      team.trialEnd ?? ahora,
      SOLO_LECTURA.diasTrasPrueba,
      ahora,
      cancelacionPendiente,
      'Se acabó tu prueba. Puedes consultar y descargar tu información; agrega tu método de pago para volver a emitir.',
      'Se acabó tu prueba. Agrega tu método de pago para reactivar Zero.',
    );
  }

  // ── Mora ──────────────────────────────────────────────────────────────────
  // Se entra por el estado de Stripe, pero el reloj es `morosoDesde`: Stripe
  // reintenta la tarjeta varias veces y cada reintento vuelve a marcar
  // past_due. Contando desde el primer fallo, la gracia se agota de verdad.
  if (status === 'past_due' || status === 'unpaid') {
    const desde = team.morosoDesde ?? ahora;
    const finGracia = sumarDias(desde, MORA.diasGracia);
    const dias = diasHasta(finGracia, ahora);

    if (dias > 0) {
      return {
        estado: 'mora',
        puedeEscribir: true,
        diasRestantes: dias,
        avisar: true,
        mensaje: `No pudimos cobrar tu suscripción. Actualiza tu tarjeta ${
          dias === 1 ? 'hoy' : `en los próximos ${dias} días`
        } para no perder el acceso.`,
        cancelacionPendiente,
      };
    }

    return trasElVencimiento(
      finGracia,
      SOLO_LECTURA.diasTrasMora,
      ahora,
      cancelacionPendiente,
      'Tu suscripción está vencida. Puedes consultar y descargar tu información; para volver a emitir, actualiza tu método de pago.',
      'Tu suscripción está vencida. Actualiza tu método de pago para reactivar Zero.',
    );
  }

  // ── Cancelada ─────────────────────────────────────────────────────────────
  if (status === 'canceled') {
    // Canceló, pero pagó hasta fin de mes: hasta esa fecha sigue trabajando
    // normal. Cobrarle el mes y cortarlo el mismo día sería quedarse con
    // dinero por un servicio no prestado.
    if (team.periodoFin && team.periodoFin > ahora) {
      const dias = diasHasta(team.periodoFin, ahora);
      return {
        estado: 'activa',
        puedeEscribir: true,
        diasRestantes: dias,
        avisar: true,
        mensaje: `Tu suscripción termina en ${dias === 1 ? '1 día' : `${dias} días`}. Puedes reactivarla cuando quieras.`,
        cancelacionPendiente: true,
      };
    }

    return trasElVencimiento(
      team.periodoFin ?? ahora,
      SOLO_LECTURA.diasTrasMora,
      ahora,
      cancelacionPendiente,
      'Tu suscripción está cancelada. Puedes consultar y descargar tu información durante unos días más.',
      'Tu suscripción está cancelada. Reactiva un plan para volver a usar Zero.',
    );
  }

  // ── Al día ────────────────────────────────────────────────────────────────
  if (status === 'active' || status === 'trialing') {
    return {
      estado: 'activa',
      puedeEscribir: true,
      diasRestantes: team.periodoFin ? diasHasta(team.periodoFin, ahora) : null,
      avisar: cancelacionPendiente,
      mensaje: cancelacionPendiente && team.periodoFin
        ? `Tu plan queda activo hasta el ${team.periodoFin.toLocaleDateString('es-DO')}. Puedes reactivarlo antes de esa fecha.`
        : null,
      cancelacionPendiente,
    };
  }

  // ── Sin plan ──────────────────────────────────────────────────────────────
  // Empresa sin suscripción: entra y ve lo suyo, no emite. Es donde caen las
  // que nunca compraron y las que quedaron con el estado a medias
  // (`incomplete`, `incomplete_expired`, o el NULL de una fila vieja).
  return {
    estado: 'solo-lectura',
    puedeEscribir: false,
    diasRestantes: null,
    avisar: true,
    mensaje: 'Tu empresa no tiene un plan activo. Elige uno para empezar a emitir.',
    cancelacionPendiente,
  };
}

/**
 * La ventana de solo-lectura y lo que viene después. Se repite en los tres
 * finales (prueba vencida, mora agotada, cancelación cumplida) porque los tres
 * aterrizan igual: unos días para sacar la información, y después cerrado.
 */
function trasElVencimiento(
  vencidoEn: Date,
  diasDeGracia: number,
  ahora: Date,
  cancelacionPendiente: boolean,
  mensajeSoloLectura: string,
  mensajeCerrada: string,
): Suscripcion {
  const dias = diasHasta(sumarDias(vencidoEn, diasDeGracia), ahora);

  if (dias > 0) {
    return {
      estado: 'solo-lectura',
      puedeEscribir: false,
      diasRestantes: dias,
      avisar: true,
      mensaje: mensajeSoloLectura,
      cancelacionPendiente,
    };
  }

  return {
    estado: 'cerrada',
    puedeEscribir: false,
    diasRestantes: null,
    avisar: true,
    mensaje: mensajeCerrada,
    cancelacionPendiente,
  };
}

/**
 * ¿Este estado deja crear cosas?
 *
 * Se expone aparte de `evaluarSuscripcion` para que un guard pueda preguntar
 * sin arrastrar el objeto entero.
 */
export function permiteEscritura(estado: EstadoSuscripcion): boolean {
  return estado !== 'solo-lectura' && estado !== 'cerrada';
}
