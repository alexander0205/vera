/**
 * Las reglas del equipo de Zero: quién puede agregar y quitar administradores
 * de la plataforma, y a quién. PURO y sin base de datos, para poder probarlo
 * sin conectar nada; la ruta y `equipo-zero.ts` solo reúnen los datos y le
 * preguntan a esto.
 *
 * Dos niveles (migración 0216):
 *   · ADMIN  `users.platform_role = 'admin'`. Ve y crea negocios y usa el panel.
 *   · DUEÑO  un admin que además está en `platform_owners`. Es el único que
 *            agrega o quita administradores.
 *
 * Por qué dos: un admin tiene acceso a TODAS las empresas. Si el recién agregado
 * también pudiera agregar y quitar admins, podría sacar al dueño o dejar cuentas
 * de respaldo. El nivel de dueño no se da ni se quita desde la pantalla.
 */

export type AccionEquipo = 'agregar' | 'quitar';

export interface ActorEquipo {
  id: number;
  esAdmin: boolean;
  esDueno: boolean;
}

export interface ObjetivoEquipo {
  id: number;
  esAdmin: boolean;
  esDueno: boolean;
  /** Ya probó que el correo es suyo. */
  verificado: boolean;
}

export type CodigoRechazo =
  | 'no_autenticado'
  | 'no_admin'
  | 'solo_dueno'
  | 'sin_confirmar'
  | 'ya_es_admin'
  | 'no_es_admin'
  | 'es_dueno'
  | 'correo_sin_verificar'
  | 'a_si_mismo'
  | 'ultimo_admin';

export type Veredicto =
  | { ok: true }
  | { ok: false; codigo: CodigoRechazo; status: number; mensaje: string };

const no = (codigo: CodigoRechazo, status: number, mensaje: string): Veredicto =>
  ({ ok: false, codigo, status, mensaje });

export interface EntradaEvaluacion {
  accion: AccionEquipo;
  /** Quien hace la petición; `null` si no hay sesión. */
  actor: ActorEquipo | null;
  /** La cuenta que se toca. En `agregar` puede ser `null`: aún no existe. */
  objetivo: ObjetivoEquipo | null;
  /** El diálogo de confirmación de la pantalla se aceptó. */
  confirmado: boolean;
  /** Cuántos administradores activos hay AHORA (leídos con el candado puesto). */
  adminsActivos: number;
}

/**
 * ¿Se puede hacer este cambio? El orden importa: primero quién eres, luego
 * si confirmaste, y solo entonces lo que le pasaría a la cuenta tocada, para
 * que a quien no puede no se le cuente nada de las demás cuentas.
 */
export function evaluarCambioDeEquipo(e: EntradaEvaluacion): Veredicto {
  const { actor, objetivo } = e;

  if (!actor) return no('no_autenticado', 401, 'No autenticado');
  if (!actor.esAdmin) return no('no_admin', 403, 'Acceso restringido a administradores');
  if (!actor.esDueno) {
    return no('solo_dueno', 403, 'Solo el dueño de la plataforma puede agregar o quitar administradores.');
  }
  if (!e.confirmado) return no('sin_confirmar', 400, 'Falta confirmar el cambio.');

  if (e.accion === 'agregar') {
    if (objetivo?.esAdmin) return no('ya_es_admin', 409, 'Esa cuenta ya es administradora.');
    // Una cuenta que nunca verificó su correo pudo abrirla CUALQUIERA con ese correo (el registro
    // lo comprueba después): darle acceso total sería regalárselo a quien la registró primero.
    if (objetivo && !objetivo.verificado) {
      return no('correo_sin_verificar', 409, 'Esa cuenta no ha verificado su correo. Que lo verifique primero, o invítala con otro correo para que se cree una cuenta nueva.');
    }
    return { ok: true };
  }

  // quitar
  if (!objetivo || !objetivo.esAdmin) return no('no_es_admin', 409, 'Esa cuenta no es administradora.');
  if (objetivo.id === actor.id) return no('a_si_mismo', 400, 'No puedes quitarte a ti mismo el acceso.');
  if (objetivo.esDueno) {
    return no('es_dueno', 403, 'Un dueño no se quita desde aquí. Se hace a mano en la base de datos.');
  }
  if (e.adminsActivos <= 1) {
    return no('ultimo_admin', 409, 'No se puede quitar al último administrador de la plataforma.');
  }
  return { ok: true };
}

// ── Correo ───────────────────────────────────────────────────────────────────

const FORMA_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** El correo como se guarda: sin espacios y en minúsculas. `null` si no parece uno. */
export function normalizarCorreo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const c = valor.trim().toLowerCase();
  if (c.length < 5 || c.length > 255 || !FORMA_CORREO.test(c)) return null;
  return c;
}

/** El nombre como se guarda: recortado, sin saltos, hasta 100 (el largo de la columna). `null` si queda vacío. */
export function normalizarNombre(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const n = valor.replace(/\s+/g, ' ').trim().slice(0, 100);
  return n || null;
}

/**
 * Lo que dice la fila de auditoría: quién, a quién y qué. Va en `metadata`
 * (JSON) de `audit_logs`; la hora la pone la base.
 */
export function metaDeAuditoria(d: {
  accion: AccionEquipo | 'invitar';
  actor: { id: number; email: string };
  objetivo: { id: number; email: string };
  cuentaNueva?: boolean;
  adminsDespues: number;
}) {
  return {
    accion: d.accion,
    actor: d.actor,
    objetivo: d.objetivo,
    cuentaNueva: d.cuentaNueva ?? false,
    adminsDespues: d.adminsDespues,
  };
}
