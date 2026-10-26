import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { tool } from 'ai';
import type { ToolSet } from 'ai';
import type { Permission } from '@/lib/config/roles';
import type { ContextoAsistente } from './contexto';
import { rateLimitDb } from '@/lib/rate-limit';

/**
 * POLÍTICA DE ACCIONES DEL ASISTENTE
 *
 * 1. Nada que cree, elimine o modifique se ejecuta por orden del modelo. La
 *    herramienta del modelo solo PROPONE: devuelve un resumen y un token.
 * 2. Ejecutar exige que la persona pulse «Confirmar» en el panel
 *    (`POST /api/asistente/confirmar`, con su sesión). Un mensaje, una
 *    respuesta o un dato de un cliente que diga «confirmo» no cuenta.
 * 3. El token vence en 5 minutos, es de un solo uso y va atado a la persona,
 *    a la empresa y a los argumentos exactos: no sirve para otra cosa.
 * 4. Al confirmar se vuelven a validar permiso y módulo, no se confía en lo
 *    que valía al proponer.
 * 5. Las acciones destructivas (eliminar) se marcan como tales en la tarjeta.
 *
 * Hoy el asistente es de consulta y NO hay acciones registradas: este módulo
 * es el carril por el que tendrá que pasar cualquier acción futura. Agregar
 * una es registrarla aquí con `registrarAccion`; no hay otra forma de que el
 * modelo escriba.
 */

export type TipoAccion = 'crear' | 'modificar' | 'eliminar';

export interface AccionDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  nombre: string;
  tipo: TipoAccion;
  /** Qué hace, para el modelo. */
  descripcion: string;
  /** Permiso que exige, igual que la pantalla equivalente. */
  permiso: Permission;
  /** Módulo que debe tener la empresa. */
  modulo?: Parameters<ContextoAsistente['tieneModulo']>[0];
  esquema: S;
  /** Frase para la tarjeta de confirmación: qué va a pasar, con los datos concretos. */
  resumen: (args: z.infer<S>) => string;
  /** Lo que de verdad hace; recibe la sesión ya verificada. Pasa por los mismos servicios que la pantalla. */
  ejecutar: (ctx: ContextoAsistente, usuarioId: number, args: z.infer<S>) => Promise<{ mensaje: string; enlace?: string }>;
}

const REGISTRO = new Map<string, AccionDef>();

export function registrarAccion<S extends z.ZodTypeAny>(def: AccionDef<S>) {
  if (REGISTRO.has(def.nombre)) throw new Error(`Acción duplicada: ${def.nombre}`);
  REGISTRO.set(def.nombre, def as unknown as AccionDef);
}
/** Solo para pruebas. */
export const limpiarAcciones = () => REGISTRO.clear();
export const accionesRegistradas = () => [...REGISTRO.values()].map((a) => ({ nombre: a.nombre, tipo: a.tipo }));

// ── Propuesta y confirmación ────────────────────────────────────────────────

const llave = () => new TextEncoder().encode(process.env.AUTH_SECRET);
const VIGENCIA = '5 minutes';

export interface Propuesta {
  /** Para mostrar la tarjeta; el modelo lo repite al usuario. */
  confirmacionPendiente: true;
  token: string;
  tipo: TipoAccion;
  destructiva: boolean;
  resumen: string;
}

export async function proponerAccion(
  ctx: ContextoAsistente, usuarioId: number, nombre: string, argsCrudos: unknown,
): Promise<Propuesta | { error: string }> {
  const def = REGISTRO.get(nombre);
  if (!def) return { error: 'Esa acción no existe.' };
  if (def.modulo && !ctx.tieneModulo(def.modulo)) return { error: 'Tu empresa no tiene el módulo necesario para esa acción.' };
  if (!ctx.puede(def.permiso)) return { error: 'Tu rol no tiene permiso para esa acción.' };
  const v = def.esquema.safeParse(argsCrudos);
  if (!v.success) return { error: 'Faltan datos o no son válidos para esa acción.' };

  const token = await new SignJWT({ n: nombre, a: v.data, u: usuarioId, t: ctx.teamId })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(VIGENCIA)
    .sign(llave());
  return {
    confirmacionPendiente: true,
    token,
    tipo: def.tipo,
    destructiva: def.tipo === 'eliminar',
    resumen: def.resumen(v.data),
  };
}

export type ResultadoConfirmacion =
  | { ok: true; mensaje: string; enlace?: string; nombre: string; tipo: TipoAccion; resumen: string }
  | { ok: false; error: string; status: 400 | 403 | 409 };

export async function confirmarAccion(
  ctx: ContextoAsistente, usuarioId: number, token: string,
): Promise<ResultadoConfirmacion> {
  let p: { n?: string; a?: unknown; u?: number; t?: number; jti?: string };
  try {
    p = (await jwtVerify(token, llave(), { algorithms: ['HS256'] })).payload as typeof p;
  } catch {
    return { ok: false, error: 'La confirmación venció. Pídeme la acción de nuevo.', status: 400 };
  }
  // Atada a esta persona y a esta empresa: un token ajeno no ejecuta nada.
  if (p.u !== usuarioId || p.t !== ctx.teamId) return { ok: false, error: 'Esta confirmación no es tuya.', status: 403 };

  const def = p.n ? REGISTRO.get(p.n) : undefined;
  if (!def) return { ok: false, error: 'Esa acción ya no está disponible.', status: 400 };
  // Se revalida: los permisos pudieron cambiar entre proponer y confirmar.
  if (def.modulo && !ctx.tieneModulo(def.modulo)) return { ok: false, error: 'Tu empresa ya no tiene ese módulo.', status: 403 };
  if (!ctx.puede(def.permiso)) return { ok: false, error: 'Tu rol ya no tiene permiso para eso.', status: 403 };
  const v = def.esquema.safeParse(p.a);
  if (!v.success) return { ok: false, error: 'Los datos de la acción no son válidos.', status: 400 };

  // De un solo uso: el segundo intento con el mismo token no ejecuta.
  const uso = await rateLimitDb(`asistente_accion:${p.jti}`, 1, 10 * 60_000);
  if (!uso.allowed) return { ok: false, error: 'Esta acción ya se confirmó.', status: 409 };

  const r = await def.ejecutar(ctx, usuarioId, v.data);
  return { ok: true, ...r, nombre: def.nombre, tipo: def.tipo, resumen: def.resumen(v.data) };
}

// ── Herramientas del modelo ─────────────────────────────────────────────────

/**
 * Una herramienta de PROPUESTA por cada acción registrada y permitida. El
 * modelo nunca recibe una herramienta que ejecute.
 */
export function herramientasDeAcciones(
  ctx: ContextoAsistente,
  usuarioId: number,
  /** Aquí se anotan las propuestas para que la API las mande al panel como tarjetas. */
  propuestas?: Propuesta[],
): ToolSet {
  const out: ToolSet = {};
  for (const def of REGISTRO.values()) {
    if (def.modulo && !ctx.tieneModulo(def.modulo)) continue;
    if (!ctx.puede(def.permiso)) continue;
    out[`proponer_${def.nombre}`] = tool({
      description:
        `${def.descripcion} NO la ejecuta: prepara la acción y la persona debe confirmarla con el botón del panel. ` +
        'Después de llamarla, dile qué va a pasar y que pulse «Confirmar»; nunca digas que ya quedó hecho.',
      inputSchema: def.esquema as z.ZodTypeAny,
      execute: async (args: unknown) => {
        const r = await proponerAccion(ctx, usuarioId, def.nombre, args);
        if ('confirmacionPendiente' in r) propuestas?.push(r);
        // El modelo recibe el resumen, no el token: solo el panel puede confirmar.
        return 'confirmacionPendiente' in r
          ? { confirmacionPendiente: true, tipo: r.tipo, destructiva: r.destructiva, resumen: r.resumen }
          : r;
      },
    });
  }
  return out;
}
