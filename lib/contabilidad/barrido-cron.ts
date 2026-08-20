/**
 * lib/contabilidad/barrido-cron.ts — Orquestación del barrido automático.
 *
 * Niveles 2.1 y 2.2 del plan de pendientes. La ruta cron
 * (`app/api/cron/contabilidad-asientos`) llama a `ejecutarBarridoContabilidad`.
 * Son DOS barridos independientes con audiencias distintas:
 *
 *   1. Asientos pendientes → teams con `contabilidad_config.activa = true`.
 *   2. Promesas vencidas    → teams con al menos una promesa pendiente. La
 *      cartera se usa sin contabilidad encendida, así que este set NO es el
 *      mismo que el de arriba: atarlo a `activa` dejaría promesas sin evaluar.
 *
 * El botón "Generar asientos" del libro diario se queda: sirve para "quiero
 * verlo ahora". El cron solo hace que no dependa de que alguien lo apriete
 * (el compromiso conocido del Paso 4: "lo que nadie barre no se asienta").
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { generarAsientosPendientes, type ResumenBarrido } from './libro-diario';
import type { MotivoSalto } from './asientos';
import { generarDepreciacionesPendientes } from './depreciacion';
import { evaluarPromesasVencidas } from '@/lib/cobranza/seguimiento';

/**
 * Máximo de pasadas de `generarAsientosPendientes` por team en una corrida.
 * Cada pasada procesa hasta 200 orígenes (TOPE_POR_BARRIDO), así que 50 pasadas
 * son 10.000 orígenes por team — de sobra para un barrido nocturno. Es red de
 * seguridad contra un loop infinito, no un límite que se espere alcanzar.
 */
const MAX_PASADAS_POR_TEAM = 50;

/** Presupuesto de tiempo del barrido. Vercel corta la función; paramos antes. */
const PRESUPUESTO_MS = 45_000;

export interface ResumenDrenaje {
  creados:  number;
  /** Snapshot de la última pasada, no la suma: los saltables se re-cuentan. */
  saltados: number;
  motivos:  Partial<Record<MotivoSalto, number>>;
  /**
   * Orígenes que reventaron, acumulados de todas las pasadas. Antes un origen
   * roto tumbaba el barrido entero del team; ahora solo se queda sin asiento,
   * pero el cron tiene que poder decir cuál para que no se pierda en silencio.
   */
  fallidos: Array<{ origenTipo: string; origenId: number; error: string }>;
  pasadas:  number;
  /** Se cortó por MAX_PASADAS_POR_TEAM sin terminar de drenar. */
  truncadoPorTope:   boolean;
  /** Se cortó porque se agotó el presupuesto de tiempo del cron. */
  truncadoPorTiempo: boolean;
}

/**
 * Drena el backlog llamando `correrPasada` repetidamente.
 *
 * ⚠️ El corte es por FALTA DE PROGRESO (`creados === 0`), NO por `hayMas`.
 * `generarAsientosPendientes` re-selecciona en cada pasada los documentos sin
 * asiento, y los que se saltan a propósito (retenciones, notas código 2, …)
 * NUNCA reciben asiento: siguen apareciendo y mantienen `hayMas` en true para
 * siempre. Cortar por `hayMas` sería un loop infinito. Se sigue solo mientras
 * cada pasada cree asientos nuevos.
 *
 * `saltados` y `motivos` son el snapshot de la ÚLTIMA pasada (el estado estable
 * de lo que queda sin asentar), no una suma: sumarlos inflaría el número al
 * re-contar los mismos saltables en cada vuelta.
 *
 * Función pura a propósito (recibe `correrPasada` y `sigueTiempo`) para probar
 * la terminación sin base de datos.
 */
export async function drenarBarrido(
  correrPasada: () => Promise<ResumenBarrido>,
  opts: { maxPasadas: number; sigueTiempo: () => boolean },
): Promise<ResumenDrenaje> {
  const acc: ResumenDrenaje = {
    creados: 0, saltados: 0, motivos: {}, fallidos: [], pasadas: 0,
    truncadoPorTope: false, truncadoPorTiempo: false,
  };

  for (let i = 0; i < opts.maxPasadas; i++) {
    if (!opts.sigueTiempo()) { acc.truncadoPorTiempo = true; return acc; }

    const r = await correrPasada();
    acc.pasadas++;
    acc.creados += r.creados;
    acc.saltados = r.saltados; // snapshot, no suma
    acc.motivos = r.motivos;
    // Los fallos se acumulan sin repetir: un origen que revienta sigue sin
    // asiento, así que la pasada siguiente lo vuelve a seleccionar y a fallar.
    // Sumarlos a pelo daría "40 fallos" donde hay uno solo insistiendo.
    for (const f of r.fallidos) {
      if (!acc.fallidos.some((x) => x.origenTipo === f.origenTipo && x.origenId === f.origenId)) {
        acc.fallidos.push(f);
      }
    }

    // Terminado (nada más) o sin progreso (solo quedan saltables): parar.
    if (!r.hayMas || r.creados === 0) return acc;
  }

  acc.truncadoPorTope = true;
  return acc;
}

export interface ResultadoBarridoCron {
  asientos: {
    teamsProcesados: number;
    creados:         number;
    porTeam:         Array<{ teamId: number } & ResumenDrenaje>;
    truncadoPorTiempo: boolean;
  };
  depreciacion: {
    teamsProcesados: number;
    creados:         number;
  };
  promesas: {
    teamsProcesados: number;
    cumplidas:       number;
    incumplidas:     number;
  };
  errores: Array<{ fase: 'asientos' | 'depreciacion' | 'promesas'; teamId: number; error: string }>;
}

/**
 * Corre los dos barridos. Un fallo en un team no aborta el resto: se anota en
 * `errores` y se sigue, como hace el cron de facturas recurrentes.
 */
export async function ejecutarBarridoContabilidad(
  opts: { presupuestoMs?: number } = {},
): Promise<ResultadoBarridoCron> {
  const inicio = Date.now();
  const presupuesto = opts.presupuestoMs ?? PRESUPUESTO_MS;
  const sigueTiempo = () => Date.now() - inicio < presupuesto;

  const res: ResultadoBarridoCron = {
    asientos: { teamsProcesados: 0, creados: 0, porTeam: [], truncadoPorTiempo: false },
    depreciacion: { teamsProcesados: 0, creados: 0 },
    promesas: { teamsProcesados: 0, cumplidas: 0, incumplidas: 0 },
    errores: [],
  };

  // ── 1. Asientos: teams con contabilidad encendida ──────────────────────────
  const teamsAsientos = (await db.execute(sql`
    SELECT team_id FROM contabilidad_config WHERE activa = true ORDER BY team_id
  `)) as unknown as Array<{ team_id: number }>;

  for (const { team_id } of teamsAsientos) {
    if (!sigueTiempo()) { res.asientos.truncadoPorTiempo = true; break; }
    try {
      const d = await drenarBarrido(
        () => generarAsientosPendientes(team_id),
        { maxPasadas: MAX_PASADAS_POR_TEAM, sigueTiempo },
      );
      res.asientos.porTeam.push({ teamId: team_id, ...d });
      res.asientos.teamsProcesados++;
      res.asientos.creados += d.creados;
      if (d.truncadoPorTiempo) { res.asientos.truncadoPorTiempo = true; break; }
    } catch (e) {
      res.errores.push({ fase: 'asientos', teamId: team_id, error: String(e) });
    }
  }

  // ── 2. Depreciación: mismos teams con contabilidad encendida ────────────────
  // Barato (pocas cuotas por team). Idempotente por el UNIQUE de periodo. Un
  // team sin las cuentas de depreciación lanza y se anota en `errores`.
  for (const { team_id } of teamsAsientos) {
    if (!sigueTiempo()) { break; }
    try {
      const d = await generarDepreciacionesPendientes(team_id);
      res.depreciacion.teamsProcesados++;
      res.depreciacion.creados += d.creados;
    } catch (e) {
      res.errores.push({ fase: 'depreciacion', teamId: team_id, error: String(e) });
    }
  }

  // ── 3. Promesas vencidas: teams con promesa pendiente ──────────────────────
  // Barato (dos UPDATEs por team). No se acota por tiempo: importa no saltarlo.
  const teamsPromesas = (await db.execute(sql`
    SELECT DISTINCT team_id FROM cobranza_eventos
    WHERE tipo = 'promesa' AND promesa_estado = 'pendiente'
    ORDER BY team_id
  `)) as unknown as Array<{ team_id: number }>;

  for (const { team_id } of teamsPromesas) {
    try {
      const r = await evaluarPromesasVencidas(team_id);
      res.promesas.teamsProcesados++;
      res.promesas.cumplidas   += r.cumplidas;
      res.promesas.incumplidas += r.incumplidas;
    } catch (e) {
      res.errores.push({ fase: 'promesas', teamId: team_id, error: String(e) });
    }
  }

  return res;
}
