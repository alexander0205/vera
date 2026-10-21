/**
 * El recorrido del cron `escolar-corrida-avisos`, sin saber de dónde salen los
 * datos ni cómo se manda un correo.
 *
 * Las dependencias entran por parámetro (`DepsCorrida`) para poder probar las
 * dos cosas que importan sin tocar una base ni Resend: que un aviso NUNCA salga
 * dos veces, y que el interruptor apagado calcule todo y no mande nada. El cron
 * real las conecta en `app/api/cron/escolar-corrida-avisos/route.ts`.
 */

import {
  claveAviso,
  hayMontoQueContar,
  lineasDeLaCorrida,
  llaveDeEnvio,
  modoDeCorrida,
  objetivosDeAviso,
  resumirCorrida,
  yaSeEnvio,
  type ContextoColegio,
  type DestinatarioCorrida,
  type ModoCorrida,
  type ResumenCorrida,
  type TipoAviso,
} from './corrida-avisos';
import type { DatosAvisoCorrida } from './corrida-textos';
import type { CorridaCandidata } from './corrida-datos';

export interface DepsCorrida {
  descubrir(fechas: string[]): Promise<CorridaCandidata[]>;
  destinatarios(teamIds: number[]): Promise<Map<number, DestinatarioCorrida[]>>;
  yaEnviados(teamIds: number[], claves: string[]): Promise<Set<string>>;
  cargarContexto(c: CorridaCandidata): Promise<ContextoColegio>;
  facturasCreadasEl(teamId: number, documentoIds: number[], fecha: string): Promise<Set<number>>;
  /** El asunto con el que saldría, para el simulacro. */
  asunto(d: DatosAvisoCorrida): string;
  enviar(email: string, d: DatosAvisoCorrida): Promise<void>;
  registrar(r: { teamId: number; userId: number; clave: string; meta: Record<string, unknown> }): Promise<void>;
}

export type MotivoOmision =
  | 'ya-enviado'
  | 'sin-destinatarios'
  | 'sin-matriculas-activas'
  /** Colegio que factura a mano, con los avisos de modo manual apagados. */
  | 'manual-apagado'
  | 'sin-monto';

export interface AvisoDeLaCorrida {
  teamId: number;
  colegio: string;
  tipo: TipoAviso;
  fecha: string;
  modo: ModoCorrida;
  asunto: string;
  destinatarios: number;
  resumen: ResumenCorrida;
}

export interface ResultadoProceso {
  colegios: number;
  /** Lo que hay que mandar (simulacro) o lo que se intentó mandar. */
  avisos: AvisoDeLaCorrida[];
  enviados: number;
  omitidos: { teamId: number; tipo: TipoAviso; fecha: string; motivo: MotivoOmision }[];
  fallos: { teamId: number; tipo?: TipoAviso; error: string }[];
}

/**
 * Recorre los colegios con cuotas en las fechas de hoy y manda (o simula) los
 * tres avisos.
 *
 * `soloSimular` calcula exactamente lo mismo y no escribe nada: ni correos ni
 * filas de idempotencia.
 */
export async function procesarAvisosCorrida(
  deps: DepsCorrida,
  opts: {
    hoy: string;
    soloSimular: boolean;
    /**
     * Si también se avisa a los colegios que facturan a mano. Por defecto sí;
     * el cron lo enciende solo con `ESCOLAR_AVISOS_CORRIDA_MANUAL=1`, porque
     * hoy los colegios manuales no lo pidieron y algunos ni facturan por
     * Gobernanza todavía.
     */
    incluirManual?: boolean;
  },
): Promise<ResultadoProceso> {
  const objetivos = objetivosDeAviso(opts.hoy);
  const r: ResultadoProceso = { colegios: 0, avisos: [], enviados: 0, omitidos: [], fallos: [] };

  const candidatos = await deps.descubrir(objetivos.map((o) => o.fecha));
  r.colegios = candidatos.length;
  if (candidatos.length === 0) return r;

  const teamIds = candidatos.map((c) => c.teamId);
  const [destinatarios, enviados] = await Promise.all([
    deps.destinatarios(teamIds),
    deps.yaEnviados(teamIds, objetivos.map((o) => claveAviso(o.tipo, o.fecha))),
  ]);

  for (const cand of candidatos) {
    try {
      const propios = objetivos.filter((o) => cand.fechas.includes(o.fecha));
      const gente = destinatarios.get(cand.teamId) ?? [];

      if (gente.length === 0) {
        // No es un fallo del cron sino del colegio: sin dueño ni administrador
        // con correo no hay a quién avisar. Queda en el log para poder verlo.
        console.warn(`[escolar-corrida-avisos] team ${cand.teamId} (${cand.nombre}) sin owner/admin con correo: no se avisa.`);
        for (const o of propios) r.omitidos.push({ teamId: cand.teamId, tipo: o.tipo, fecha: o.fecha, motivo: 'sin-destinatarios' });
        continue;
      }

      // A cada aviso le quedan los destinatarios que todavía no lo recibieron.
      // Por destinatario y no por colegio: si el envío a uno falla, el reintento
      // no le repite el correo al que sí le llegó.
      const pendientes = propios
        .map((o) => ({
          o,
          para: gente.filter((d) => !yaSeEnvio(enviados, cand.teamId, claveAviso(o.tipo, o.fecha), d.userId)),
        }));
      for (const p of pendientes.filter((x) => x.para.length === 0)) {
        r.omitidos.push({ teamId: cand.teamId, tipo: p.o.tipo, fecha: p.o.fecha, motivo: 'ya-enviado' });
      }
      const porEnviar = pendientes.filter((x) => x.para.length > 0);
      if (porEnviar.length === 0) continue;

      // Lo caro va después de lo barato: si ya salió todo, no se lee el colegio.
      const ctx = await deps.cargarContexto(cand);
      if (!ctx.matriculas.some((m) => m.estado === 'activa')) {
        for (const p of porEnviar) r.omitidos.push({ teamId: cand.teamId, tipo: p.o.tipo, fecha: p.o.fecha, motivo: 'sin-matriculas-activas' });
        continue;
      }
      const conPlanes = ctx.matriculas.some((m) => m.conPlanActivo);

      for (const { o, para } of porEnviar) {
        const modo = modoDeCorrida(cand.facturarDesde, o.fecha);
        if (modo === 'manual' && opts.incluirManual === false) {
          r.omitidos.push({ teamId: cand.teamId, tipo: o.tipo, fecha: o.fecha, motivo: 'manual-apagado' });
          continue;
        }
        const { lineas, sinTarifa } = lineasDeLaCorrida(ctx, o.fecha);

        // Solo el resultado necesita saber cuáles facturas nacieron HOY.
        let facturasDeHoy: Set<number> | undefined;
        if (o.tipo === 'resultado') {
          const ids = lineas.map((l) => l.ecfDocumentId).filter((x): x is number => x != null);
          facturasDeHoy = await deps.facturasCreadasEl(cand.teamId, ids, opts.hoy);
        }

        const resumen = resumirCorrida(lineas, sinTarifa.length, {
          tipo: o.tipo, modo, conPlanes, facturasDeHoy,
        });
        if (!hayMontoQueContar(resumen)) {
          r.omitidos.push({ teamId: cand.teamId, tipo: o.tipo, fecha: o.fecha, motivo: 'sin-monto' });
          continue;
        }

        const datos: DatosAvisoCorrida = {
          tipo: o.tipo, fecha: o.fecha, modo, colegio: cand.nombre, resumen,
        };
        r.avisos.push({
          teamId: cand.teamId, colegio: cand.nombre, tipo: o.tipo, fecha: o.fecha, modo,
          asunto: deps.asunto(datos), destinatarios: para.length, resumen,
        });
        if (opts.soloSimular) continue;

        const clave = claveAviso(o.tipo, o.fecha);
        for (const d of para) {
          try {
            await deps.enviar(d.email, datos);
          } catch (e) {
            r.fallos.push({ teamId: cand.teamId, tipo: o.tipo, error: e instanceof Error ? e.message : String(e) });
            continue;
          }
          r.enviados++;
          try {
            await deps.registrar({
              teamId: cand.teamId,
              userId: d.userId,
              clave,
              meta: { modo, familias: resumen.familias, totalCentavos: resumen.totalCentavos },
            });
            // También en memoria: si el mismo colegio apareciera dos veces en la
            // misma corrida, el segundo paso lo vería como ya enviado.
            enviados.add(llaveDeEnvio(cand.teamId, clave, d.userId));
          } catch (e) {
            // El correo ya salió. Que no quede anotado significa que un
            // reintento a mano ese mismo día lo repetiría: se grita en el log.
            console.error(`[escolar-corrida-avisos] salió ${clave} a team ${cand.teamId} pero no se pudo anotar en audit_logs:`, e);
            r.fallos.push({ teamId: cand.teamId, tipo: o.tipo, error: 'enviado pero sin registrar' });
          }
        }
      }
    } catch (e) {
      // Un colegio con la configuración a medias no puede dejar sin aviso a los
      // demás. Mismo criterio que el devengo: se anota y se sigue.
      r.fallos.push({ teamId: cand.teamId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (r.fallos.length > 0) console.warn('[escolar-corrida-avisos] avisos con fallos', r.fallos);
  return r;
}
