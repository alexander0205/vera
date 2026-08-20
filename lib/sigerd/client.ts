/**
 * Cliente de SIGERD (MINERD) — login y consultas autenticadas server-side.
 *
 * El portal no expone API: es ASP.NET MVC con sesión por cookie. Este cliente
 * reproduce paso a paso lo que hace el navegador en el formulario de login,
 * siempre con las credenciales que el propio usuario introdujo en nuestra app.
 *
 * Flujo real observado en https://sigerd.minerd.gob.do (script inline del login):
 *
 *   1. GET  /                            → cookies de sesión + __RequestVerificationToken
 *   2. POST /Account/CargarInformacion   → { Usuario, Password } (form-urlencoded)
 *      Respuesta JSON:
 *        -2  credenciales inválidas
 *        -3  usuario desactivado
 *         0  rechazado (el portal manda de vuelta al login)
 *         1  OK con un solo perfil → saltar al paso 4
 *        []  arreglo de perfiles → hay que elegir uno (paso 3)
 *   3. POST /Account/SessionCreateRole   → { Id: "IdCentro-IdRol-IdRegional", Nombre }
 *      (JSON). Devuelve 1 si el perfil quedó fijado en la sesión.
 *   4. POST /                            → submit del form `inicio-form` con
 *      __RequestVerificationToken + Usuario + password. Aquí es donde el portal
 *      emite la cookie de autenticación definitiva.
 *
 * Notas:
 *  - No hay CAPTCHA en el login.
 *  - El formulario incluye dos inputs señuelo llamados `fake`; el navegador los
 *    envía vacíos y nosotros hacemos lo mismo.
 *  - La contraseña vive solo en memoria durante el login y se descarta al final:
 *    nunca se guarda en `SigerdSesion`.
 *
 * Uso típico:
 *
 *   const cli = new SigerdClient();
 *   const r = await cli.iniciarSesion(usuario, password);
 *   if (r.estado === 'seleccion-perfil') await cli.seleccionarPerfil(r.perfiles[0]);
 *   const html = await cli.html('/Home/Index');
 *   const sesion = cli.exportarSesion();      // cifrar antes de persistir
 */

import { CookieJar } from './cookies';
import { porLaCompuerta, _config } from './gate';
import {
  SigerdError,
  type SigerdLoginResult,
  type SigerdPerfil,
  type SigerdSesion,
} from './types';

const BASE_URL = process.env.SIGERD_BASE_URL ?? 'https://sigerd.minerd.gob.do';

/**
 * User-Agent con el que nos presentamos ante el portal. Configurable por si el
 * MINERD prefiere que la integración se identifique con un UA propio.
 */
const USER_AGENT =
  process.env.SIGERD_USER_AGENT ??
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const TIMEOUT_MS = Number(process.env.SIGERD_TIMEOUT_MS ?? 30_000);

/**
 * Detección de "me devolvieron el login".
 *
 * Ojo: `/` **es** la página de login del portal, así que no basta con mirar la
 * ruta. Y `name="Usuario"` por sí solo da falsos positivos (aparece en otros
 * formularios), por eso se exige el formulario de login completo.
 */
function esPaginaLogin(html: string): boolean {
  if (/id=["']inicio-form["']/.test(html)) return true;
  return html.includes('Account/CargarInformacion') && /name=["']password["']/i.test(html);
}

interface SigerdClientOpts {
  baseUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
  /** Traza cada petición al portal: método, ruta, status y duración. */
  onEvento?: (mensaje: string) => void;
}

/** Forma cruda de cada perfil tal como lo serializa el portal. */
interface PerfilCrudo {
  IdCentro: number;
  IdRol: number;
  IdRegional: number;
  NombreRol: string;
  NombreCentro?: string | null;
}

export class SigerdClient {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly onEvento?: (mensaje: string) => void;

  private jar: CookieJar;
  private token: string | null = null;
  private perfil: SigerdPerfil | null = null;
  /** Destino del 302 posterior al login: la home real, porque `/` es el login. */
  private rutaInicio: string | null = null;
  /** Cédula con la que se abrió la sesión. El logout la exige; la clave no. */
  private usuarioActivo: string | null = null;

  /** Credenciales retenidas SOLO entre el paso 2 y el paso 4 del login. */
  private credenciales: { usuario: string; password: string } | null = null;

  constructor(opts: SigerdClientOpts = {}) {
    this.baseUrl = (opts.baseUrl ?? BASE_URL).replace(/\/+$/, '');
    this.userAgent = opts.userAgent ?? USER_AGENT;
    this.timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
    this.onEvento = opts.onEvento;
    this.jar = new CookieJar();
  }

  // ─────────────────────────────── Login ────────────────────────────────

  /**
   * Pasos 1 y 2 (y 4 si el usuario tiene un solo perfil).
   *
   * Devuelve `seleccion-perfil` cuando el usuario pertenece a varios centros o
   * roles: en ese caso hay que llamar a `seleccionarPerfil` para cerrar el login.
   */
  async iniciarSesion(usuarioCrudo: string, password: string): Promise<SigerdLoginResult> {
    const usuario = normalizarUsuario(usuarioCrudo);
    if (!usuario || !password) {
      throw new SigerdError('credenciales-invalidas', 'Usuario y contraseña son obligatorios.');
    }

    // Paso 1 — sesión limpia + antiforgery token.
    this.jar = new CookieJar();
    this.token = null;
    this.perfil = null;
    this.rutaInicio = null;
    this.usuarioActivo = usuario;
    const login = await this.pedir('/', { method: 'GET' });
    this.token = extraerToken(await login.text());
    if (!this.token) {
      throw new SigerdError(
        'token-no-encontrado',
        'No se encontró __RequestVerificationToken en el formulario de login de SIGERD.',
      );
    }

    // Paso 2 — validación de credenciales.
    this.credenciales = { usuario, password };
    const res = await this.pedir('/Account/CargarInformacion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: new URLSearchParams({ Usuario: usuario, Password: password }).toString(),
    });

    const cuerpo = (await res.text()).trim();
    let data: unknown;
    try {
      data = JSON.parse(cuerpo);
    } catch {
      this.credenciales = null;
      throw new SigerdError(
        'respuesta-inesperada',
        `Account/CargarInformacion no devolvió JSON (HTTP ${res.status}).`,
        res.status,
      );
    }

    if (data === -2) {
      this.credenciales = null;
      throw new SigerdError('credenciales-invalidas', 'Usuario o contraseña no válidos.');
    }
    if (data === -3) {
      this.credenciales = null;
      throw new SigerdError('usuario-desactivado', 'El usuario se encuentra desactivado en SIGERD.');
    }
    if (data === 0) {
      this.credenciales = null;
      throw new SigerdError('rechazado', 'SIGERD rechazó el inicio de sesión.');
    }

    if (data === 1) {
      await this.finalizarLogin();
      return { estado: 'autenticado' };
    }

    if (Array.isArray(data)) {
      return { estado: 'seleccion-perfil', perfiles: data.map(normalizarPerfil) };
    }

    this.credenciales = null;
    throw new SigerdError(
      'respuesta-inesperada',
      `Account/CargarInformacion devolvió un valor no contemplado: ${cuerpo.slice(0, 120)}`,
    );
  }

  /** Pasos 3 y 4: fija el perfil elegido y cierra el login. */
  async seleccionarPerfil(perfil: SigerdPerfil): Promise<void> {
    if (!this.credenciales) {
      throw new SigerdError(
        'sesion-expirada',
        'El login caducó antes de elegir perfil. Vuelve a llamar a iniciarSesion.',
      );
    }

    const res = await this.pedir('/Account/SessionCreateRole', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ Id: perfil.id, Nombre: perfil.nombreRol }),
    });

    const cuerpo = (await res.text()).trim();
    if (cuerpo !== '1') {
      this.credenciales = null;
      throw new SigerdError(
        'perfil-invalido',
        `SIGERD no aceptó el perfil ${perfil.id} (respuesta: ${cuerpo.slice(0, 80)}).`,
        res.status,
      );
    }

    this.perfil = perfil;
    await this.finalizarLogin();
  }

  /**
   * Paso 4 — submit del formulario `inicio-form`. Es el POST que emite la
   * cookie de autenticación. Al terminar borra la contraseña de memoria.
   */
  private async finalizarLogin(): Promise<void> {
    const creds = this.credenciales;
    if (!creds || !this.token) {
      throw new SigerdError('sesion-expirada', 'Estado de login incompleto.');
    }

    // `fake` son los dos inputs señuelo del formulario: el navegador los manda vacíos.
    const form = new URLSearchParams();
    form.append('fake', '');
    form.append('fake', '');
    form.append('__RequestVerificationToken', this.token);
    form.append('Usuario', creds.usuario);
    form.append('password', creds.password);

    const res = await this.pedir('/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${this.baseUrl}/`,
      },
      body: form.toString(),
      redirect: 'manual',
    });

    // La contraseña ya no hace falta: fuera de memoria.
    this.credenciales = null;

    // 302 → autenticado. El `Location` es la home real del portal: `/` es la
    // página de login, así que sin guardar este destino no hay por dónde entrar.
    if (res.status >= 300 && res.status < 400) {
      const destino = res.headers.get('location');
      if (destino) this.rutaInicio = aRutaRelativa(destino, this.baseUrl);
      return;
    }

    // 200 → puede ser el login de vuelta (fallo silencioso).
    if (res.status === 200) {
      const html = await res.text();
      if (esPaginaLogin(html)) {
        throw new SigerdError(
          'rechazado',
          'SIGERD devolvió el formulario de login tras el submit final.',
          res.status,
        );
      }
      const nuevo = extraerToken(html);
      if (nuevo) this.token = nuevo;
    }
  }

  // ───────────────────────────── Consultas ──────────────────────────────

  /**
   * Petición autenticada a cualquier ruta del portal. Lanza `sesion-expirada`
   * si SIGERD devuelve el formulario de login (cookie caducada).
   */
  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.pedir(path, init);

    // Un 302 hacia /Account/Login es la señal clásica de sesión caída.
    const location = res.headers.get('location') ?? '';
    if (/\/Account\/(Login|LogOff)/i.test(location)) {
      throw new SigerdError('sesion-expirada', 'La sesión de SIGERD caducó.', res.status);
    }

    return res;
  }

  /** Igual que `fetch` pero devuelve el HTML y valida que no sea la página de login. */
  async html(path: string, init: RequestInit = {}): Promise<string> {
    const res = await this.fetch(path, init);
    const html = await res.text();

    if (esPaginaLogin(html)) {
      throw new SigerdError('sesion-expirada', 'La sesión de SIGERD caducó.', res.status);
    }

    const nuevo = extraerToken(html);
    if (nuevo) this.token = nuevo;

    return html;
  }

  /** Igual que `fetch` pero parsea JSON. Útil para los endpoints AJAX del portal. */
  async json<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetch(path, {
      ...init,
      headers: { 'X-Requested-With': 'XMLHttpRequest', ...(init.headers ?? {}) },
    });

    const cuerpo = await res.text();
    try {
      return JSON.parse(cuerpo) as T;
    } catch {
      if (esPaginaLogin(cuerpo)) {
        throw new SigerdError('sesion-expirada', 'La sesión de SIGERD caducó.', res.status);
      }
      throw new SigerdError(
        'respuesta-inesperada',
        `${path} no devolvió JSON (HTTP ${res.status}).`,
        res.status,
      );
    }
  }

  /**
   * Ruta de entrada tras el login. Nunca `/`: esa es la página de login.
   * Si el portal no mandó `Location`, se prueba el clásico de ASP.NET MVC.
   */
  get inicio(): string {
    return this.rutaInicio ?? '/Home/Index';
  }

  /**
   * POST `application/x-www-form-urlencoded` que devuelve JSON: así habla todo
   * el AJAX del portal (`$.post(rootDir + "Ctrl/Accion", { … })`).
   */
  async postForm<T = unknown>(
    path: string,
    campos: Record<string, string | number | boolean | null | undefined>,
    opts: { referer?: string } = {},
  ): Promise<T> {
    const body = new URLSearchParams();
    for (const [clave, valor] of Object.entries(campos)) {
      if (valor !== undefined && valor !== null) body.append(clave, String(valor));
    }

    return this.json<T>(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        // El portal emite estas llamadas desde su propia página; algunas
        // acciones de ASP.NET rechazan el POST si llega sin Referer.
        ...(opts.referer ? { Referer: `${this.baseUrl}${opts.referer}` } : {}),
      },
      body: body.toString(),
    });
  }

  /**
   * Abre la página de un módulo antes de consultar su grid.
   *
   * SIGERD arma estado de sesión al renderizar la vista (servicio y año activos
   * del centro). Si se llama al endpoint del grid "en frío", el portal responde
   * con el login y parece que la sesión caducó.
   */
  async abrirModulo(ruta: string): Promise<void> {
    await this.html(ruta);
  }

  /** Comprueba contra el portal si la sesión sigue viva. */
  async estaAutenticado(): Promise<boolean> {
    try {
      await this.html(this.inicio);
      return true;
    } catch (e) {
      if (e instanceof SigerdError && e.codigo === 'sesion-expirada') return false;
      throw e;
    }
  }

  async cerrarSesion(): Promise<void> {
    try {
      // El portal cierra sesión con el formulario `POST /Account/LogOff` y el
      // campo `userName`. Con GET devuelve 500.
      await this.pedir('/Account/LogOff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ userName: this.usuarioActivo ?? '' }).toString(),
        redirect: 'manual',
      });
    } finally {
      this.jar = new CookieJar();
      this.token = null;
      this.perfil = null;
      this.rutaInicio = null;
      this.usuarioActivo = null;
      this.credenciales = null;
    }
  }

  // ─────────────────────────── (De)serialización ────────────────────────

  /** Estado serializable para persistir la sesión. Nunca incluye la contraseña. */
  exportarSesion(): SigerdSesion {
    return {
      cookies: this.jar.toJSON(),
      token: this.token,
      perfil: this.perfil,
      inicio: this.rutaInicio,
      usuario: this.usuarioActivo,
      actualizadaEn: Date.now(),
    };
  }

  /** Reconstruye un cliente a partir de una sesión previamente exportada. */
  static desdeSesion(sesion: SigerdSesion, opts: SigerdClientOpts = {}): SigerdClient {
    const cli = new SigerdClient(opts);
    cli.jar = new CookieJar(sesion.cookies);
    cli.token = sesion.token;
    cli.perfil = sesion.perfil;
    cli.rutaInicio = sesion.inicio ?? null;
    cli.usuarioActivo = sesion.usuario ?? null;
    return cli;
  }

  /**
   * Reanuda un login que quedó a medias en la selección de perfil.
   *
   * En serverless el proceso muere entre la llamada que valida credenciales
   * (paso 2) y la que elige perfil (paso 3), así que hay que reconstruir jar,
   * token y credenciales. La contraseña la reenvía el navegador del usuario;
   * no se guarda en ningún lado del servidor.
   */
  static reanudarSeleccion(
    sesion: SigerdSesion,
    usuario: string,
    password: string,
    opts: SigerdClientOpts = {},
  ): SigerdClient {
    const cli = SigerdClient.desdeSesion(sesion, opts);
    cli.credenciales = { usuario: normalizarUsuario(usuario), password };
    cli.usuarioActivo = normalizarUsuario(usuario);
    return cli;
  }

  get perfilActivo(): SigerdPerfil | null {
    return this.perfil;
  }

  /** Último __RequestVerificationToken visto (algunos POST del portal lo exigen). */
  get antiforgeryToken(): string | null {
    return this.token;
  }

  // ────────────────────────────── Interno ───────────────────────────────

  private async pedir(path: string, init: RequestInit): Promise<Response> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const cookies = this.jar.header();

    const headers: Record<string, string> = {
      'User-Agent': this.userAgent,
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-DO,es;q=0.9',
      ...(cookies ? { Cookie: cookies } : {}),
      ...((init.headers as Record<string, string>) ?? {}),
    };

    const metodo = init.method ?? 'GET';

    // Una sola petición HTTP, con su propio timeout. La compuerta puede llamar
    // a esto varias veces (reintento ante caídas del portal).
    const unaVez = async (): Promise<Response> => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      const t0 = Date.now();
      this.onEvento?.(`→ ${metodo} ${path}`);

      try {
        const r = await fetch(url, { ...init, headers, signal: ctrl.signal, redirect: init.redirect ?? 'follow' });
        this.onEvento?.(`← ${metodo} ${path} ${r.status} (${Date.now() - t0}ms)`);
        return r;
      } catch (e) {
        const causa = e instanceof Error ? e.message : String(e);
        const agotado = e instanceof Error && e.name === 'AbortError';
        this.onEvento?.(`✗ ${metodo} ${path} — ${agotado ? `timeout ${this.timeoutMs}ms` : causa}`);
        throw new SigerdError(
          'red',
          agotado
            ? `SIGERD no respondió en ${this.timeoutMs}ms (${path}).`
            : `No se pudo contactar a SIGERD (${path}): ${causa}`,
        );
      } finally {
        clearTimeout(timer);
      }
    };

    // Concurrencia + ritmo + jitter globales, y reintento ante 502/503/504
    // (el portal del MINERD se cae con frecuencia).
    const res = await porLaCompuerta(unaVez, (r) => _config.REINTENTABLES.has(r.status));

    this.jar.absorber(res);
    return res;
  }
}

// ───────────────────────────── Utilidades ───────────────────────────────

/**
 * SIGERD espera la cédula sin guiones ni espacios (`22500089127`, no
 * `225-0008912-7`). Normalizamos aquí para que la UI y los scripts acepten
 * cualquiera de las dos formas.
 */
export function normalizarUsuario(usuario: string): string {
  return usuario.replace(/[\s-]/g, '').trim();
}

/**
 * Convierte el `Location` de un 302 en ruta relativa del portal. Si apunta a
 * otro host se descarta: no seguimos redirecciones fuera de SIGERD.
 */
function aRutaRelativa(location: string, baseUrl: string): string | null {
  if (location.startsWith('/')) return location.startsWith('//') ? null : location;

  try {
    const url = new URL(location);
    return url.origin === new URL(baseUrl).origin ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

/** Extrae el valor de `__RequestVerificationToken` sin depender del orden de atributos. */
function extraerToken(html: string): string | null {
  const inputs = html.match(/<input\b[^>]*>/gi) ?? [];
  for (const input of inputs) {
    if (!/name=["']__RequestVerificationToken["']/i.test(input)) continue;
    const valor = input.match(/value=["']([^"']*)["']/i);
    if (valor?.[1]) return valor[1];
  }
  return null;
}

function normalizarPerfil(crudo: PerfilCrudo): SigerdPerfil {
  return {
    idCentro: crudo.IdCentro,
    idRol: crudo.IdRol,
    idRegional: crudo.IdRegional,
    nombreRol: crudo.NombreRol,
    nombreCentro: crudo.NombreCentro ?? null,
    // El portal arma el value así: IdCentro + "-" + IdRol + "-" + IdRegional
    id: `${crudo.IdCentro}-${crudo.IdRol}-${crudo.IdRegional}`,
  };
}
