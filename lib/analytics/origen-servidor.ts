/**
 * El lado del servidor de `lib/analytics/origen.ts`: al crear una empresa,
 * leer la cookie de la primera visita y dejar apuntado de dónde vino.
 *
 * Va en `audit_logs` (acción `REGISTRO_ORIGEN`) y no en una columna nueva: no
 * hace falta migración, ya es la bitácora de la empresa, y la pantalla
 * «Embudo» del admin la lee de ahí. `resource` lleva el canal ya clasificado
 * («Buscador», «Asistente de IA»…) para poder contar sin abrir el JSON.
 *
 * Se espera al INSERT a propósito (no es «dispara y olvida» como `logAudit`):
 * el alta termina en un `redirect` y, en Vercel, lo que queda pendiente cuando
 * sale la respuesta puede no terminar nunca. Si falla, se registra en consola
 * y el alta sigue: medir nunca puede impedir que alguien entre.
 */

import { cookies } from 'next/headers';
import { db } from '@/lib/db/drizzle';
import { auditLogs } from '@/lib/db/schema';
import { COOKIE_ORIGEN, canalDeOrigen, leerOrigen } from './origen';

export async function registrarOrigenDelAlta(args: {
  teamId: number;
  userId: number;
  actor: string;
  metodo: 'correo' | 'google';
}): Promise<void> {
  try {
    const jar = await cookies();
    const origen = leerOrigen(jar.get(COOKIE_ORIGEN)?.value);
    await db.insert(auditLogs).values({
      teamId: args.teamId,
      userId: args.userId,
      actor: args.actor,
      action: 'REGISTRO_ORIGEN',
      resource: canalDeOrigen(origen),
      metadata: JSON.stringify({ metodo: args.metodo, origen }),
    });
  } catch (e) {
    console.error('[origen] no se pudo apuntar de dónde vino el alta', e);
  }
}
