/**
 * Qué canales de aviso tiene encendidos un colegio.
 *
 * Es el interruptor de arriba del todo: los conceptos deciden qué se avisa y
 * por dónde, pero si el canal está apagado aquí no sale nada por él, tenga el
 * concepto lo que tenga. Al revés no funciona — para callar el correo un mes
 * había que entrar concepto por concepto.
 *
 * Los tres nacen encendidos, y la ausencia de fila significa exactamente eso.
 * Así ningún colegio de los que ya existen cambia de comportamiento por haber
 * creado la tabla.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCanales } from '@/lib/db/schema';
import type { Canal } from './ciclo-cobro';

export interface CanalesActivos {
  correo: boolean;
  whatsapp: boolean;
  sms: boolean;
}

export const CANALES_TODOS_ACTIVOS: CanalesActivos = { correo: true, whatsapp: true, sms: true };

export async function canalesDelColegio(teamId: number): Promise<CanalesActivos> {
  const [fila] = await db
    .select({
      correo: adminEscolarCanales.correoActivo,
      whatsapp: adminEscolarCanales.whatsappActivo,
      sms: adminEscolarCanales.smsActivo,
    })
    .from(adminEscolarCanales)
    .where(eq(adminEscolarCanales.teamId, teamId))
    .limit(1);

  return fila ?? CANALES_TODOS_ACTIVOS;
}

/** Guarda los tres de una vez. Crea la fila la primera vez que se apaga algo. */
export async function guardarCanales(teamId: number, canales: CanalesActivos): Promise<void> {
  await db
    .insert(adminEscolarCanales)
    .values({
      teamId,
      correoActivo: canales.correo,
      whatsappActivo: canales.whatsapp,
      smsActivo: canales.sms,
    })
    .onConflictDoUpdate({
      target: adminEscolarCanales.teamId,
      set: {
        correoActivo: canales.correo,
        whatsappActivo: canales.whatsapp,
        smsActivo: canales.sms,
        updatedAt: new Date(),
      },
    });
}

/** El canal apagado no existe para el despacho de hoy. */
export function canalEncendido(canal: Canal, activos: CanalesActivos): boolean {
  if (canal === 'correo') return activos.correo;
  if (canal === 'whatsapp') return activos.whatsapp;
  return activos.sms;
}
