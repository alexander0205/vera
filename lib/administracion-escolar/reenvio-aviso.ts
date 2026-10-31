import { and, eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarAvisosEnviados } from '@/lib/db/schema';

/**
 * El rastro de un reenvío manual del aviso de un cargo.
 *
 * El reenvío a mano se anotaba con `offset_dias = -1`, y el índice único de la
 * tabla de idempotencia es `(cargo, tipo, offset, canal)`: el segundo reenvío del
 * mismo cargo chocaba con el primero y `onConflictDoNothing` lo descartaba sin
 * decir nada. El mensaje SALÍA, pero no quedaba ni la fila de historial, ni la
 * cuenta en la cuota mensual de WhatsApp (que se factura), ni —peor— la marca
 * de «ya se le avisó hoy» que usa el tope de 24 horas: desde el segundo reenvío
 * el botón dejaba de acordarse de sí mismo y se podía pulsar cada minuto.
 *
 * Cada reenvío necesita su propia clave dentro del índice, así que usa un offset
 * propio: -1 el primero, -2 el segundo, y así. Los del cron usan 0 o un número
 * positivo, de modo que no chocan nunca con ellos, y los paneles los siguen
 * distinguiendo por ser negativos.
 */

/** El offset que le toca al siguiente reenvío, dados los que ya tiene el cargo. */
export function siguienteOffsetReenvio(yaUsados: readonly number[]): number {
  const menor = yaUsados.reduce((m, o) => (o < m ? o : m), 0);
  return menor - 1;
}

/** Cuántas veces se reintenta si dos reenvíos eligen el mismo offset a la vez. */
const INTENTOS = 5;

/**
 * Anota un reenvío manual, con su id de mensaje para que la reconciliación de
 * entregas lo revise igual que a los automáticos. Un reenvío a mano que falla
 * en silencio es exactamente el problema que ese botón viene a resolver.
 *
 * Nunca lanza: el WhatsApp YA salió, y devolverle un error a quien acaba de
 * mandarlo —para que lo mande otra vez— es peor que perder la constancia.
 * Devuelve si quedó anotado.
 */
export async function registrarReenvioAviso(opts: {
  teamId: number;
  cargoId: number;
  destino: string;
  mensajeId: string | null;
  texto?: string | null;
  conEnlace?: boolean;
}): Promise<boolean> {
  try {
    for (let intento = 0; intento < INTENTOS; intento++) {
      const previos = await db
        .select({ offsetDias: adminEscolarAvisosEnviados.offsetDias })
        .from(adminEscolarAvisosEnviados)
        .where(and(
          eq(adminEscolarAvisosEnviados.cargoId, opts.cargoId),
          eq(adminEscolarAvisosEnviados.tipo, 'al-vencer'),
          eq(adminEscolarAvisosEnviados.canal, 'whatsapp'),
          lt(adminEscolarAvisosEnviados.offsetDias, 0),
        ));

      const filas = await db.insert(adminEscolarAvisosEnviados).values({
        teamId: opts.teamId,
        cargoId: opts.cargoId,
        tipo: 'al-vencer',
        offsetDias: siguienteOffsetReenvio(previos.map((p) => p.offsetDias)),
        canal: 'whatsapp',
        destino: opts.destino,
        mensajeId: opts.mensajeId,
        texto: opts.texto ?? null,
        conEnlace: opts.conEnlace ?? null,
      }).onConflictDoNothing().returning({ id: adminEscolarAvisosEnviados.id });

      // Si chocó, otro reenvío tomó ese número justo ahora: se vuelve a mirar.
      if (filas.length > 0) return true;
    }
  } catch (err) {
    console.error('[reenviar-aviso] el mensaje salió pero no se pudo anotar:', err);
    return false;
  }
  console.error('[reenviar-aviso] el mensaje salió pero no se encontró un hueco para anotarlo');
  return false;
}
