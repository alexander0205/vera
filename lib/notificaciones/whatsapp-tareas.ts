/**
 * Los avisos de las tareas por WhatsApp, con la plantilla aprobada por Meta
 * (ver ./plantilla-tarea-whatsapp.ts). Van a las mismas personas que el correo
 * y la campana, si guardaron su WhatsApp (`users.telefono`; si no lo tienen,
 * «Tareas» se lo pide).
 *
 * APAGADO por orden del dueño (31-10-2026): al aprobarla Meta empezaron a salir
 * solos, y llegaron a un número que no era el de la persona. Solo se enciende a
 * propósito, con `TAREAS_WHATSAPP_ACTIVO=1`, nunca porque Meta apruebe algo.
 *
 * Nunca lanza, y no manda nada si: está apagado, no es producción, falta la llave
 * de Zero, o Meta todavía no aprobó la plantilla (se pregunta al CRM y se recuerda
 * 10 minutos, para no preguntar en cada aviso).
 */

import 'server-only';
import { and, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { enviarPlantilla, listarPlantillas } from '@/lib/whatsapp/client';
import { aE164 } from '@/lib/whatsapp/telefono';
import { primerNombre } from '@/lib/administracion-escolar/tareas-reglas';
import { PLANTILLA_TAREA_WHATSAPP as P, parametrosTareaWhatsApp } from './plantilla-tarea-whatsapp';
import type { CambioTarea } from './texto';

export const whatsappDeTareasActivo = () => process.env.TAREAS_WHATSAPP_ACTIVO === '1';

let aprobada: { valor: boolean; hasta: number } | null = null;

async function plantillaAprobada(apiKey: string): Promise<boolean> {
  if (aprobada && aprobada.hasta > Date.now()) return aprobada.valor;
  let valor = false;
  try {
    const { templates } = await listarPlantillas(apiKey, P.nombre);
    valor = templates.some((t) => t.name === P.nombre && t.language.startsWith(P.idioma) && t.status === 'APPROVED');
  } catch (e) {
    console.error('[whatsapp tareas] no se pudo mirar la plantilla:', e instanceof Error ? e.message : e);
  }
  aprobada = { valor, hasta: Date.now() + 10 * 60_000 };
  return valor;
}

export async function avisarTareaPorWhatsApp(userIds: readonly number[], d: {
  colegio: string; cambio: CambioTarea; autor: string; titulo: string; url: string;
}): Promise<number> {
  try {
    if (userIds.length === 0 || !whatsappDeTareasActivo()) return 0;
    if (process.env.VERCEL_ENV !== 'production') {
      console.info('[whatsapp tareas] sin enviar (fuera de producción)', { a: userIds.length, cambio: d.cambio });
      return 0;
    }
    const apiKey = process.env.CRM_ZERO_API_KEY;
    if (!apiKey) return 0;
    if (!(await plantillaAprobada(apiKey))) {
      console.info('[whatsapp tareas] la plantilla aún no está aprobada por Meta:', P.nombre);
      return 0;
    }
    const personas = await db.select({ id: users.id, name: users.name, telefono: users.telefono })
      .from(users).where(and(inArray(users.id, [...userIds]), isNull(users.deletedAt)));
    let enviados = 0;
    for (const p of personas) {
      const tel = aE164(p.telefono);
      if (!tel) continue;
      try {
        await enviarPlantilla(apiKey, tel, {
          nombre: P.nombre, idioma: P.idioma,
          parametros: parametrosTareaWhatsApp({ ...d, nombre: primerNombre(p.name) }),
        });
        enviados += 1;
      } catch (e) {
        console.error('[whatsapp tareas] no salió a', p.id, e instanceof Error ? e.message : e);
      }
    }
    return enviados;
  } catch (e) {
    console.error('[whatsapp tareas]', e instanceof Error ? e.message : e);
    return 0;
  }
}
