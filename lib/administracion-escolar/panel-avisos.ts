/**
 * Lo que el colegio ve de sus recordatorios: qué sale hoy, qué ya salió y a
 * quién NO le va a llegar.
 *
 * Hasta ahora esto solo existía dentro del cron y terminaba en un
 * `console.warn` que nadie lee. El resultado era el peor de los silencios: la
 * secretaria daba por hecho que se estaba avisando mientras a tres familias no
 * les llegaba nada porque su contacto no tiene correo ni celular.
 *
 * El bloque que importa es `problemas`. Los otros dos tranquilizan; ese es el
 * único que pide hacer algo, y por eso se calcula en vivo —no de una tabla de
 * errores— : en cuanto alguien le pone el correo al padre, desaparece solo.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarAvisosEnviados, adminEscolarCargos, adminEscolarConceptosPago,
  adminEscolarEstudiantes,
} from '@/lib/db/schema';
import { avisosDeHoy, candidatos, destinoDelCanal } from './avisos';
import { canalesDelColegio, type CanalesActivos } from './canales';
import type { Aviso, Canal } from './ciclo-cobro';

export const CANALES: readonly Canal[] = ['correo', 'whatsapp', 'sms'];

/** Un mensaje del plan de hoy, ya sepa que salió o que no puede salir. */
export interface LineaPanel {
  cargoId: number;
  estudianteId: number;
  estudiante: string;
  responsable: string | null;
  /** El contacto que hay que corregir cuando falta un dato. */
  clientId: number | null;
  concepto: string;
  montoCentavos: number;
  aviso: Aviso;
  canal: Canal;
  /** A dónde va (o iría). Nulo cuando ese dato no existe. */
  destino: string | null;
  /** Por qué no puede salir. Nulo si sí puede. */
  motivo: string | null;
  enviadoAt: string | null;
}

export interface ResumenAvisos {
  hoy: string;
  /** Si NO está, se calcula todo pero no sale nada. Es lo primero que hay que ver. */
  envioReal: boolean;
  canales: CanalesActivos;
  /** Del plan de hoy: cuántos por canal, ya salidos y por salir. */
  porCanal: Record<Canal, { enviados: number; porSalir: number; bloqueados: number }>;
  totales: { enviados: number; porSalir: number; bloqueados: number };
  /** La hora del último mensaje que salió hoy. */
  ultimaSalida: string | null;
  /** A quién no le va a llegar y por qué. Lo único accionable de la pantalla. */
  problemas: LineaPanel[];
  /** Lo que está calculado para hoy y todavía no ha salido. */
  porSalir: LineaPanel[];
}

const FALTA_TEXTO: Record<Canal, string> = {
  correo: 'sin correo',
  whatsapp: 'sin WhatsApp ni celular',
  sms: 'sin celular',
};

/** ¿Se manda de verdad, o se está calculando en seco? */
export function envioRealActivo(): boolean {
  return process.env.ESCOLAR_AVISOS_ACTIVOS === '1';
}

export async function resumenDeAvisos(teamId: number, hoy: string): Promise<ResumenAvisos> {
  const canales = await canalesDelColegio(teamId);
  const filas = await candidatos(teamId);
  const pendientes = filas.flatMap((f) => avisosDeHoy(f, hoy, canales));

  // Lo ya enviado, de una sola consulta: preguntarlo por línea serían cientos
  // de viajes para pintar una tabla.
  const cargoIds = [...new Set(pendientes.map((p) => p.fila.cargoId))];
  const yaSalio = new Map<string, Date>();
  if (cargoIds.length > 0) {
    const previos = await db
      .select({
        cargoId: adminEscolarAvisosEnviados.cargoId,
        tipo: adminEscolarAvisosEnviados.tipo,
        offsetDias: adminEscolarAvisosEnviados.offsetDias,
        canal: adminEscolarAvisosEnviados.canal,
        enviadoAt: adminEscolarAvisosEnviados.enviadoAt,
      })
      .from(adminEscolarAvisosEnviados)
      .where(inArray(adminEscolarAvisosEnviados.cargoId, cargoIds));
    for (const x of previos) {
      yaSalio.set(`${x.cargoId}:${x.tipo}:${x.offsetDias}:${x.canal}`, x.enviadoAt);
    }
  }

  const porCanal = {
    correo: { enviados: 0, porSalir: 0, bloqueados: 0 },
    whatsapp: { enviados: 0, porSalir: 0, bloqueados: 0 },
    sms: { enviados: 0, porSalir: 0, bloqueados: 0 },
  } satisfies ResumenAvisos['porCanal'];

  const problemas: LineaPanel[] = [];
  const porSalir: LineaPanel[] = [];
  let ultima: Date | null = null;

  for (const p of pendientes) {
    for (const canal of p.canales) {
      const destino = destinoDelCanal(p.fila, canal);
      const enviado = yaSalio.get(`${p.fila.cargoId}:${p.aviso}:${p.offsetDias}:${canal}`) ?? null;

      const linea: LineaPanel = {
        cargoId: p.fila.cargoId,
        estudianteId: p.fila.estudianteId,
        estudiante: p.fila.estudiante,
        responsable: p.fila.destinatario,
        clientId: p.fila.clientId,
        concepto: p.fila.concepto,
        montoCentavos: p.fila.saldoCentavos,
        aviso: p.aviso,
        canal,
        destino,
        motivo: null,
        enviadoAt: enviado ? enviado.toISOString() : null,
      };

      if (enviado) {
        porCanal[canal].enviados++;
        if (!ultima || enviado > ultima) ultima = enviado;
        continue;
      }
      if (!destino) {
        // Sin responsable asignado el problema es otro y se dice distinto: no
        // es que al padre le falte el correo, es que no hay padre a quien
        // escribirle.
        linea.motivo = p.fila.clientId
          ? `El responsable de pago está ${FALTA_TEXTO[canal]}`
          : 'El alumno no tiene responsable de pago asignado';
        porCanal[canal].bloqueados++;
        problemas.push(linea);
        continue;
      }
      porCanal[canal].porSalir++;
      porSalir.push(linea);
    }
  }

  const suma = (k: 'enviados' | 'porSalir' | 'bloqueados') =>
    CANALES.reduce((n, c) => n + porCanal[c][k], 0);

  return {
    hoy,
    envioReal: envioRealActivo(),
    canales,
    porCanal,
    totales: { enviados: suma('enviados'), porSalir: suma('porSalir'), bloqueados: suma('bloqueados') },
    ultimaSalida: ultima ? (ultima as Date).toISOString() : null,
    problemas,
    porSalir,
  };
}

export interface FilaHistorial {
  id: number;
  enviadoAt: string;
  canal: string;
  tipo: string;
  destino: string | null;
  estudiante: string;
  estudianteId: number;
  concepto: string | null;
}

/**
 * Lo que ya salió, lo más reciente primero.
 *
 * Es la constancia del colegio cuando una familia dice que no le avisaron: el
 * día, la hora y a qué número fue. Por eso guarda el destino tal como estaba
 * ese día y no se lee del contacto — el teléfono de hoy puede ser otro.
 */
export async function historialDeAvisos(
  teamId: number,
  opts: { limit?: number; offset?: number; canal?: string } = {},
): Promise<{ filas: FilaHistorial[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const donde = opts.canal
    ? and(eq(adminEscolarAvisosEnviados.teamId, teamId), eq(adminEscolarAvisosEnviados.canal, opts.canal))
    : eq(adminEscolarAvisosEnviados.teamId, teamId);

  const [filas, [conteo]] = await Promise.all([
    db
      .select({
        id: adminEscolarAvisosEnviados.id,
        enviadoAt: adminEscolarAvisosEnviados.enviadoAt,
        canal: adminEscolarAvisosEnviados.canal,
        tipo: adminEscolarAvisosEnviados.tipo,
        destino: adminEscolarAvisosEnviados.destino,
        estudianteId: adminEscolarCargos.estudianteId,
        nombres: adminEscolarEstudiantes.nombres,
        apellidos: adminEscolarEstudiantes.apellidos,
        concepto: adminEscolarConceptosPago.nombre,
      })
      .from(adminEscolarAvisosEnviados)
      .innerJoin(adminEscolarCargos, eq(adminEscolarAvisosEnviados.cargoId, adminEscolarCargos.id))
      .innerJoin(adminEscolarEstudiantes, eq(adminEscolarCargos.estudianteId, adminEscolarEstudiantes.id))
      .leftJoin(adminEscolarConceptosPago, eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id))
      .where(donde)
      .orderBy(desc(adminEscolarAvisosEnviados.enviadoAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(adminEscolarAvisosEnviados)
      .where(donde),
  ]);

  return {
    filas: filas.map((f) => ({
      id: f.id,
      enviadoAt: f.enviadoAt.toISOString(),
      canal: f.canal,
      tipo: f.tipo,
      destino: f.destino,
      estudianteId: f.estudianteId,
      estudiante: `${f.nombres} ${f.apellidos ?? ''}`.trim(),
      concepto: f.concepto,
    })),
    total: conteo?.n ?? 0,
  };
}
