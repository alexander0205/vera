/**
 * lib/administracion-escolar/matricula-alta.ts — crear UNA matrícula con sus
 * cargos, en una transacción.
 *
 * Es la fuente única del alta: la usa el alta individual (`POST /matriculas`) y
 * el alta en lote (`POST /matriculas/lote`). Antes el cálculo de cargos vivía
 * inline en el endpoint individual; al aparecer el lote se sacó aquí para que
 * las dos puertas creen exactamente la misma deuda —el mismo bug de «dos
 * flujos que hacían lo mismo distinto» que ya costó una vez.
 *
 * No cobra nada: los cargos nacen con saldo completo y estado pendiente. El
 * dinero se mueve después, en Pagos.
 */

import { db } from '@/lib/db/drizzle';
import { adminEscolarMatriculas, adminEscolarCargos } from '@/lib/db/schema';
import { cuotasVigentes, finDeMes } from './devengar';
import type { LineaPlan } from './plan-cobro';

export interface AltaMatriculaParams {
  teamId: number;
  estudianteId: number;
  periodoId: number;
  cursoId: number;
  documentoListaId: number | null;
  codigoMatricula: string | null;
  /** Fecha guardada en la matrícula (puede ir nula, como antes). */
  fechaInscripcion: string | null;
  /**
   * La fecha con la que se decide qué cuotas ya están vigentes. Es la de
   * inscripción, o hoy si no vino. Se pasa aparte porque `fechaInscripcion`
   * admite null pero el cálculo de cuotas necesita siempre una fecha.
   */
  inscripcionEfectiva: string;
  estado: string;
  notas: string | null;
  becaTipo: 'porcentaje' | 'monto' | null;
  becaValor: number | null;
  becaMotivo: string | null;
  /** Conceptos que se le cargan. Vacío = matrícula sin cargos. */
  conceptos: number[];
}

/**
 * Inserta la matrícula y los cargos ya vigentes en una sola transacción.
 *
 * `plan` es el plan de cobro de la sección, ya calculado por el llamador
 * (`armarPlanDeCobro`). En lote se calcula UNA vez y se reutiliza para todo el
 * grupo, porque todos van a la misma sección con la misma fecha. Pasa vacío si
 * la sección no tiene contexto de tarifa: la matrícula se crea sin cargos.
 *
 * Puede lanzar 23505 (índice único parcial) si el estudiante ya tiene una
 * matrícula activa en el período: el llamador decide si lo trata como
 * conflicto por-alumno (lote) o como error de la petición (individual).
 */
export async function crearMatriculaConCargos(
  params: AltaMatriculaParams,
  plan: LineaPlan[],
) {
  return db.transaction(async (tx) => {
    const [matricula] = await tx.insert(adminEscolarMatriculas).values({
      teamId:           params.teamId,
      estudianteId:     params.estudianteId,
      periodoId:        params.periodoId,
      cursoId:          params.cursoId,
      documentoListaId: params.documentoListaId,
      codigoMatricula:  params.codigoMatricula,
      fechaInscripcion: params.fechaInscripcion,
      estado:           params.estado,
      notas:            params.notas,
      becaTipo:         params.becaTipo,
      becaValor:        params.becaValor,
      becaMotivo:       params.becaMotivo,
      // Lo marcado aquí es lo que se le cobra el año entero: el devengo mensual
      // sigue esta lista para saber si un concepto sin cargos estaba desmarcado
      // a propósito o solo no le había tocado el mes.
      conceptosIds:     params.conceptos,
    }).returning();

    if (params.conceptos.length === 0) return matricula;

    // Solo lo que ya entró en vigor. Las mensualidades futuras NO nacen aquí:
    // el que matricula en agosto no debe junio. El devengo mensual crea el
    // resto cuando llega su mes.
    const hasta = finDeMes(params.inscripcionEfectiva);
    const filas = cuotasVigentes(plan, params.conceptos, hasta).map(({ linea, cuota }) => ({
      teamId:        params.teamId,
      estudianteId:  params.estudianteId,
      matriculaId:   matricula.id,
      periodoId:     params.periodoId,
      conceptoId:    linea.conceptoId,
      // `cuotaId` 0 es el pago único de un concepto sin calendario: no existe
      // como fila, así que se guarda nulo.
      cuotaId:       cuota.cuotaId || null,
      mes:           cuota.mes,
      // El año es el de la EMISIÓN, no el del vencimiento: la cuota de diciembre
      // con días para pagar se vencería el año siguiente.
      anio:          Number(cuota.fechaEmision.slice(0, 4)),
      montoCentavos: cuota.montoCentavos,
      // Nace debiéndose entero. Matricular no cobra.
      saldoCentavos: cuota.montoCentavos,
      fechaVencimiento: cuota.fechaVencimiento,
      estado: 'pendiente',
    }));

    if (filas.length > 0) {
      // `onConflictDoNothing` contra (matricula_id, cuota_id): dos clics o un
      // reintento tras un error de red no le vuelven a cobrar al padre.
      await tx.insert(adminEscolarCargos).values(filas).onConflictDoNothing();
    }
    return matricula;
  });
}
