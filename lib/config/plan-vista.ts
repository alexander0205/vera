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
import { CANALES_TEXTO } from '@/components/canales-aviso';

export interface TopeDePlan {
  etiqueta: string;
  /** Lo que se lee. Con `canales` puesto es además lo que oye un lector de
   *  pantalla, porque en la tarjeta se dibujan iconos en su lugar. */
  valor: string;
  /** El catálogo lo guarda como `-1`. Quien pinta decide cómo se ve. */
  sinTope?: boolean;
  /** Se pinta con los iconos de WhatsApp, SMS y correo (`CanalesAviso`). */
  canales?: boolean;
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
 * SOLO en la línea de colegio. Los avisos por WhatsApp y SMS son del módulo
 * escolar: los planes de e-CF llevan `whatsappMensajes: -1`, que ahí no
 * significa «ilimitado» sino «no aplica». Ponerlo también en sus tarjetas fue
 * un error mío y estuvo publicado un rato prometiendo un canal que esos planes
 * no tienen.
 */
const NOTIFICACIONES: TopeDePlan = {
  etiqueta: 'Notificaciones a clientes',
  valor: CANALES_TEXTO,
  canales: true,
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

  // Lo que el plan ABRE, no lo que le limita. Sale de `modulos` y `features`
  // y no escrito a mano: así una tarjeta no puede prometer un módulo que el
  // plan no entrega, que es exactamente lo que pasó cuando se anunciaron
  // avisos por WhatsApp en unos planes que no los llevan.
  //
  // La contabilidad tiene fila propia y no va escondida dentro de «sistema
  // completo: contabilidad, inventario, caja…»: es lo que de verdad nos separa
  // de la competencia, que la cobra aparte o no la tiene.
  const contabilidad: TopeDePlan = {
    etiqueta: 'Contabilidad',
    valor: plan.features.includes('contabilidad-avanzada') ? 'Incluida' : 'No incluida',
  };
  const puntoDeVenta: TopeDePlan = {
    etiqueta: 'Punto de venta',
    valor: conPos || plan.modulos.includes('pos') ? 'Incluido' : 'No incluido',
  };

  if (esColegio) {
    return [
      { etiqueta: 'Estudiantes', valor: `Hasta ${num(plan.limits.estudiantes)}` },
      { etiqueta: 'Usuarios', valor: num(plan.limits.users) },
      comprobantes,
      {
        etiqueta: 'Gobernanza del colegio',
        valor: plan.modulos.includes('escolar') ? 'Incluida' : 'No incluida',
      },
      puntoDeVenta,
      contabilidad,
      NOTIFICACIONES,
    ];
  }

  return [
    comprobantes,
    { etiqueta: 'Usuarios', valor: num(plan.limits.users) },
    contabilidad,
    puntoDeVenta,
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
