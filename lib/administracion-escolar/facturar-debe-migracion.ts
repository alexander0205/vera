/**
 * Formulario de migración: los meses que el alumno «debe todo» se facturan al
 * guardar el estudiante, y su mora queda al día.
 *
 * El cargo de esos meses ya existe —se crea al matricular, con el vencimiento
 * original del mes— pero un cargo sin factura no está en cuentas por cobrar
 * como documento y no recibe mora: la mora solo corre sobre facturas vencidas.
 * Y la facturación automática no factura hacia atrás, así que sin esto la
 * deuda migrada se quedaba sin facturar hasta que alguien se acordara.
 *
 * Se usa la misma máquina que el cron y «Facturar en lote» (`facturarGrupos`):
 * BORRADOR `sin-ncf`, nada va a la DGII, y su plazo es el vencimiento del
 * cargo. Una factura por mes: lo que el alumno debe de agosto (mensualidad,
 * horario extendido…) va junto, como lo cobra el colegio.
 *
 * La mora, con la misma pieza que el botón «Generar mora» de la factura
 * (`generarNotaDebitoMora`), periodo por periodo hasta hoy. El cron haría lo
 * mismo pero de a un periodo por día; aquí alguien lo está revisando, así que
 * se pone al día de una vez y la ficha enseña la deuda real desde el primer día.
 *  - Sin «mora que ya traía»: la que calcula el sistema, solo si el colegio
 *    tiene la mora activa y algún concepto del mes la cobra (las reglas del cron).
 *  - Con «mora que ya traía» (de otro sistema): ese monto, repartido entre los
 *    periodos ya vencidos. Así el cron los ve cobrados y no los cobra otra vez;
 *    solo sigue con los que vengan.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCargos, adminEscolarConceptosPago, adminEscolarEstudiantes, ecfDocuments, teams,
} from '@/lib/db/schema';
import { calcularEstadoPago } from '@/lib/facturas/estado-pago-calc';
import { generarNotaDebitoMora } from '@/lib/cobranza/nota-debito-mora';
import { facturarGrupos } from './facturar-emision';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Tope de periodos de mora por factura en una sola pasada: un año de mensuales y algo más. */
const MAX_PERIODOS = 36;

export interface CargoDebe {
  id: number; mes: number | null; anio: number | null;
  saldoCentavos: number; fechaVencimiento: string | null;
}

export interface ResultadoFacturarDebe {
  facturas: {
    codigo: string; mes: string; montoCentavos: number; vence: string | null;
    /** La mora que quedó puesta al facturar (la calculada o la que ya traía). */
    moraCentavos: number;
  }[];
  /** Lo que no se pudo facturar o anotar, ya explicado. */
  sinFacturar: string[];
  /** Cargos que salen de la lista de «Debe todo»: ya facturados, o pagados mientras tanto. */
  quitar: number[];
}

export const nombreMes = (c: Pick<CargoDebe, 'mes' | 'anio'>) =>
  (c.mes ? `${MESES[c.mes - 1]}${c.anio ? ` ${c.anio}` : ''}` : 'Pago único');

/** Los cargos de un mismo mes van en una factura; el pago único, en la suya. */
export function agruparPorMes<C extends CargoDebe>(cargos: C[]): C[][] {
  const m = new Map<string, C[]>();
  for (const c of cargos) {
    const clave = c.mes ? `${c.anio ?? 0}-${c.mes}` : `unico-${c.id}`;
    m.set(clave, [...(m.get(clave) ?? []), c]);
  }
  return [...m.values()];
}

/** Un monto repartido en `n` partes que suman exacto: lo que sobra va en las primeras. */
export function repartir(totalCentavos: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCentavos / n);
  const resto = totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

export async function facturarDebeDelAlumno(
  teamId: number, userId: number, estudianteId: number, debe: number[], moraPrevia: Record<string, number> = {},
): Promise<ResultadoFacturarDebe> {
  const vacio: ResultadoFacturarDebe = { facturas: [], sinFacturar: [], quitar: [] };
  if (debe.length === 0) return vacio;

  // Todo lo marcado de este alumno; solo se factura lo que sigue debiéndose
  // entero y sin factura. Lo demás (se le anotó un pago, se vinculó una
  // factura, se anuló) ya no «debe todo»: la marca sobra y se quita.
  const marcados = await db.select({
    id: adminEscolarCargos.id,
    mes: adminEscolarCargos.mes,
    anio: adminEscolarCargos.anio,
    montoCentavos: adminEscolarCargos.montoCentavos,
    saldoCentavos: adminEscolarCargos.saldoCentavos,
    fechaVencimiento: adminEscolarCargos.fechaVencimiento,
    estado: adminEscolarCargos.estado,
    ecfDocumentId: adminEscolarCargos.ecfDocumentId,
    cobraMora: adminEscolarConceptosPago.cobraMora,
  })
    .from(adminEscolarCargos)
    .innerJoin(adminEscolarConceptosPago, eq(adminEscolarConceptosPago.id, adminEscolarCargos.conceptoId))
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.estudianteId, estudianteId),
      inArray(adminEscolarCargos.id, debe),
    ));
  const cargos = marcados.filter((c) => c.ecfDocumentId == null
    && ['pendiente', 'vencido'].includes(c.estado)
    && c.saldoCentavos === c.montoCentavos && c.saldoCentavos > 0);
  const sobran = marcados.filter((c) => !cargos.includes(c)).map((c) => c.id);
  if (cargos.length === 0) return { ...vacio, quitar: sobran };

  const [est] = await db.select({ clienteId: adminEscolarEstudiantes.facturarAClientId })
    .from(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, teamId)))
    .limit(1);
  if (!est?.clienteId) {
    return {
      ...vacio,
      quitar: sobran,
      sinFacturar: [
        'No tiene responsable de pago, así que los meses que debe no se pudieron facturar: quedan como cargo pendiente, '
        + 'sin factura y sin mora. Ponle el responsable en «Familia» y vuelve a guardar el estudiante.',
      ],
    };
  }

  const [team] = await db.select({ moraActiva: teams.recargoMoraActivo }).from(teams).where(eq(teams.id, teamId)).limit(1);

  const grupos = agruparPorMes(cargos);
  const { facturas, diagnostico } = await facturarGrupos(
    teamId,
    grupos.map((g) => ({ clienteId: est.clienteId!, cargos: g })),
    { userId },
  );

  const porId = new Map(cargos.map((c) => [c.id, c]));
  const sinFacturar = diagnostico.map((d) => {
    const c = porId.get(d.cargoIds[0]);
    return `${c ? nombreMes(c) : 'Un mes'}: no se pudo facturar (${d.detalle}). Sigue marcado «Debe todo».`;
  });

  const resultado: ResultadoFacturarDebe['facturas'] = [];
  for (const f of facturas) {
    const g = f.cargoIds.map((id) => porId.get(id)!);
    const mes = nombreMes(g[0]);
    const vence = g.map((c) => c.fechaVencimiento).filter((v): v is string => !!v).sort().at(-1) ?? null;
    const previa = g.reduce((s, c) => s + Math.max(0, Math.round(moraPrevia[String(c.id)] ?? 0)), 0);
    let moraCentavos = 0;
    try {
      if (previa > 0) {
        moraCentavos = await anotarMoraPrevia(teamId, f.documentoId, previa, userId);
        if (moraCentavos === 0) {
          sinFacturar.push(`${mes}: la mora que ya traía no se anotó porque el mes todavía no está vencido (o sigue en días de gracia).`);
        }
      } else if (team?.moraActiva && g.some((c) => c.cobraMora)) {
        moraCentavos = await moraAlDia(f.documentoId, userId);
      }
    } catch (e) {
      sinFacturar.push(`${mes}: se facturó, pero la mora no se pudo poner al día (${e instanceof Error ? e.message : 'error'}). La pondrá el cron.`);
    }
    resultado.push({ codigo: f.codigo, mes, montoCentavos: f.montoCentavos, vence, moraCentavos });
  }

  return { facturas: resultado, sinFacturar, quitar: [...sobran, ...facturas.flatMap((f) => f.cargoIds)] };
}

/** Genera la mora de cada periodo vencido hasta hoy. Devuelve cuánto suma. */
async function moraAlDia(documentoId: number, userId: number): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_PERIODOS; i++) {
    const r = await generarNotaDebitoMora(documentoId, { createdBy: userId, origen: 'manual' });
    if (!r.ok) break;
    total += r.montoCentavos;
  }
  return total;
}

/**
 * La mora que ya traía de otro sistema: se crean las notas de cada periodo
 * vencido (como haría el cron) y se les pone, repartido, el monto anotado.
 * Devuelve lo anotado, o 0 si no había ningún periodo vencido donde ponerla.
 */
async function anotarMoraPrevia(teamId: number, documentoId: number, totalCentavos: number, userId: number): Promise<number> {
  const notas: number[] = [];
  for (let i = 0; i < MAX_PERIODOS; i++) {
    const r = await generarNotaDebitoMora(documentoId, { createdBy: userId, origen: 'manual' });
    if (!r.ok) break;
    notas.push(r.notaDebitoId);
  }
  if (notas.length === 0) return 0;

  const partes = repartir(totalCentavos, notas.length);
  for (const [i, id] of notas.entries()) {
    const monto = partes[i];
    await db.update(ecfDocuments).set({
      montoTotal: monto,
      estadoPago: calcularEstadoPago({ estado: 'BORRADOR', tipoPago: 2, montoTotal: monto, totalPagado: 0 }),
      // Misma línea que pone el generador, con el monto que traía.
      lineasJson: sql`jsonb_set(${ecfDocuments.lineasJson}::jsonb, '{0,precioUnitarioItem}', to_jsonb(${monto / 100}::numeric))::text`,
      notas: sql`coalesce(${ecfDocuments.notas}, '') || ' (mora que ya traía de otro sistema)'`,
    }).where(and(eq(ecfDocuments.id, id), eq(ecfDocuments.teamId, teamId), eq(ecfDocuments.moraOrigenId, documentoId)));
  }
  return totalCentavos;
}
