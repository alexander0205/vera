import 'server-only';

/**
 * El motor de búsqueda del asistente habla con la MISMA API que usa la
 * pantalla, no con la base de datos.
 *
 * Por qué: la pantalla de facturas, de clientes o de cotizaciones tienen sus
 * propias reglas (qué tipos se listan, cómo se busca, cómo se calcula lo
 * pagado, el orden). Una consulta paralela a la base las reimplementa mal y
 * termina diciendo cosas distintas a lo que la persona ve. Al pasar por la
 * API, el asistente ve lo que ve la pantalla, con los mismos permisos y las
 * mismas reglas, y cuando la API cambia, el asistente cambia con ella.
 *
 * La llamada va con la cookie de la persona que pregunta: la API la
 * autentica y la limita a su empresa igual que si fuera el navegador. El
 * modelo nunca escoge la ruta; cada herramienta fija la suya.
 */

export class ErrorApi extends Error {
  constructor(public status: number, public ruta: string, mensaje?: string) {
    super(mensaje ?? `La API respondió ${status} en ${ruta}`);
    this.name = 'ErrorApi';
  }
}

export type ParamsApi = Record<string, string | number | boolean | null | undefined>;
export type MetodoEscritura = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ClienteApi {
  get<T = unknown>(ruta: string, params?: ParamsApi): Promise<T>;
  /**
   * Escribe por la misma API que la pantalla, con la sesión de la persona.
   * Solo la usan las acciones que la persona ya confirmó en el panel
   * (`acciones.ts`); el modelo no tiene ninguna herramienta que llegue aquí.
   */
  enviar<T = unknown>(metodo: MetodoEscritura, ruta: string, cuerpo?: unknown, params?: ParamsApi): Promise<T>;
}

const TIEMPO_MS = 12_000;
/** Descargar SIGERD o matricular una sección enteras tardan: la API les da hasta 5 minutos. */
const TIEMPO_ESCRITURA_MS = 280_000;

/**
 * Rutas donde una acción del asistente no puede escribir: el propio asistente
 * (confirmaría acciones a sí mismo), los crons y el panel de plataforma.
 */
const ESCRITURA_PROHIBIDA = /^\/api\/(asistente|cron|admin)(\/|$)/;

function urlDe(origen: string, ruta: string, params: ParamsApi): URL {
  // Solo la API propia: ninguna herramienta puede apuntar a otro sitio.
  if (!ruta.startsWith('/api/') || ruta.includes('..')) throw new ErrorApi(400, ruta, 'Ruta de API no permitida');
  const url = new URL(ruta, origen);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return url;
}

export function crearClienteApi(opts: { origen: string; cookie: string | null }): ClienteApi {
  const cabeceras = { accept: 'application/json', ...(opts.cookie ? { cookie: opts.cookie } : {}), 'x-asistente': '1' };
  return {
    async get<T>(ruta: string, params: ParamsApi = {}): Promise<T> {
      const r = await fetch(urlDe(opts.origen, ruta, params), {
        method: 'GET',
        headers: cabeceras,
        cache: 'no-store',
        signal: AbortSignal.timeout(TIEMPO_MS),
      });
      if (!r.ok) throw new ErrorApi(r.status, ruta);
      return (await r.json()) as T;
    },
    async enviar<T>(metodo: MetodoEscritura, ruta: string, cuerpo?: unknown, params: ParamsApi = {}): Promise<T> {
      if (ESCRITURA_PROHIBIDA.test(ruta)) throw new ErrorApi(403, ruta, 'El asistente no escribe en esa ruta');
      const r = await fetch(urlDe(opts.origen, ruta, params), {
        method: metodo,
        headers: { ...cabeceras, origin: opts.origen, ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(TIEMPO_ESCRITURA_MS),
      });
      const datos = await r.json().catch(() => null) as (T & { error?: unknown }) | null;
      // El error de la API ya viene escrito para la persona («El curso tiene
      // matriculados»): se pasa tal cual en vez de un «respondió 409».
      if (!r.ok) throw new ErrorApi(r.status, ruta, typeof datos?.error === 'string' ? datos.error : undefined);
      return datos as T;
    },
  };
}

/** Para pruebas: responde con lo que se le dé por ruta, y anota las llamadas. */
export function apiFalsa(respuestas: Record<string, unknown | ((p: ParamsApi, cuerpo?: unknown) => unknown)>) {
  const llamadas: { ruta: string; params: ParamsApi; metodo?: MetodoEscritura; cuerpo?: unknown }[] = [];
  const responder = (clave: string, ruta: string, params: ParamsApi, cuerpo?: unknown) => {
    const r = respuestas[clave] ?? respuestas[ruta];
    if (r === undefined) throw new ErrorApi(404, ruta);
    return typeof r === 'function' ? (r as (p: ParamsApi, c?: unknown) => unknown)(params, cuerpo) : r;
  };
  const api: ClienteApi = {
    async get<T>(ruta: string, params: ParamsApi = {}) {
      llamadas.push({ ruta, params });
      return responder(ruta, ruta, params) as T;
    },
    async enviar<T>(metodo: MetodoEscritura, ruta: string, cuerpo?: unknown, params: ParamsApi = {}) {
      llamadas.push({ ruta, params, metodo, cuerpo });
      // En las pruebas una escritura se responde por «MÉTODO /ruta».
      return responder(`${metodo} ${ruta}`, ruta, params, cuerpo) as T;
    },
  };
  return { api, llamadas };
}
