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
 * que la corrida siguiente lo reintente. El aviso con SMS de respaldo no se
 * suelta: se queda como fallido y la corrida siguiente lo manda por SMS
 * (`cargosConWhatsAppFallido`).
 *
 * «Hoy» es el día de RD. `enviado_at` es un timestamp sin zona guardado en UTC:
 * de 8 p. m. a medianoche su fecha tal cual ya es la de mañana.
 */

import 'server-only';
import { and, asc, eq, gte, isNotNull, ne, or, isNull, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarAvisosEnviados, adminEscolarCargos, adminEscolarConceptosPago } from '@/lib/db/schema';
import { historialMensajes } from '@/lib/whatsapp/client';
import { resolverRemitente } from '@/lib/whatsapp/config';
import { aE164 } from '@/lib/whatsapp/telefono';
import { fechaRD, hoyRD } from '@/lib/utils/format';
import { canalesDelColegio } from './canales';
import { AVISOS_CON_SMS_DE_RESPALDO, type Aviso } from './ciclo-cobro';

/**
 * Los que ya no van a cambiar: no hace falta volver a preguntar. «Entregado» no
 * es uno: lo leen después, y si se dejara de mirar se quedaría así para siempre.
 */
export const ACUSES_FINALES = ['leido', 'fallido'];

/** Cuántos días después de enviado se sigue preguntando si lo leyeron. */
const DIAS_DE_ACUSE = 7;

/** Teléfonos por colegio y corrida: el CRM corta a 60 peticiones por minuto. */
const TOPE_TELEFONOS = 40;

/** Filas de WhatsApp a las que aún les falta el acuse definitivo. */
const faltaAcuse = (desde: Date) => and(
  eq(adminEscolarAvisosEnviados.canal, 'whatsapp'),
  isNotNull(adminEscolarAvisosEnviados.mensajeId),
  gte(adminEscolarAvisosEnviados.enviadoAt, desde),
  or(
    isNull(adminEscolarAvisosEnviados.estadoEntrega),
    and(...ACUSES_FINALES.map((e) => ne(adminEscolarAvisosEnviados.estadoEntrega, e))),
  ),
);

const hace = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

export interface ResultadoReconciliacion {
  revisados: number;
  entregados: number;
  fallidos: number;
  /** Reservas soltadas: se reintentarán en la corrida siguiente. */
  reintentables: number;
  /** Los motivos reales de Meta, agrupados. Es lo que hay que leer. */
  errores: { motivo: string; cuantos: number }[];
}

/** De estos avisos que fallaron, los que el colegio y el concepto dejan pasar a SMS. */
async function conSmsDeRespaldo(
  teamId: number,
  avisos: { id: number; tipo: string; cargoId: number | null }[],
): Promise<Set<number>> {
  const candidatos = avisos.filter((a) => a.cargoId != null && AVISOS_CON_SMS_DE_RESPALDO.includes(a.tipo as Aviso));
  if (candidatos.length === 0 || !(await canalesDelColegio(teamId)).sms) return new Set();
  const conSms = await db
    .select({ id: adminEscolarCargos.id })
    .from(adminEscolarCargos)
    .innerJoin(adminEscolarConceptosPago, eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id))
    .where(and(
      inArray(adminEscolarCargos.id, candidatos.map((a) => a.cargoId!)),
      eq(adminEscolarConceptosPago.avisoSms, true),
    ));
  const cargos = new Set(conSms.map((c) => c.id));
  return new Set(candidatos.filter((a) => cargos.has(a.cargoId!)).map((a) => a.id));
}

/** Los colegios con algún WhatsApp al que aún le falta saber si lo leyeron. */
export async function colegiosConAcusesPendientes(): Promise<number[]> {
  const filas = await db
    .selectDistinct({ teamId: adminEscolarAvisosEnviados.teamId })
    .from(adminEscolarAvisosEnviados)
    .where(faltaAcuse(hace(DIAS_DE_ACUSE)));
  return filas.map((f) => f.teamId);
}

/**
 * Los cobros cuyo WhatsApp de hoy Meta dijo que no llegó y aún le toca el SMS.
 * `hoy` es la fecha de RD (`hoyRD`).
 */
export async function cargosConWhatsAppFallido(teamId: number, hoy: string): Promise<Set<number>> {
  const filas = await db
    .select({ cargoId: adminEscolarAvisosEnviados.cargoId })
    .from(adminEscolarAvisosEnviados)
    .where(and(
      eq(adminEscolarAvisosEnviados.teamId, teamId),
      eq(adminEscolarAvisosEnviados.canal, 'whatsapp'),
      eq(adminEscolarAvisosEnviados.estadoEntrega, 'fallido'),
      inArray(adminEscolarAvisosEnviados.tipo, [...AVISOS_CON_SMS_DE_RESPALDO]),
      sql`(${adminEscolarAvisosEnviados.enviadoAt} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Santo_Domingo')::date = ${hoy}::date`,
    ));
  return new Set(filas.flatMap((f) => (f.cargoId == null ? [] : [f.cargoId])));
}

/**
 * Pregunta por los avisos de WhatsApp de los últimos días que aún no tienen
 * acuse definitivo.
 *
 * Se agrupa por teléfono porque el API del CRM devuelve el historial de un
 * número entero: pedir uno por aviso serían veinte llamadas para la misma
 * familia, y el CRM corta a 60 por minuto. De ese historial solo se lee el
 * estado de NUESTROS mensajes: lo que escribe la familia no se mira ni se guarda.
 *
 * `soltar: false` no suelta lo que falló: es para revisar después de la última
 * corrida del día, cuando ya nadie lo reintentaría y la fila se perdería.
 */
export async function reconciliarEntregas(
  teamId: number,
  { dias = DIAS_DE_ACUSE, soltar = true, topeTelefonos = TOPE_TELEFONOS, pausaMs = 0 }: {
    dias?: number; soltar?: boolean; topeTelefonos?: number; pausaMs?: number;
  } = {},
): Promise<ResultadoReconciliacion> {
  const vacio: ResultadoReconciliacion = {
    revisados: 0, entregados: 0, fallidos: 0, reintentables: 0, errores: [],
  };

  const remitente = await resolverRemitente(teamId);
  if (!remitente) return vacio;

  const pendientes = await db
    .select({
      id:        adminEscolarAvisosEnviados.id,
      tipo:      adminEscolarAvisosEnviados.tipo,
      cargoId:   adminEscolarAvisosEnviados.cargoId,
      mensajeId: adminEscolarAvisosEnviados.mensajeId,
      destino:   adminEscolarAvisosEnviados.destino,
      enviadoAt: adminEscolarAvisosEnviados.enviadoAt,
    })
    .from(adminEscolarAvisosEnviados)
    .where(and(eq(adminEscolarAvisosEnviados.teamId, teamId), faltaAcuse(hace(dias))))
    // Primero los que llevan más tiempo sin mirar: con el tope, a todos les toca.
    .orderBy(sql`${adminEscolarAvisosEnviados.revisadoAt} asc nulls first`, asc(adminEscolarAvisosEnviados.id));

  if (pendientes.length === 0) return vacio;

  // Un viaje por teléfono, no por aviso.
  const porTelefono = new Map<string, typeof pendientes>();
  for (const p of pendientes) {
    const tel = aE164(p.destino);
    if (!tel) continue;
    if (!porTelefono.has(tel) && porTelefono.size >= topeTelefonos) continue;
    porTelefono.set(tel, [...(porTelefono.get(tel) ?? []), p]);
  }

  const hoy = hoyRD();
  const errores = new Map<string, number>();
  const fallaronHoy: typeof pendientes = [];
  let revisados = 0, entregados = 0, fallidos = 0;

  let vuelta = 0;
  for (const [telefono, avisos] of porTelefono) {
    if (vuelta++ > 0 && pausaMs > 0) await new Promise((r) => setTimeout(r, pausaMs));
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
        if (fechaRD(a.enviadoAt) === hoy) fallaronHoy.push(a);
      } else if (m.deliveryStatus === 'entregado' || m.deliveryStatus === 'leido') {
        entregados++;
      }
    }
  }

  // Reintentar el WhatsApp de un número que no lo tiene no lo arregla: si hay
  // SMS de respaldo, la fila se queda y `cargosConWhatsAppFallido` lo manda por ahí.
  const paraSms = soltar ? await conSmsDeRespaldo(teamId, fallaronHoy) : new Set<number>();
  const aSoltar = soltar ? fallaronHoy.filter((a) => !paraSms.has(a.id)).map((a) => a.id) : [];
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
