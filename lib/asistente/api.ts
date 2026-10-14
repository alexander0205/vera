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

export interface ClienteApi {
  get<T = unknown>(ruta: string, params?: ParamsApi): Promise<T>;
}

const TIEMPO_MS = 12_000;

export function crearClienteApi(opts: { origen: string; cookie: string | null }): ClienteApi {
  return {
    async get<T>(ruta: string, params: ParamsApi = {}): Promise<T> {
      // Solo la API propia: ninguna herramienta puede apuntar a otro sitio.
      if (!ruta.startsWith('/api/') || ruta.includes('..')) throw new ErrorApi(400, ruta, 'Ruta de API no permitida');
      const url = new URL(ruta, opts.origen);
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
      }
      const r = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json', ...(opts.cookie ? { cookie: opts.cookie } : {}), 'x-asistente': '1' },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIEMPO_MS),
      });
      if (!r.ok) throw new ErrorApi(r.status, ruta);
      return (await r.json()) as T;
    },
  };
}

/** Para pruebas: responde con lo que se le dé por ruta, y anota las llamadas. */
export function apiFalsa(respuestas: Record<string, unknown | ((p: ParamsApi) => unknown)>) {
  const llamadas: { ruta: string; params: ParamsApi }[] = [];
  const api: ClienteApi = {
    async get<T>(ruta: string, params: ParamsApi = {}) {
      llamadas.push({ ruta, params });
      const r = respuestas[ruta];
      if (r === undefined) throw new ErrorApi(404, ruta);
      return (typeof r === 'function' ? (r as (p: ParamsApi) => unknown)(params) : r) as T;
    },
  };
  return { api, llamadas };
}
