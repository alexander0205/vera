import 'server-only';
import { generateText, type LanguageModel } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { eq } from 'drizzle-orm';
import { auditLogs, plataformaAjustes } from '@/lib/db/schema';
import {
  CLAVE_AJUSTE_MODELOS, elegirModelos, explicarErrorIa, idDirecto,
  type AjusteModelos, type ModelosDeUso, type UsoIa,
} from './modelos';

/**
 * El lado servidor de lib/ia/modelos.ts: convertir un id en algo que el AI SDK
 * pueda llamar, y leer y guardar lo que escogió el administrador.
 */

export const porGateway = () => Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);

/**
 * Con gateway, el id tal cual (`anthropic/claude-sonnet-5.5`). Sin gateway, se
 * habla directo con el proveedor si hay su llave. Sin ninguna de las dos, null.
 */
export function comoModelo(id: string): LanguageModel | null {
  if (!id) return null;
  if (porGateway()) return id;
  const directo = idDirecto(id);
  if (!directo) return null;
  if (directo.proveedor === 'google' && process.env.GOOGLE_GENERATIVE_AI_API_KEY) return google(directo.modelo);
  if (directo.proveedor === 'anthropic' && process.env.ANTHROPIC_API_KEY) return anthropic(directo.modelo);
  return null;
}

/** ¿Hay algún camino para llamar a un modelo? (gateway o la llave de un proveedor) */
export const hayCaminoIa = () =>
  porGateway() || Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.ANTHROPIC_API_KEY);

/**
 * La base y la caché se cargan al primer uso y no al importar: el asistente y
 * el lector de facturas importan este archivo, y sus pruebas no tienen base.
 */
let leerGuardado: (() => Promise<AjusteModelos | null>) | null = null;
let avisado = false;

/**
 * Lo guardado en /admin/ia. Se lee en cada mensaje del asistente, así que va
 * en caché hasta que alguien lo cambie. Nunca lanza: sin la tabla (migración
 * sin correr) o sin conexión, se sigue con los modelos de fábrica.
 */
export async function leerAjusteModelos(): Promise<AjusteModelos | null> {
  try {
    if (!leerGuardado) {
      const [{ db }, { cachearPorTag, tagPlataformaIa }] = await Promise.all([
        import('@/lib/db/drizzle'), import('@/lib/cache/escolar'),
      ]);
      leerGuardado = cachearPorTag(
        async () => {
          const [fila] = await db
            .select({ valor: plataformaAjustes.valor })
            .from(plataformaAjustes)
            .where(eq(plataformaAjustes.clave, CLAVE_AJUSTE_MODELOS))
            .limit(1);
          return (fila?.valor as AjusteModelos | undefined) ?? null;
        },
        ['plataforma', CLAVE_AJUSTE_MODELOS],
        [tagPlataformaIa],
      );
    }
    return await leerGuardado();
  } catch (e) {
    if (!avisado) {
      avisado = true;
      console.warn('[ia] no se pudieron leer los modelos guardados; van los de fábrica:', e instanceof Error ? e.message : e);
    }
    return null;
  }
}

/** Principal y respaldo de una parte de Zero. */
export async function modelosDe(uso: UsoIa): Promise<ModelosDeUso> {
  return elegirModelos(await leerAjusteModelos(), uso, process.env);
}

/** Guarda lo escogido en /admin/ia y deja rastro de quién lo cambió y de qué a qué. */
export async function guardarAjusteModelos(valor: AjusteModelos, quien: { id: number; email: string }): Promise<void> {
  const [{ db }, { invalidarPlataformaIa }] = await Promise.all([
    import('@/lib/db/drizzle'), import('@/lib/cache/escolar'),
  ]);
  const antes = await leerAjusteModelos();
  await db
    .insert(plataformaAjustes)
    .values({ clave: CLAVE_AJUSTE_MODELOS, valor, actualizadoPor: quien.id, actualizadoEn: new Date() })
    .onConflictDoUpdate({
      target: plataformaAjustes.clave,
      set: { valor, actualizadoPor: quien.id, actualizadoEn: new Date() },
    });
  invalidarPlataformaIa();
  // logAudit pide una empresa y esto es de toda la plataforma: va directo con team_id vacío.
  await db.insert(auditLogs).values({
    teamId: null,
    userId: quien.id,
    actor: quien.email,
    action: 'IA_MODELOS_CAMBIADOS',
    resource: CLAVE_AJUSTE_MODELOS,
    metadata: JSON.stringify({ antes, despues: valor }),
  }).catch((e) => console.error('[ia] no se pudo registrar el cambio de modelos en audit_logs:', e));
}

/**
 * Una llamada mínima para saber si un modelo contesta con la llave de este
 * despliegue. Es lo que distingue «Claude no está disponible en el plan
 * gratuito» de «Claude funciona».
 */
export async function probarModelo(id: string): Promise<{ ok: true; ms: number } | { ok: false; error: string }> {
  const modelo = comoModelo(id);
  if (!modelo) return { ok: false, error: 'No hay AI Gateway ni llave de este proveedor en este despliegue.' };
  const inicio = Date.now();
  try {
    await generateText({
      model: modelo,
      prompt: 'Responde solo: ok',
      maxOutputTokens: 16,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(20_000),
    });
    return { ok: true, ms: Date.now() - inicio };
  } catch (e) {
    return { ok: false, error: explicarErrorIa(e) };
  }
}
