/**
 * Guard de cuadre de caja — fuente única del bloqueo "sin turno no se opera".
 *
 * Si la empresa tiene el módulo de caja habilitado, ninguna operación que mueva
 * dinero o cree un comprobante puede ocurrir sin un turno ABIERTO del propio
 * usuario. La venta y sus pagos se atan al turno para la conciliación
 * efectivo↔comprobante del cierre; sin turno, el dinero entra sin cuadre.
 *
 * Dos motivos de bloqueo, con mensajes distintos a propósito — decirle "abre un
 * turno" a quien YA tiene uno abierto lo manda a buscar un botón que no existe:
 *   - CAJA_SIN_TURNO     → no tiene turno. Debe abrirlo.
 *   - CAJA_TURNO_VENCIDO → lo tiene, pero pasó del límite + gracia. Debe cerrarlo.
 *
 * NO hay excepción por rol: owner y admin también abren su turno. El turno es
 * por (teamId, usuarioId), así que el turno de otro cajero no habilita a nadie.
 *
 * Un turno en CIERRE_SOLICITADO NO sirve: ya se pidió el cierre y su esperado
 * está calculado, así que meterle una venta más lo descuadraría.
 *
 * Cerrar caja NO pasa por aquí (/api/caja/turnos/[id]/cierre), así que un turno
 * bloqueado siempre puede cerrarse — si no, sería un callejón sin salida.
 *
 * Fuera de alcance a propósito: el cron de facturas recurrentes y el import
 * masivo corren sin usuario, por lo que nunca tendrían turno; guardarlos
 * apagaría la facturación recurrente.
 */

import { db } from '@/lib/db/drizzle';
import { teams, type CajaTurno } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getTurnoAbierto, getMinutosAbierto } from './core';
import { calcularEstadoLimite } from './limite';

export const CAJA_SIN_TURNO = 'CAJA_SIN_TURNO';
export const CAJA_TURNO_VENCIDO = 'CAJA_TURNO_VENCIDO';

export type CodigoCajaBloqueo = typeof CAJA_SIN_TURNO | typeof CAJA_TURNO_VENCIDO;

export type TurnoGuardResult =
  /** Puede operar. `turno` es null si la empresa no usa el módulo de caja. */
  | { ok: true; turno: CajaTurno | null }
  | { ok: false; error: string; code: CodigoCajaBloqueo };

export interface ConfigCaja {
  cajaHabilitada: boolean;
  cajaLimiteHoras: number | null;
  cajaAvisoMinutos: number;
  cajaGraciaHoras: number | null;
}

/**
 * Extrae la config de caja de un row de `teams` ya cargado, para no repetir un
 * SELECT que el caller acaba de hacer.
 */
export function configCaja(team: {
  cajaHabilitada: boolean;
  cajaLimiteHoras: number | null;
  cajaAvisoMinutos: number;
  cajaGraciaHoras: number | null;
}): ConfigCaja {
  return {
    cajaHabilitada:   team.cajaHabilitada,
    cajaLimiteHoras:  team.cajaLimiteHoras,
    cajaAvisoMinutos: team.cajaAvisoMinutos,
    cajaGraciaHoras:  team.cajaGraciaHoras,
  };
}

/**
 * Exige un turno ABIERTO y no vencido cuando la empresa tiene caja habilitada.
 *
 * @param config Pásalo si ya cargaste el team, para evitar un SELECT.
 */
export async function requireTurnoAbierto(
  teamId: number,
  usuarioId: number,
  config?: ConfigCaja,
): Promise<TurnoGuardResult> {
  let cfg = config;
  if (!cfg) {
    const [t] = await db
      .select({
        cajaHabilitada:   teams.cajaHabilitada,
        cajaLimiteHoras:  teams.cajaLimiteHoras,
        cajaAvisoMinutos: teams.cajaAvisoMinutos,
        cajaGraciaHoras:  teams.cajaGraciaHoras,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    cfg = {
      cajaHabilitada:   t?.cajaHabilitada ?? false,
      cajaLimiteHoras:  t?.cajaLimiteHoras ?? null,
      cajaAvisoMinutos: t?.cajaAvisoMinutos ?? 60,
      cajaGraciaHoras:  t?.cajaGraciaHoras ?? null,
    };
  }

  // Caja general apagada: no se BLOQUEA nada. Pero el POS abre su turno aunque
  // este cuadre esté off (app/api/pos/turno) y su historial es por-turno: si la
  // venta no se atribuye al turno abierto del cajero, el recibo nunca aparece
  // ahí. Se adjunta el turno ABIERTO si lo hay —nunca uno en CIERRE_SOLICITADO,
  // que ya tiene su esperado calculado y una venta más lo descuadraría—. Sin
  // turno abierto se sigue igual que antes (null = facturación sin cuadre).
  if (!cfg.cajaHabilitada) {
    const abierto = await getTurnoAbierto(teamId, usuarioId);
    return { ok: true, turno: abierto?.estado === 'ABIERTO' ? abierto : null };
  }

  const turno = await getTurnoAbierto(teamId, usuarioId);
  if (!turno || turno.estado !== 'ABIERTO') {
    return {
      ok: false,
      code: CAJA_SIN_TURNO,
      error: turno?.estado === 'CIERRE_SOLICITADO'
        ? 'Tu turno de caja tiene un cierre solicitado. Espera la aprobación y abre un turno nuevo para seguir operando.'
        : 'Debes abrir un turno de caja antes de facturar o cobrar.',
    };
  }

  // Los minutos los calcula Postgres, no JS (ver nota de TZ en getMinutosAbierto).
  // Si por lo que sea no se pueden leer, se deja pasar: un fallo de lectura no
  // debe trancar a un cajero que quizá está dentro del límite.
  const minutosAbierto = await getMinutosAbierto(turno.id);
  if (minutosAbierto == null) return { ok: true, turno };

  const estado = calcularEstadoLimite(
    minutosAbierto,
    cfg.cajaLimiteHoras,
    cfg.cajaAvisoMinutos,
    cfg.cajaGraciaHoras,
  );
  if (estado.bloqueado) {
    return {
      ok: false,
      code: CAJA_TURNO_VENCIDO,
      error: `Tu turno de caja lleva ${estado.etiqueta} abierto y pasó del límite permitido. Cierra caja para poder seguir facturando y cobrando.`,
    };
  }

  return { ok: true, turno };
}
