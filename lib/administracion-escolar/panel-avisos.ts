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

import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarAvisosEnviados, adminEscolarCargos, adminEscolarConceptosPago,
  adminEscolarEstudiantes, adminEscolarMatriculas,
} from '@/lib/db/schema';
import { entregaDe, type Entrega } from './avisos-etiquetas';
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
  whatsapp: 'sin WhatsApp',
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
  /** «Enviado en un solo mensaje con 2 cobro(s) más», «Acta de nacimiento». */
  detalle: string | null;
  /** Las filas con el mismo grupo viajaron en UN mensaje. */
  grupo: string | null;
  entrega: Entrega;
  /** El motivo de Meta cuando el WhatsApp falló. */
  errorEntrega: string | null;
  estudiante: string;
  estudianteId: number | null;
  concepto: string | null;
  /** El monto de la cuota avisada; nulo en los avisos del expediente. */
  montoCentavos: number | null;
  vence: string | null;
  /** Si llevaba enlace; `null` = aviso anterior a saberlo. */
  conEnlace: boolean | null;
  /** La primera vez que abrieron el enlace. */
  abiertoAt: string | null;
  aperturas: number;
}

/** Más que esto no se pinta de una vez: con un rango más corto se ve todo. */
export const TOPE_HISTORIAL = 5000;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lo que ya salió en un rango de días (de República Dominicana), lo más
 * reciente primero.
 *
 * Es la constancia del colegio cuando una familia dice que no le avisaron: el
 * día, la hora, a qué número fue y si WhatsApp dijo que llegó. Por eso guarda
 * el destino tal como estaba ese día y no se lee del contacto — el teléfono de
 * hoy puede ser otro.
 *
 * Trae el rango entero (hasta `TOPE_HISTORIAL`) y no una página: la pantalla
 * filtra, ordena, cuenta y exporta sobre todo lo del rango, que es lo que pide
 * analizarlo. Los avisos del expediente no tienen cuota: el alumno sale de la
 * matrícula.
 */
export async function historialDeAvisos(
  teamId: number,
  opts: { desde?: string | null; hasta?: string | null } = {},
): Promise<{ filas: FilaHistorial[]; total: number; truncado: boolean }> {
  const env = adminEscolarAvisosEnviados.enviadoAt;
  // `enviado_at` se guarda en UTC sin zona; el rango viene en días de RD.
  const condiciones = [
    eq(adminEscolarAvisosEnviados.teamId, teamId),
    opts.desde && FECHA.test(opts.desde)
      ? gte(env, sql`(${opts.desde}::date::timestamp at time zone 'America/Santo_Domingo') at time zone 'UTC'`)
      : undefined,
    opts.hasta && FECHA.test(opts.hasta)
      ? lt(env, sql`((${opts.hasta}::date + 1)::timestamp at time zone 'America/Santo_Domingo') at time zone 'UTC'`)
      : undefined,
  ];
  const donde = and(...condiciones);
  const estudianteId = sql<number | null>`coalesce(${adminEscolarCargos.estudianteId}, ${adminEscolarMatriculas.estudianteId})`;

  const [filas, [conteo]] = await Promise.all([
    db
      .select({
        id: adminEscolarAvisosEnviados.id,
        enviadoAt: env,
        canal: adminEscolarAvisosEnviados.canal,
        tipo: adminEscolarAvisosEnviados.tipo,
        destino: adminEscolarAvisosEnviados.destino,
        detalle: adminEscolarAvisosEnviados.detalle,
        grupo: adminEscolarAvisosEnviados.grupo,
        estadoEntrega: adminEscolarAvisosEnviados.estadoEntrega,
        errorEntrega: adminEscolarAvisosEnviados.errorEntrega,
        conEnlace: adminEscolarAvisosEnviados.conEnlace,
        abiertoAt: adminEscolarAvisosEnviados.abiertoAt,
        aperturas: adminEscolarAvisosEnviados.aperturas,
        estudianteId,
        nombres: adminEscolarEstudiantes.nombres,
        apellidos: adminEscolarEstudiantes.apellidos,
        concepto: adminEscolarConceptosPago.nombre,
        montoCentavos: adminEscolarCargos.montoCentavos,
        vence: adminEscolarCargos.fechaVencimiento,
      })
      .from(adminEscolarAvisosEnviados)
      .leftJoin(adminEscolarCargos, eq(adminEscolarAvisosEnviados.cargoId, adminEscolarCargos.id))
      .leftJoin(adminEscolarMatriculas, eq(adminEscolarAvisosEnviados.matriculaId, adminEscolarMatriculas.id))
      .leftJoin(adminEscolarEstudiantes, eq(adminEscolarEstudiantes.id, estudianteId))
      .leftJoin(adminEscolarConceptosPago, eq(adminEscolarCargos.conceptoId, adminEscolarConceptosPago.id))
      .where(donde)
      .orderBy(desc(env), desc(adminEscolarAvisosEnviados.id))
      .limit(TOPE_HISTORIAL),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(adminEscolarAvisosEnviados)
      .where(donde),
  ]);

  const total = conteo?.n ?? 0;
  return {
    filas: filas.map((f) => ({
      id: f.id,
      enviadoAt: f.enviadoAt.toISOString(),
      canal: f.canal,
      tipo: f.tipo,
      destino: f.destino,
      detalle: f.detalle,
      grupo: f.grupo,
      entrega: entregaDe(f.estadoEntrega),
      errorEntrega: f.errorEntrega,
      estudianteId: f.estudianteId == null ? null : Number(f.estudianteId),
      estudiante: f.nombres ? `${f.nombres} ${f.apellidos ?? ''}`.trim() : 'Alumno eliminado',
      concepto: f.concepto,
      montoCentavos: f.montoCentavos,
      vence: f.vence,
      conEnlace: f.conEnlace,
      abiertoAt: f.abiertoAt ? f.abiertoAt.toISOString() : null,
      aperturas: f.aperturas,
    })),
    total,
    truncado: total > TOPE_HISTORIAL,
  };
}

/** Lo que decía un aviso. Aparte del historial: son miles de filas y se lee de una en una. */
export async function textoDeAviso(teamId: number, id: number): Promise<{ texto: string | null } | null> {
  const [fila] = await db
    .select({ texto: adminEscolarAvisosEnviados.texto })
    .from(adminEscolarAvisosEnviados)
    .where(and(eq(adminEscolarAvisosEnviados.id, id), eq(adminEscolarAvisosEnviados.teamId, teamId)))
    .limit(1);
  return fila ?? null;
}
