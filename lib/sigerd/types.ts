/**
 * Tipos del cliente SIGERD (Sistema de Gestión de Centros Educativos — MINERD).
 *
 * SIGERD es una aplicación ASP.NET MVC sin API pública documentada. La
 * integración replica el mismo flujo de login que hace el navegador del
 * usuario, usando SIEMPRE las credenciales que el propio usuario introduce
 * en nuestra app. No hay credenciales de servicio ni cuentas compartidas.
 */

/** Perfil (centro + rol + regional) devuelto por `Account/CargarInformacion`. */
export interface SigerdPerfil {
  idCentro: number;
  idRol: number;
  idRegional: number;
  nombreRol: string;
  nombreCentro: string | null;
  /** Valor exacto que espera `Account/SessionCreateRole`: `IdCentro-IdRol-IdRegional`. */
  id: string;
}

/** Resultado de `SigerdClient.iniciarSesion`. */
export type SigerdLoginResult =
  /** Credenciales válidas y un solo perfil: la sesión ya quedó abierta. */
  | { estado: 'autenticado' }
  /** Credenciales válidas con varios perfiles: falta llamar `seleccionarPerfil`. */
  | { estado: 'seleccion-perfil'; perfiles: SigerdPerfil[] };

export type SigerdErrorCodigo =
  | 'credenciales-invalidas'   // CargarInformacion devolvió -2
  | 'usuario-desactivado'      // CargarInformacion devolvió -3
  | 'rechazado'                // CargarInformacion devolvió 0 (vuelve al login)
  | 'sesion-expirada'          // una consulta autenticada rebotó al formulario de login
  | 'perfil-invalido'          // SessionCreateRole no devolvió 1
  | 'perfil-requerido'         // la cuenta tiene varios perfiles y no se sabe cuál es el del colegio
  | 'token-no-encontrado'      // no se pudo leer __RequestVerificationToken
  | 'respuesta-inesperada'     // el portal contestó algo que no sabemos interpretar
  | 'red';                     // fallo de transporte / timeout

/** Error tipado: permite mapear a mensajes de UI sin parsear strings. */
export class SigerdError extends Error {
  readonly codigo: SigerdErrorCodigo;
  readonly status?: number;

  constructor(codigo: SigerdErrorCodigo, mensaje: string, status?: number) {
    super(mensaje);
    this.name = 'SigerdError';
    this.codigo = codigo;
    this.status = status;
  }
}

/** Lo que se enseña de un perfil para que el colegio elija. Sin ids internos de sesión. */
export interface PerfilElegible {
  idCentro: number;
  nombreCentro: string | null;
  nombreRol: string;
}

/**
 * La cuenta entra a varios centros o roles y no hay uno guardado (o el guardado
 * ya no está entre los que ofrece el portal). Lleva la lista para que la
 * pantalla pregunte: adivinar es justo lo que bajó los datos de otro colegio.
 */
export class PerfilRequeridoError extends SigerdError {
  readonly perfiles: PerfilElegible[];

  constructor(perfiles: PerfilElegible[], mensaje?: string) {
    super(
      'perfil-requerido',
      mensaje ?? 'Tu cuenta de SIGERD tiene varios perfiles. En Conectar, elige el de tu centro.',
    );
    this.name = 'PerfilRequeridoError';
    this.perfiles = perfiles;
  }
}

/**
 * Estado serializable de una sesión SIGERD ya abierta.
 *
 * ⚠️ Contiene las cookies de sesión del usuario en el portal del MINERD:
 * trátalo como un secreto. Si se persiste, va cifrado (ver `lib/crypto/cert.ts`).
 * NO incluye la contraseña — el cliente la descarta al terminar el login.
 */
export interface SigerdSesion {
  cookies: Record<string, string>;
  /** Último __RequestVerificationToken visto (necesario para POSTs del portal). */
  token: string | null;
  /** Perfil activo, si hubo selección. */
  perfil: SigerdPerfil | null;
  /**
   * Ruta a la que redirigió el portal al autenticar: es la home real. `/` no
   * sirve, porque esa URL es el propio formulario de login.
   */
  inicio?: string | null;
  /**
   * Cédula con la que se abrió la sesión. Hace falta para el logout, que es un
   * `POST /Account/LogOff` con campo `userName`. La contraseña NO se guarda.
   */
  usuario?: string | null;
  /** Epoch ms del último uso — para caducar sesiones inactivas. */
  actualizadaEn: number;
}
