/**
 * Cómo se enseña un plan: sus topes en una lista y el título de lo que
 * incluye.
 *
 * Vive aquí y no dentro de una pantalla porque hay DOS que enseñan lo mismo —
 * `/precios`, para quien todavía no es cliente, y `/dashboard/suscripcion`,
 * para quien ya lo es y está cambiando de plan— y tienen que decir exactamente
 * los mismos números. Cuando cada una calculaba lo suyo, una se quedó vieja: es
 * el mismo accidente que dejó al formulario de contacto ofreciendo un tramo de
 * estudiantes que ya no existía.
 *
 * Solo lee de `PlanDef`. Sin base de datos, sin sesión: lo importan por igual
 * el servidor y el cliente.
 */

import type { PlanDef } from './plans';

export interface TopeDePlan {
  etiqueta: string;
  valor: string;
  /** El catálogo lo guarda como `-1`. Quien pinta decide cómo se ve. */
  sinTope?: boolean;
}

const num = (n: number) => n.toLocaleString('es-DO');

/**
 * Que el sistema le avisa solo al cliente, y por dónde.
 *
 * Antes aquí iba la cifra del plan —«675 avisos WhatsApp/mes»—. El número no
 * le dice nada a quien está eligiendo: lo que quiere saber es si tiene que
 * perseguir él los pagos o si el sistema avisa por su cuenta. El tope sigue
 * existiendo y aplicándose (`limits.whatsappMensajes`); lo que deja de hacer
 * es anunciarse.
 *
 * Va igual en las dos líneas: un colegio le avisa a las familias y un negocio
 * a sus clientes, pero es la misma función.
 */
const NOTIFICACIONES: TopeDePlan = {
  etiqueta: 'Notificaciones a clientes',
  valor: 'WhatsApp · SMS · correo',
};

/**
 * Los cuatro números que de verdad distinguen un plan de otro.
 *
 * Un colegio elige por estudiantes y le importan los avisos, que son lo que se
 * le acaba; un negocio elige por comprobantes. Por eso el orden cambia: lo
 * primero de la lista es la razón por la que esa persona está mirando.
 */
export function topesDePlan(
  plan: PlanDef,
  { conPos, esColegio }: { conPos: boolean; esColegio: boolean },
): TopeDePlan[] {
  const comprobantes: TopeDePlan = plan.limits.docs < 0
    ? { etiqueta: 'Comprobantes/mes', valor: 'Sin tope', sinTope: true }
    : { etiqueta: 'Comprobantes/mes', valor: num(plan.limits.docs) };

  if (esColegio) {
    return [
      { etiqueta: 'Estudiantes', valor: `Hasta ${num(plan.limits.estudiantes)}` },
      { etiqueta: 'Usuarios', valor: num(plan.limits.users) },
      NOTIFICACIONES,
      comprobantes,
    ];
  }

  return [
    comprobantes,
    { etiqueta: 'Usuarios', valor: num(plan.limits.users) },
    NOTIFICACIONES,
    { etiqueta: 'Punto de venta', valor: conPos ? 'Incluido' : 'No incluido' },
  ];
}

/**
 * «Incluye» en el primero, «Todo Básico, más» en los siguientes.
 *
 * El nombre sale del plan anterior de la misma línea y no de un texto fijo: si
 * mañana se reordena el catálogo, la escalera se reordena sola.
 */
export function tituloIncluye(planes: PlanDef[], i: number): string {
  return i === 0 ? 'Incluye' : `Todo ${planes[i - 1].name}, más`;
}
