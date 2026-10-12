/**
 * Si el aviso llegó de verdad.
 *
 * El CRM devuelve 201 con un id cuando Meta ACEPTA la petición. Eso no es
 * entrega. El 2026-08-17 cuatro avisos devolvieron `ok:true` y los cuatro
 * fallaron después con `131042 Business eligibility payment issue` — la WABA no
 * tenía método de pago. Nadie recibió nada.
 *
 * Y como `admin_escolar_avisos_enviados` es la tabla de idempotencia, esos
 * cuatro quedaron marcados como enviados: el cron no los reintenta porque su
 * índice único dice que ya salieron. El colegio cree que avisó y el padre nunca
 * supo. Un fallo que nadie ve es peor que uno ruidoso.
 *
 * Esto vuelve a preguntar por el acuse y, si falló HOY, suelta la reserva para
 * que la corrida siguiente lo reintente.
 */

import 'server-only';
import { and, eq, gte, isNotNull, ne, or, isNull, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarAvisosEnviados } from '@/lib/db/schema';
import { historialMensajes } from '@/lib/whatsapp/client';
import { resolverRemitente } from '@/lib/whatsapp/config';
import { aE164 } from '@/lib/whatsapp/telefono';

/** Los que ya no van a cambiar: no hace falta volver a preguntar. */
const FINALES = ['entregado', 'leido'];

export interface ResultadoReconciliacion {
  revisados: number;
  entregados: number;
  fallidos: number;
  /** Reservas soltadas: se reintentarán en la corrida siguiente. */
  reintentables: number;
  /** Los motivos reales de Meta, agrupados. Es lo que hay que leer. */
  errores: { motivo: string; cuantos: number }[];
}

function hoyISO(): string {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santo_Domingo' }))
    .toISOString().slice(0, 10);
}

/**
 * Pregunta por los avisos de WhatsApp de los últimos días que aún no tienen
 * acuse definitivo.
 *
 * Se agrupa por teléfono porque el API del CRM devuelve el historial de un
 * número entero: pedir uno por aviso serían veinte llamadas para la misma
 * familia, y el CRM corta a 60 por minuto.
 */
export async function reconciliarEntregas(
  teamId: number, dias = 3,
): Promise<ResultadoReconciliacion> {
  const vacio: ResultadoReconciliacion = {
    revisados: 0, entregados: 0, fallidos: 0, reintentables: 0, errores: [],
  };

  const remitente = await resolverRemitente(teamId);
  if (!remitente) return vacio;

  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const pendientes = await db
    .select({
      id:        adminEscolarAvisosEnviados.id,
      mensajeId: adminEscolarAvisosEnviados.mensajeId,
      destino:   adminEscolarAvisosEnviados.destino,
      enviadoAt: adminEscolarAvisosEnviados.enviadoAt,
    })
    .from(adminEscolarAvisosEnviados)
    .where(and(
      eq(adminEscolarAvisosEnviados.teamId, teamId),
      eq(adminEscolarAvisosEnviados.canal, 'whatsapp'),
      isNotNull(adminEscolarAvisosEnviados.mensajeId),
      gte(adminEscolarAvisosEnviados.enviadoAt, desde),
      or(
        isNull(adminEscolarAvisosEnviados.estadoEntrega),
        and(...FINALES.map((e) => ne(adminEscolarAvisosEnviados.estadoEntrega, e))),
      ),
    ));

  if (pendientes.length === 0) return vacio;

  // Un viaje por teléfono, no por aviso.
  const porTelefono = new Map<string, typeof pendientes>();
  for (const p of pendientes) {
    const tel = aE164(p.destino);
    if (!tel) continue;
    porTelefono.set(tel, [...(porTelefono.get(tel) ?? []), p]);
  }

  const hoy = hoyISO();
  const errores = new Map<string, number>();
  const aSoltar: number[] = [];
  let revisados = 0, entregados = 0, fallidos = 0;

  for (const [telefono, avisos] of porTelefono) {
    let historial;
    try {
      historial = await historialMensajes(remitente.apiKey, telefono);
    } catch (e) {
      // Un teléfono que no se puede consultar no invalida los demás.
      console.error('[entregas] no se pudo leer el historial de', telefono, e);
      continue;
    }
    const porId = new Map(historial.messages.map((m) => [m.id, m]));

    for (const a of avisos) {
      const m = porId.get(a.mensajeId!);
      if (!m?.deliveryStatus) continue;
      revisados++;

      await db.update(adminEscolarAvisosEnviados)
        .set({
          estadoEntrega: m.deliveryStatus,
          errorEntrega: m.errorDelivery,
          revisadoAt: new Date(),
        })
        .where(eq(adminEscolarAvisosEnviados.id, a.id));

      if (m.deliveryStatus === 'fallido') {
        fallidos++;
        const motivo = (m.errorDelivery ?? 'sin motivo').slice(0, 120);
        errores.set(motivo, (errores.get(motivo) ?? 0) + 1);

        // Solo se suelta lo de HOY. Un aviso es de un día concreto —«cinco días
        // antes del recargo» solo es hoy una vez—, así que reintentar el de
        // anteayer mandaría un mensaje que ya no es verdad. Lo viejo se queda
        // anotado para que se vea en el health, pero no vuelve a salir.
        if (a.enviadoAt.toISOString().slice(0, 10) === hoy) aSoltar.push(a.id);
      } else if (FINALES.includes(m.deliveryStatus)) {
        entregados++;
      }
    }
  }

  if (aSoltar.length > 0) {
    await db.delete(adminEscolarAvisosEnviados)
      .where(inArray(adminEscolarAvisosEnviados.id, aSoltar));
  }

  return {
    revisados, entregados, fallidos, reintentables: aSoltar.length,
    errores: [...errores.entries()]
      .map(([motivo, cuantos]) => ({ motivo, cuantos }))
      .sort((a, b) => b.cuantos - a.cuantos),
  };
}
