/**
 * Sistema de logs del servidor — guarda errores, warnings e info en system_logs
 * Nunca lanza excepciones: si falla el log, lo imprime en consola y sigue.
 */

import { db } from '@/lib/db/drizzle';
import { systemLogs } from '@/lib/db/schema';

export type LogLevel = 'error' | 'warn' | 'info';

interface LogParams {
  level?: LogLevel;
  teamId?: number | null;
  userId?: number | null;
  source: string;
  message: string;
  details?: unknown;
}

export async function saveLog(params: LogParams): Promise<void> {
  try {
    await db.insert(systemLogs).values({
      teamId:  params.teamId  ?? null,
      userId:  params.userId  ?? null,
      level:   params.level   ?? 'error',
      source:  params.source,
      message: params.message,
      details: params.details !== undefined ? JSON.stringify(params.details, null, 2) : null,
    });
  } catch (e) {
    // Nunca dejar que el logger rompa la app
    console.error('[logger] Failed to persist log entry:', e);
  }
}

/** Shorthand para errores */
export async function logError(params: Omit<LogParams, 'level'>) {
  return saveLog({ ...params, level: 'error' });
}

/** Shorthand para warnings */
export async function logWarn(params: Omit<LogParams, 'level'>) {
  return saveLog({ ...params, level: 'warn' });
}

/** Shorthand para info */
export async function logInfo(params: Omit<LogParams, 'level'>) {
  return saveLog({ ...params, level: 'info' });
}

/**
 * Extrae el cuerpo de error de la DGII del mensaje de excepción.
 * La DGII retorna JSON o texto plano — lo parseamos si podemos.
 */
export function parseDgiiError(errorMessage: string): {
  status: number | null;
  body: unknown;
  resumen: string;
} {
  // El client lanza: "Error enviando e-CF: 400 - {cuerpo}"
  const match = errorMessage.match(/:\s*(\d{3})\s*-\s*([\s\S]+)$/);
  if (!match) return { status: null, body: errorMessage, resumen: errorMessage };

  const status = parseInt(match[1], 10);
  const rawBody = match[2].trim();

  let body: unknown = rawBody;
  try { body = JSON.parse(rawBody); } catch { /* texto plano */ }

  // Intentar extraer un mensaje legible del JSON de la DGII
  let resumen = rawBody;
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    resumen =
      (b['mensaje'] as string) ||
      (b['Mensaje'] as string) ||
      (b['message'] as string) ||
      (b['Message'] as string) ||
      (b['descripcion'] as string) ||
      (b['error'] as string) ||
      rawBody;
  }

  return { status, body, resumen };
}
