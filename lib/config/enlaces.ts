/**
 * De dónde cuelgan los enlaces que salen del sistema hacia fuera.
 *
 * Hay dos fuentes, y cada una tiene su momento:
 *
 *  · `origenPublico(req)` —en lib/http/origen-publico— cuando se está
 *    contestando a un navegador. Es el origen real de esa petición, así que no
 *    puede quedar desincronizado de nada.
 *  · `baseDeEnlaces()` —aquí— cuando NO hay petición: el cron, un correo, o la
 *    URL que se graba dentro de una plantilla de Meta.
 *
 * Existe porque el mismo enlace de pago viaja por los dos caminos y tiene que
 * ser EL MISMO: dentro del botón de WhatsApp que toca el padre, y en el cuadro
 * que el empleado del colegio copia. Cada uno leía una variable distinta
 * —`PLANTILLAS_BASE_URL` uno, `NEXT_PUBLIC_APP_URL` el otro—, así que podían
 * apuntar a sitios distintos sin que nada avisara.
 *
 * Las dos reglas que sostienen esto:
 *
 *  1. Nunca se devuelve una base vacía ni relativa. `NEXT_PUBLIC_APP_URL` sin
 *     definir dejaba `/pagar/<token>`, que pegado en un WhatsApp no lleva a
 *     ninguna parte, y el fallo solo se ve cuando el padre dice que no le abre.
 *  2. En producción no se acepta una dirección de casa. Es exactamente lo que
 *     hay en el `.env` de una máquina de desarrollo, y dejarlo pasar mandaría a
 *     trescientas familias a la red local del portátil de alguien.
 */

/**
 * A dónde apunta el sistema cuando nadie dice otra cosa.
 *
 * `app.zero.com.do` porque es el host de la cuenta (`APP_HOST`) y el único
 * donde `/reset-password` y compañía resuelven sin dar un salto de más — el
 * proxy manda ahí toda ruta de cuenta que llegue por otro host.
 *
 * Antes era `facturacion-v2.zero.com.do`, que no es un dominio de producto sino
 * un resto de la migración a v2. Todo funcionaba —los siete dominios son alias
 * del mismo despliegue—, pero salía impreso en cada correo y, peor, dentro del
 * enlace de pago que le llega al padre por WhatsApp.
 */
export const BASE_PUBLICA = 'https://app.zero.com.do';

/**
 * ¿El host es de la máquina o de la red de casa?
 *
 * Vive en este módulo, que no importa nada, para que pueda usarlo tanto quien
 * resuelve el origen de una petición como quien decide si una variable de
 * entorno sirve. `origen-publico` lo reexporta.
 *
 * Cuenta `.local` y los tres rangos privados: en desarrollo con el teléfono se
 * abre la aplicación por la IP de la Mac (10.0.0.x) y ahí no hay TLS, así que
 * suponer https por no ser «localhost» generaba un enlace muerto.
 */
export function esHostLocal(host: string): boolean {
  let nombre = host.trim().toLowerCase();

  /**
   * El puerto se quita con cuidado: partir por el primer `:` deja `''` cuando
   * el host es IPv6 (`::1`), y entonces `::1` no se reconocía como local y el
   * enlace salía con https contra una dirección donde no hay TLS.
   */
  const conCorchetes = nombre.match(/^\[([^\]]+)\]/);
  if (conCorchetes) nombre = conCorchetes[1];
  else if ((nombre.match(/:/g) ?? []).length === 1) nombre = nombre.split(':')[0];

  return nombre === 'localhost'
    || nombre === '::1'
    || nombre === '0.0.0.0'
    || nombre.endsWith('.local')
    || /^127\./.test(nombre)
    || /^10\./.test(nombre)
    || /^192\.168\./.test(nombre)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(nombre);
}

function limpia(u: string): string {
  return u.trim().replace(/\/+$/, '');
}

/** Una base sirve si es absoluta y —fuera de desarrollo— pública. */
export function baseUsable(u: string | undefined | null): u is string {
  if (!u) return false;
  const v = limpia(u);
  if (!/^https?:\/\//i.test(v)) return false;
  if (process.env.NODE_ENV === 'production') {
    try {
      if (esHostLocal(new URL(v).host)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * La base de los enlaces cuando no hay una petición de la que sacarla.
 *
 * Orden: lo que se haya dicho a propósito, la del despliegue, la que Vercel
 * sabe de sí mismo, y como último recurso la pública. Nunca vacía.
 */
export function baseDeEnlaces(): string {
  const explicita = process.env.PLANTILLAS_BASE_URL;
  if (baseUsable(explicita)) return limpia(explicita);

  const app = process.env.NEXT_PUBLIC_APP_URL;
  if (baseUsable(app)) return limpia(app);

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${limpia(vercel).replace(/^https?:\/\//, '')}`;

  return BASE_PUBLICA;
}


/**
 * Las tres variables que pueden decidir la base, en el orden en que mandan.
 *
 * Están juntas y en un solo sitio porque el fallo que esto previene nace justo
 * de que estuvieran repartidas.
 */
const FUENTES_DE_BASE = [
  'PLANTILLAS_BASE_URL',
  'NEXT_PUBLIC_APP_URL',
  'BASE_URL',
] as const;

/**
 * Que las bases de enlaces no puedan estar mal sin que nadie se entere.
 *
 * El fallo que esto cierra ocurrió de verdad, y dos veces seguidas. Los enlaces
 * de los correos salían apuntando a `facturacion-v2.zero.com.do` —un resto de
 * la migración, no un dominio de producto—. Se cambió `NEXT_PUBLIC_APP_URL` y
 * siguió saliendo igual, porque `PLANTILLAS_BASE_URL` se lee ANTES y conservaba
 * el valor viejo. Nada avisó: la aplicación funcionaba, compilaba, desplegaba, y
 * mandaba correos con una dirección equivocada.
 *
 * Dos comprobaciones, y las dos rompen el build en producción:
 *
 *  1. Una base puesta tiene que servir. Vacía, relativa o apuntando a una
 *     dirección de casa, no sirve — y en producción eso mandaría a los padres
 *     de un colegio a la red local del portátil de alguien.
 *  2. Si hay más de una puesta, tienen que decir lo mismo. Que discrepen es
 *     precisamente el estado que hizo invisible el fallo: la que manda es la
 *     primera, y quien edita cualquier otra cree haber arreglado algo.
 *
 * Se rompe el build a propósito, y no se avisa por consola: un aviso en el log
 * de un build es un aviso que nadie lee.
 */
export function validarBasesDeEnlaces(): void {
  const puestas = FUENTES_DE_BASE
    .map(clave => ({ clave, valor: (process.env[clave] ?? '').trim() }))
    .filter(({ valor }) => valor !== '');

  const problemas: string[] = [];

  for (const { clave, valor } of puestas) {
    if (!baseUsable(valor)) {
      problemas.push(
        `${clave}="${valor}" no sirve como base de enlaces: hace falta una URL absoluta ` +
        `(https://…) y, en producción, que no apunte a una dirección local.`,
      );
    }
  }

  const distintas = new Set(puestas.map(({ valor }) => limpia(valor)));
  if (distintas.size > 1) {
    problemas.push(
      `Las bases de enlaces no coinciden: ${puestas.map(p => `${p.clave}="${limpia(p.valor)}"`).join(', ')}. ` +
      `Manda ${puestas[0].clave}; las demás no se leen, así que editarlas no cambia nada. ` +
      `Ponlas iguales o deja solo una.`,
    );
  }

  if (problemas.length === 0) return;

  const mensaje = `\n⛔ Bases de enlaces mal configuradas:\n${problemas.map(p => `  - ${p}`).join('\n')}\n`;
  console.error(mensaje);

  /**
   * Solo revienta en un despliegue de verdad.
   *
   * `NODE_ENV` no sirve para decidirlo: `next build` lo pone en 'production'
   * siempre, también cuando alguien compila en su portátil con el `.env` de
   * desarrollo — y ahí las bases apuntan a localhost y a la IP de la Mac, que
   * es lo correcto en esa máquina. Con la primera versión de esta comprobación,
   * `next build` dejó de funcionar en local.
   *
   * `VERCEL_ENV` sí distingue: solo vale 'production' en el despliegue de
   * producción. Fuera de ahí queda el aviso por consola, que es lo que hace
   * falta mientras se trabaja.
   */
  if (process.env.VERCEL_ENV === 'production') throw new Error(mensaje);
}
