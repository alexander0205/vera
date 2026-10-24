/**
 * lib/administracion-escolar/tareas-reglas.ts — las reglas de las tareas por
 * revisar, sin base de datos: qué se acepta al crear una, cómo se llama quien
 * escribe y qué dice cada evento de la conversación. Lo usan las rutas y lo
 * prueba vitest; la pantalla repite las etiquetas desde aquí.
 */

export const ASIGNACIONES = ['direccion', 'administracion', 'soporte', 'persona'] as const;
export type Asignacion = typeof ASIGNACIONES[number];

/** Cómo se lee a quién le toca. «persona» se lee con su nombre. */
export const ETIQUETA_ASIGNACION: Record<Exclude<Asignacion, 'persona'>, string> = {
  direccion: 'Dirección',
  administracion: 'Administración',
  soporte: 'Soporte IT · Zero',
};

export const AUTOR_SOPORTE = 'Soporte IT · Zero';
export const AUTOR_IA = 'Zero AI';

export function etiquetaAsignada(asignadaA: string, nombrePersona?: string | null): string {
  if (asignadaA === 'persona') return nombrePersona?.trim() || 'Una persona';
  return ETIQUETA_ASIGNACION[asignadaA as Exclude<Asignacion, 'persona'>] ?? asignadaA;
}

/**
 * Cómo firma quien escribe. El equipo de Zero (rol de plataforma `admin`)
 * firma como Soporte IT, aunque entre a la empresa del colegio: para el
 * colegio es soporte, no un empleado suyo.
 */
export function autorDe(user: { name?: string | null; email: string; platformRole?: string | null }): string {
  if (user.platformRole === 'admin') return AUTOR_SOPORTE;
  return user.name?.trim() || user.email;
}

export interface NuevaTarea {
  alcance: 'alumno' | 'familia';
  titulo: string;
  descripcion: string | null;
  asignadaA: Asignacion;
  asignadaUserId: number | null;
  ecfDocumentId: number | null;
  venceEl: string | null;
}

const TOPE_TITULO = 160;
const TOPE_TEXTO = 4000;
const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const idPositivo = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Lo que manda la pantalla al crear una tarea, ya limpio, o el error para la persona. */
export function validarNuevaTarea(entrada: unknown): { ok: true; tarea: NuevaTarea } | { ok: false; error: string } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const titulo = typeof e.titulo === 'string' ? e.titulo.trim() : '';
  if (!titulo) return { ok: false, error: 'Escribe qué hay que revisar.' };
  if (titulo.length > TOPE_TITULO) return { ok: false, error: `El título es muy largo (máximo ${TOPE_TITULO} letras).` };
  const descripcion = typeof e.descripcion === 'string' && e.descripcion.trim() ? e.descripcion.trim() : null;
  if (descripcion && descripcion.length > TOPE_TEXTO) return { ok: false, error: 'La descripción es muy larga.' };
  const alcance = e.alcance === 'familia' ? 'familia' : 'alumno';
  if (!ASIGNACIONES.includes(e.asignadaA as Asignacion)) return { ok: false, error: 'Elige a quién se le asigna.' };
  const asignadaA = e.asignadaA as Asignacion;
  const asignadaUserId = idPositivo(e.asignadaUserId);
  if (asignadaA === 'persona' && !asignadaUserId) return { ok: false, error: 'Elige a la persona.' };
  const venceEl = typeof e.venceEl === 'string' && e.venceEl ? e.venceEl : null;
  if (venceEl && !esFecha(venceEl)) return { ok: false, error: 'La fecha no es válida.' };
  return {
    ok: true,
    tarea: {
      alcance, titulo, descripcion, asignadaA,
      asignadaUserId: asignadaA === 'persona' ? asignadaUserId : null,
      ecfDocumentId: idPositivo(e.ecfDocumentId),
      venceEl,
    },
  };
}

/** Lo que se escribe en la conversación: no vacío y con tope. */
export function validarMensaje(texto: unknown): { ok: true; texto: string } | { ok: false; error: string } {
  const t = typeof texto === 'string' ? texto.trim() : '';
  if (!t) return { ok: false, error: 'Escribe algo antes de enviar.' };
  if (t.length > TOPE_TEXTO) return { ok: false, error: 'El mensaje es muy largo.' };
  return { ok: true, texto: t };
}

/** Las líneas que deja cada cambio en la conversación. */
export const textoEvento = {
  creada: (autor: string, asignada: string) => `${autor} creó la tarea y la asignó a ${asignada}`,
  completada: (autor: string) => `${autor} marcó la tarea como completada`,
  reabierta: (autor: string) => `${autor} volvió a abrir la tarea`,
};
