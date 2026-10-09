import 'server-only';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';

/**
 * Que un fallo inesperado NO salga como un 500 con el cuerpo vacío.
 *
 * Cuando una ruta lanza y nadie la atrapa, Next responde 500 sin cuerpo. El
 * cliente hace `r.json()`, revienta al parsear la nada, y acaba enseñando el
 * mensaje que tuviera preparado para el caso corriente. Pasó de verdad: la
 * hoja del cuadre de caja decía «No autorizado o turno no encontrado» —que es
 * lo que dice cuando la respuesta no es `ok`— mientras la causa real era una
 * columna que faltaba en la base. Quien lo leyó se fue a revisar permisos
 * durante un rato por un problema que no era de permisos.
 *
 * Dos reglas aquí:
 *
 * 1. El detalle del error se GUARDA (`system_logs`), no se devuelve. Un
 *    «column "x" does not exist» es exactamente lo que hace falta para
 *    arreglarlo, y exactamente lo que no se le enseña a un navegador.
 * 2. Lo que se devuelve dice DE QUÉ pantalla es el fallo y que es del
 *    servidor. No hace falta más para que nadie se vaya a buscar la causa
 *    donde no está.
 *
 * Solo cubre lo INESPERADO. Los errores previstos —404, 403, 409— se
 * devuelven como siempre desde dentro del handler, con su código y su
 * explicación.
 */
export async function conErrorJson(
  /** De dónde salió, tal cual la ruta. Es lo que se busca luego en los logs. */
  source: string,
  /** Lo que ve el usuario. Sin jerga y sin culpar a su sesión. */
  mensaje: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (e: unknown) {
    await logError({
      source,
      message: mensaje,
      details: e instanceof Error
        ? { error: e.message, stack: e.stack }
        : { error: String(e) },
    });
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
