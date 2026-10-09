/**
 * Pool de relés de SIGERD, con relevo automático.
 *
 * El portal del MINERD no contesta el TLS a las IPs de fuera del país: la
 * conexión TCP abre y ahí se queda. Vercel sale por datacenters en Estados
 * Unidos, así que desde producción no hay forma de entrar. La solución es una
 * máquina en territorio dominicano corriendo `scripts/sigerd-relay.mjs`, y
 * `SIGERD_BASE_URL` apuntando a ella.
 *
 * Una sola máquina es un punto único de falla: se va la luz, se duerme la Mac,
 * se cae el internet de la casa. Por eso aquí hay una LISTA y no una sola URL.
 *
 *   SIGERD_RELAYS = https://rele-1.ejemplo,https://rele-2.ejemplo
 *
 * Se prueban en el orden en que están escritas: la primera es la de siempre,
 * las demás son respaldo. Cuando una falla se marca caída por un rato y el
 * tráfico pasa a la siguiente sin que el usuario se entere; pasado el
 * enfriamiento se vuelve a intentar la primera, así que la degradación se cura
 * sola cuando la máquina vuelve.
 *
 * POR QUÉ SE PUEDE CAMBIAR DE RELÉ A MITAD DE SESIÓN: el relé no guarda nada.
 * Las cookies del portal viven en el `CookieJar` del cliente, no en la máquina
 * que reenvía. Cambiar de relé es cambiar por dónde sale el paquete, no de
 * sesión. El riesgo real está en el otro extremo: si SIGERD atara la sesión a
 * la IP de origen, saltar de relé la invalidaría. No lo hemos visto, pero si un
 * día aparecen sesiones que mueren solas al cambiar de máquina, esto es lo
 * primero que hay que mirar.
 *
 * LÍMITE HONESTO: el mapa de salud vive en memoria del proceso. En Vercel cada
 * instancia tiene el suyo, así que una instancia puede seguir intentando contra
 * un relé que otra ya descartó. Con dos o tres máquinas el costo de eso es un
 * intento fallido y un relevo — aceptable. Para un estado compartido de verdad
 * habría que llevarlo a Postgres, como `rate-limit.ts`.
 */

/** Destino del portal cuando no hay relés: solo sirve desde el país. */
const PORTAL = 'https://sigerd.minerd.gob.do';

/** Cuánto se deja fuera un relé que falló, antes de volver a probarlo. */
const ENFRIAMIENTO_MS = Number(process.env.SIGERD_RELAY_ENFRIAMIENTO_MS ?? 60_000);

export type Relevo = {
  /** Base a la que se le pega, sin barra final. */
  base: string;
  /** `false` cuando es el portal directo: entonces no se manda la clave del relé. */
  esRele: boolean;
};

type Salud = { fallos: number; caidoHasta: number };

const salud = new Map<string, Salud>();

/** Lee la lista de la configuración. Acepta la variable vieja de una sola URL. */
function configuradas(): Relevo[] {
  const lista = (process.env.SIGERD_RELAYS ?? process.env.SIGERD_BASE_URL ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (!lista.length) return [{ base: PORTAL, esRele: false }];
  return lista.map((base) => ({ base, esRele: base !== PORTAL }));
}

/**
 * Los candidatos en el orden en que hay que probarlos: primero los sanos, en el
 * orden configurado; después los que están en enfriamiento, por si acaso.
 *
 * Nunca devuelve vacío. Si todos están caídos es mejor intentar contra uno
 * caído que fallarle al usuario sin haber tocado la red.
 */
export function candidatos(): Relevo[] {
  const todos = configuradas();
  const ahora = Date.now();
  const sanos = todos.filter((r) => (salud.get(r.base)?.caidoHasta ?? 0) <= ahora);
  const caidos = todos.filter((r) => (salud.get(r.base)?.caidoHasta ?? 0) > ahora);
  return [...sanos, ...caidos];
}

/** Un relé no respondió: fuera por un rato, con enfriamiento creciente. */
export function marcarCaido(base: string): void {
  const previo = salud.get(base) ?? { fallos: 0, caidoHasta: 0 };
  const fallos = previo.fallos + 1;
  // 1× 2× 4× … hasta 8×, para no castigar eternamente a una máquina que volvió.
  const factor = Math.min(2 ** (fallos - 1), 8);
  salud.set(base, { fallos, caidoHasta: Date.now() + ENFRIAMIENTO_MS * factor });
}

/** Respondió: se le borra el historial para que no arrastre castigos viejos. */
export function marcarVivo(base: string): void {
  if (salud.has(base)) salud.delete(base);
}

/** Para diagnosticar desde una ruta de administración o un script. */
export function estado(): Array<{ base: string; esRele: boolean; sano: boolean; fallos: number; vuelveEn: number }> {
  const ahora = Date.now();
  return configuradas().map((r) => {
    const s = salud.get(r.base);
    return {
      base: r.base,
      esRele: r.esRele,
      sano: (s?.caidoHasta ?? 0) <= ahora,
      fallos: s?.fallos ?? 0,
      vuelveEn: Math.max(0, (s?.caidoHasta ?? 0) - ahora),
    };
  });
}
