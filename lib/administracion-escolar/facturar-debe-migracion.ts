/**
 * Formulario de migración: los meses que el alumno «debe todo» se facturan al
 * guardar el estudiante.
 *
 * El cargo de esos meses ya existe —se crea al matricular, con el vencimiento
 * original del mes— pero un cargo sin factura no está en cuentas por cobrar
 * como documento y no recibe mora: la mora solo corre sobre facturas vencidas.
 * Y la facturación automática no factura hacia atrás, así que sin esto la
 * deuda migrada se quedaba sin facturar hasta que alguien se acordara.
 *
 * Se usa la misma máquina que el cron y «Facturar en lote» (`facturarGrupos`):
 * BORRADOR `sin-ncf`, nada va a la DGII, y su plazo es el vencimiento del
 * cargo. Por eso la mora sale sola desde el mes en que venció.
 *
 * Una factura por mes: lo que el alumno debe de agosto (mensualidad, horario
 * extendido…) va junto, como lo cobra el colegio.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCargos, adminEscolarEstudiantes } from '@/lib/db/schema';
import { facturarGrupos } from './facturar-emision';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export interface CargoDebe {
  id: number; mes: number | null; anio: number | null;
  saldoCentavos: number; fechaVencimiento: string | null;
}

export interface ResultadoFacturarDebe {
  facturas: { codigo: string; mes: string; montoCentavos: number; vence: string | null }[];
  /** Lo que no se pudo facturar, ya explicado: sigue marcado «Debe todo». */
  sinFacturar: string[];
  /** Cargos que ya tienen factura: salen de la lista de «Debe todo». */
  facturados: number[];
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

export async function facturarDebeDelAlumno(
  teamId: number, userId: number, estudianteId: number, debe: number[],
): Promise<ResultadoFacturarDebe> {
  const vacio: ResultadoFacturarDebe = { facturas: [], sinFacturar: [], facturados: [] };
  if (debe.length === 0) return vacio;

  // Solo lo que sigue debiéndose entero y sin factura: si mientras tanto se le
  // anotó un pago o se vinculó una factura, ese mes ya no «debe todo».
  const cargos = await db.select({
    id: adminEscolarCargos.id,
    mes: adminEscolarCargos.mes,
    anio: adminEscolarCargos.anio,
    saldoCentavos: adminEscolarCargos.saldoCentavos,
    fechaVencimiento: adminEscolarCargos.fechaVencimiento,
  })
    .from(adminEscolarCargos)
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.estudianteId, estudianteId),
      inArray(adminEscolarCargos.id, debe),
      isNull(adminEscolarCargos.ecfDocumentId),
      inArray(adminEscolarCargos.estado, ['pendiente', 'vencido']),
      sql`${adminEscolarCargos.saldoCentavos} = ${adminEscolarCargos.montoCentavos}`,
      sql`${adminEscolarCargos.saldoCentavos} > 0`,
    ));
  if (cargos.length === 0) return vacio;

  const [est] = await db.select({ clienteId: adminEscolarEstudiantes.facturarAClientId })
    .from(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, teamId)))
    .limit(1);
  if (!est?.clienteId) {
    return {
      ...vacio,
      sinFacturar: [
        'No tiene responsable de pago, así que los meses que debe no se pudieron facturar: quedan como cargo pendiente, '
        + 'sin factura y sin mora. Ponle el responsable en «Familia» y vuelve a guardar el estudiante.',
      ],
    };
  }

  const grupos = agruparPorMes(cargos);
  const { facturas, diagnostico } = await facturarGrupos(
    teamId,
    grupos.map((g) => ({ clienteId: est.clienteId!, cargos: g })),
    { userId },
  );

  const porId = new Map(cargos.map((c) => [c.id, c]));
  return {
    facturas: facturas.map((f) => {
      const g = f.cargoIds.map((id) => porId.get(id)!);
      const vence = g.map((c) => c.fechaVencimiento).filter((v): v is string => !!v).sort().at(-1) ?? null;
      return { codigo: f.codigo, mes: nombreMes(g[0]), montoCentavos: f.montoCentavos, vence };
    }),
    sinFacturar: diagnostico.map((d) => {
      const mes = porId.get(d.cargoIds[0]);
      return `${mes ? nombreMes(mes) : 'Un mes'}: no se pudo facturar (${d.detalle}). Sigue marcado «Debe todo».`;
    }),
    facturados: facturas.flatMap((f) => f.cargoIds),
  };
}
