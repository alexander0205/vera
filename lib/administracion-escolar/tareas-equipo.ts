/**
 * lib/administracion-escolar/tareas-equipo.ts — quién del equipo de Zero atiende
 * y responde una tarea, como lo ve el colegio: nombre, cargo y foto. Puro y sin
 * base de datos (lo prueba vitest).
 *
 * Al colegio solo le llega el primer nombre, el cargo y la URL de la foto. Nunca
 * el correo ni el nombre completo de la persona.
 */
import { esFirmaSoporte, primerNombre } from './tareas-reglas';

/** Una persona del equipo de Zero, tal como se le enseña a un colegio. */
export interface PersonaEquipo {
  userId: number;
  /** Solo el primer nombre. */
  nombre: string;
  cargo: string | null;
  /** `null` si no tiene foto: se enseñan sus iniciales. */
  fotoUrl: string | null;
}

/**
 * La foto que ven los colegios (cualquier usuario con sesión). Otra ruta que la
 * del panel (`urlFotoEquipo`, solo administradores), con la versión en `?v=`
 * para que el navegador la cachee sin enseñar una vieja.
 */
export const urlFotoParaColegios = (userId: number, version: number) => `/api/equipo-zero/${userId}/foto?v=${version}`;

/** Lo que se sabe de una cuenta del equipo, a persona para enseñar; `null` si no tiene un nombre que enseñar. */
export function armarPersonaEquipo(d: {
  userId: number; name: string | null | undefined; cargo?: string | null; fotoVersion?: number | null;
}): PersonaEquipo | null {
  const nombre = primerNombre(d.name);
  if (!nombre) return null;
  const cargo = d.cargo?.trim() || null;
  return {
    userId: d.userId, nombre, cargo,
    fotoUrl: d.fotoVersion != null ? urlFotoParaColegios(d.userId, d.fotoVersion) : null,
  };
}

/** «Ana · Soporte técnico · Zero», o «Ana · Zero» si no tiene cargo. */
export const etiquetaPersona = (p: Pick<PersonaEquipo, 'nombre' | 'cargo'>) =>
  [p.nombre, p.cargo, 'Zero'].filter(Boolean).join(' · ');

/** «Ana · Soporte técnico», para «La atiende: …». */
export const etiquetaAtiende = (p: Pick<PersonaEquipo, 'nombre' | 'cargo'>) =>
  [p.nombre, p.cargo].filter(Boolean).join(' · ');

/** Cómo firma una persona del equipo en un aviso («Ana · Zero»), o la firma genérica si no se sabe quién es. */
export const firmaVisible = (autor: { nombre: string }, p: PersonaEquipo | null | undefined) =>
  p ? `${p.nombre} · Zero` : autor.nombre;

export function inicialesDe(nombre: string): string {
  if (esFirmaSoporte(nombre) || nombre.startsWith('Soporte IT') || nombre.startsWith('Departamento de IT')) return 'IT';
  if (nombre === 'Zero AI') return 'AI';
  const p = nombre.trim().split(/\s+/);
  return `${p[0]?.[0] ?? ''}${p[1]?.[0] ?? ''}`.toUpperCase() || '·';
}

/**
 * La persona detrás de un mensaje: solo si lo escribió el equipo de Zero (firma
 * de Soporte, mensaje o archivo) con una cuenta que se conoce. Un mensaje del
 * colegio nunca se atribuye al equipo, aunque su id coincida.
 */
export function personaDeMensaje(
  m: { userId: number | null; autor: string; tipo: string },
  equipo: ReadonlyMap<number, PersonaEquipo>,
): PersonaEquipo | null {
  if (m.userId == null || !esFirmaSoporte(m.autor)) return null;
  if (m.tipo !== 'mensaje' && m.tipo !== 'adjunto') return null;
  return equipo.get(m.userId) ?? null;
}

/** Cómo se dibuja quien escribió un mensaje. */
export interface AutorMostrado {
  /** Es una persona concreta del equipo de Zero (no la firma genérica). */
  esPersona: boolean;
  etiqueta: string;
  iniciales: string;
  fotoUrl: string | null;
}

/**
 * El autor a mostrar: la persona con su nombre, cargo y foto («Ana · Soporte
 * técnico · Zero»; sin foto, sus iniciales) o, en un mensaje viejo sin persona,
 * la firma con que se escribió («Soporte IT · Zero»).
 */
export function autorAMostrar(m: { autor: string; equipo?: PersonaEquipo | null }): AutorMostrado {
  const p = m.equipo;
  if (p && esFirmaSoporte(m.autor)) {
    return { esPersona: true, etiqueta: etiquetaPersona(p), iniciales: inicialesDe(p.nombre), fotoUrl: p.fotoUrl };
  }
  return { esPersona: false, etiqueta: m.autor, iniciales: inicialesDe(m.autor), fotoUrl: null };
}

/** El filtro «Mis tareas» del panel: de quién se buscan las tareas atendidas. */
export type FiltroAtiende = { tipo: 'usuario'; userId: number } | { tipo: 'ninguna' } | null;

/** `mias` con sesión = las que atiende esa persona; `mias` sin quién mira = ninguna (nunca todas); otro valor = sin filtro. */
export function filtroAtiende(valor: string | undefined, yoId: number | null | undefined): FiltroAtiende {
  if (valor !== 'mias') return null;
  return yoId != null && Number.isInteger(yoId) && yoId > 0 ? { tipo: 'usuario', userId: yoId } : { tipo: 'ninguna' };
}
