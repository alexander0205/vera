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
