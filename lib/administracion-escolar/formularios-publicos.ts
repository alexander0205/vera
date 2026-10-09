import { randomBytes } from 'node:crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarFormularios, adminEscolarFormularioRespuestas } from '@/lib/db/schema';
import { isCampoVacio } from './formularios-validacion';
import type { ICampo, IFormularioConfig } from './formularios';

/**
 * Lo que comparten la página pública y sus rutas de API.
 *
 * Vive aparte porque el formulario se abre desde dos sitios —la página que se
 * renderiza en el servidor y el fetch del navegador— y las dos tienen que
 * recortar exactamente lo mismo. Con dos copias, un día una deja de recortar
 * `notificarEmail` y el correo interno del colegio acaba en el navegador de un
 * padre sin que nadie lo note.
 */

/** El formulario tal como puede verlo cualquiera con el enlace. */
export function formularioPublico(f: {
  id: number; nombre: string; descripcion: string | null;
  campos: unknown; configuracion: unknown;
}) {
  const cfg = (f.configuracion ?? {}) as IFormularioConfig;
  return {
    id: f.id,
    nombre: f.nombre,
    descripcion: f.descripcion,
    campos: (f.campos ?? []) as ICampo[],
    // `notificarEmail` se queda fuera a propósito: es un correo interno del
    // centro y no tiene por qué viajar al navegador de una familia.
    configuracion: {
      mensajeConfirmacion: cfg.mensajeConfirmacion ?? '¡Gracias! Recibimos tu formulario.',
      urlRedireccion: cfg.urlRedireccion,
      colorPrimario: cfg.colorPrimario ?? '#2563eb',
      colorFondo: cfg.colorFondo,
      colorTarjeta: cfg.colorTarjeta,
      logoUrl: cfg.logoUrl,
      bilingue: cfg.bilingue,
      captchaActivo: cfg.captchaActivo,
    },
  };
}

export type FormularioPublicoDTO = ReturnType<typeof formularioPublico>;

export async function buscarFormulario(slug: string) {
  const [fila] = await db.select().from(adminEscolarFormularios)
    .where(and(
      eq(adminEscolarFormularios.slug, slug),
      eq(adminEscolarFormularios.activo, true),
    ))
    .limit(1);
  return fila ?? null;
}

/** Ya no se puede contestar: caducó o llegó al tope de envíos. */
export async function motivoCerrado(f: { id: number; configuracion: unknown }): Promise<string | null> {
  const cfg = (f.configuracion ?? {}) as IFormularioConfig;

  if (cfg.fechaExpiracion && new Date(cfg.fechaExpiracion) < new Date()) {
    return 'Este formulario ya cerró.';
  }

  if (cfg.limitarEnvios && cfg.limitarEnvios > 0) {
    // Los borradores NO cuentan: si contaran, veinte padres que abrieron el
    // enlace y no terminaron cerrarían el formulario para los que sí van a
    // contestar.
    const [{ n }] = await db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(adminEscolarFormularioRespuestas)
      .where(and(
        eq(adminEscolarFormularioRespuestas.formularioId, f.id),
        ne(adminEscolarFormularioRespuestas.estado, 'borrador'),
      ));
    if (n >= cfg.limitarEnvios) return 'Este formulario alcanzó el límite de respuestas.';
  }

  return null;
}

/**
 * La llave del enlace de continuación.
 *
 * 32 bytes de azar criptográfico, no el id de la fila: el enlace es lo ÚNICO
 * que hace falta para leer y reescribir la ficha de un menor, así que tiene
 * que ser imposible de adivinar contando 1, 2, 3.
 */
export function nuevoToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Descarta lo que no corresponda a un campo del formulario. */
export function soloCamposConocidos(campos: ICampo[], datos: Record<string, unknown>) {
  const conocidos = new Set(campos.map((c) => c.id));
  const limpio: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(datos)) if (conocidos.has(k)) limpio[k] = v;
  return limpio;
}

/** Los obligatorios que siguen vacíos, por su etiqueta. */
export function faltantes(campos: ICampo[], datos: Record<string, unknown>) {
  return campos
    .filter((c) => c.requerido && isCampoVacio(c.tipo, datos[c.id]))
    .map((c) => c.label);
}

/** Tope de tamaño del JSON guardado. */
export const LIMITE_DATOS = 200_000;
