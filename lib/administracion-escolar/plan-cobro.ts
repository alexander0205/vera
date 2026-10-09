import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarConceptoCuotas, adminEscolarConceptosPago } from '@/lib/db/schema';
import { vencimientoDe } from './calendario';
import { resolverTarifas, type ContextoTarifa, type OrigenTarifa } from './tarifas';

/**
 * Qué va a deber un estudiante en el año, concepto por concepto y cuota a cuota.
 *
 * Es lo que la pantalla de matrícula enseña antes de guardar y lo que se
 * convierte en cargos al guardar — el mismo cálculo para las dos cosas, para
 * que lo que se ve sea exactamente lo que se crea.
 *
 * Nada de esto cobra: los cargos nacen con saldo completo y estado pendiente.
 * El dinero se mueve después, en Pagos.
 */

export interface CuotaPlan {
  cuotaId: number;
  numero: number;
  etiqueta: string;
  mes: number | null;
  /** El día que sale la factura. Es el que manda para saber qué se cobra. */
  fechaEmision: string;
  /**
   * Derivado: emisión + los días para pagar del concepto. No se guarda.
   * `null` cuando el concepto no lleva fecha límite.
   */
  fechaVencimiento: string | null;
  montoCentavos: number;
  /**
   * Si se emitió antes de que el alumno entrara. Al que se matricula en enero
   * no se le cobra la factura de agosto, aunque su plazo de pago siga abierto:
   * lo que decide es cuándo salió el documento, no hasta cuándo se podía pagar.
   */
  omitida: boolean;
}

export interface LineaPlan {
  conceptoId: number;
  nombre: string;
  tipo: string;
  admiteBeca: boolean;
  /**
   * La tarifa tal como la escribió el colegio. En una mensualidad es lo de CADA
   * cuota; en los demás conceptos es el total que se reparte entre ellas.
   * `totalCentavos` es lo que de verdad se va a cobrar en los dos casos.
   */
  montoCentavos: number;
  origen: OrigenTarifa;
  productId: number | null;
  cuotas: CuotaPlan[];
  /** Suma de las cuotas que siguen vivas: lo que de verdad se le va a cargar. */
  totalCentavos: number;
  /** Cuotas que ya se habían emitido cuando entró, y que se saltan. */
  omitidas: number;
  /**
   * Lo que le va a pasar a esta cuota después de emitirse: cuándo le entra el
   * recargo y qué avisos salen, con qué antelación.
   *
   * Viaja con el plan porque es la misma pregunta que responde el plan —«¿qué
   * va a pasar con este cobro?»— y separarlo obligaba a la pantalla a pedir el
   * concepto entero para enseñar tres fechas. Son las reglas, no las fechas:
   * las fechas se calculan sobre cada cuota.
   */
  reglas: ReglasCobro;
}

/** Las reglas del concepto que deciden el después de cada cuota. */
export interface ReglasCobro {
  /** Días desde la emisión hasta el vencimiento. Null = no vence. */
  diasParaPago: number | null;
  cobraMora: boolean;
  /** Días entre vencer y que entre el recargo. 0 = el mismo día. */
  moraDiasGracia: number;
  /** Interruptor maestro: apagado no sale ningún aviso, estén los días o no. */
  avisosActivos: boolean;
  avisoDiaEmision: boolean;
  avisoDiaVencimiento: boolean;
  avisoAntesMoraDias: number | null;
  avisoCorreo: boolean;
  avisoWhatsapp: boolean;
  avisoSms: boolean;
}

/** Reparte un monto entre cuotas sin perder ni un centavo por redondeo. */
function repartir(
  montoCentavos: number,
  pesos: number[],
): number[] {
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (suma <= 0) return pesos.map(() => 0);
  const partes = pesos.map((p) => Math.floor((montoCentavos * p) / suma));
  // Lo que se perdió al truncar se le da a la primera cuota, en vez de dejar
  // que el total de las cuotas no cuadre con la tarifa. Un colegio que cobra
  // 45.000 en tres partes tiene que ver 15.000 tres veces, no 14.999.
  const resto = montoCentavos - partes.reduce((a, b) => a + b, 0);
  if (partes.length > 0) partes[0] += resto;
  return partes;
}

/**
 * Arma el plan de cobro de un estudiante.
 *
 * `desde` es la fecha a partir de la cual se cuentan las cuotas como vigentes:
 * normalmente la de inscripción. Las emitidas antes se marcan omitidas y no
 * suman al total — el alumno que llega en enero no debe agosto.
 */
export async function armarPlanDeCobro(
  teamId: number,
  ctx: ContextoTarifa,
  desde: string,
): Promise<LineaPlan[]> {
  const conceptos = await db
    .select({
      id:         adminEscolarConceptosPago.id,
      nombre:     adminEscolarConceptosPago.nombre,
      tipo:       adminEscolarConceptosPago.tipo,
      admiteBeca: adminEscolarConceptosPago.admiteBeca,
      // Hace falta para derivar el vencimiento: la cuota solo guarda la fecha
      // de emisión, y el plazo es del concepto, no de cada cuota.
      diasParaPago: adminEscolarConceptosPago.diasParaPago,
      // El después de la cuota: recargo y avisos. Van con el plan para que la
      // pantalla pueda explicar «qué va a pasar con este cobro» sin pedir el
      // concepto entero por cada renglón.
      cobraMora: adminEscolarConceptosPago.cobraMora,
      moraDiasGracia: adminEscolarConceptosPago.moraDiasGracia,
      avisosActivos: adminEscolarConceptosPago.avisosActivos,
      avisoDiaEmision: adminEscolarConceptosPago.avisoDiaEmision,
      avisoDiaVencimiento: adminEscolarConceptosPago.avisoDiaVencimiento,
      avisoAntesMoraDias: adminEscolarConceptosPago.avisoAntesMoraDias,
      avisoCorreo: adminEscolarConceptosPago.avisoCorreo,
      avisoWhatsapp: adminEscolarConceptosPago.avisoWhatsapp,
      avisoSms: adminEscolarConceptosPago.avisoSms,
    })
    .from(adminEscolarConceptosPago)
    .where(and(
      eq(adminEscolarConceptosPago.teamId, teamId),
      eq(adminEscolarConceptosPago.activo, true),
    ))
    .orderBy(asc(adminEscolarConceptosPago.nombre));

  if (conceptos.length === 0) return [];

  const ids = conceptos.map((c) => c.id);
  const [tarifas, cuotas] = await Promise.all([
    resolverTarifas(teamId, ctx, ids),
    db.select()
      .from(adminEscolarConceptoCuotas)
      .where(and(
        eq(adminEscolarConceptoCuotas.teamId, teamId),
        eq(adminEscolarConceptoCuotas.periodoId, ctx.periodoId),
        eq(adminEscolarConceptoCuotas.activo, true),
        inArray(adminEscolarConceptoCuotas.conceptoId, ids),
      ))
      .orderBy(asc(adminEscolarConceptoCuotas.numero)),
  ]);

  const lineas: LineaPlan[] = [];

  for (const concepto of conceptos) {
    const tarifa = tarifas.get(concepto.id);
    // Sin tarifa no hay nada que cobrar: el concepto existe pero este grado no
    // lo paga. Enseñarlo en cero solo confunde.
    if (!tarifa) continue;

    const suyas = cuotas.filter((c) => c.conceptoId === concepto.id);
    // Un concepto sin calendario se cobra de una sola vez el día de la
    // inscripción. Es el comportamiento de antes de que existieran las cuotas,
    // y evita que un concepto recién creado desaparezca de la pantalla.
    const plantilla = suyas.length > 0
      ? suyas
      : [{
          id: 0, numero: 1, etiqueta: 'Pago único', mes: null,
          fechaEmision: desde, porcentajeMilesimas: 100000,
        }];

    /**
     * Qué significa el número que el colegio escribió en Tarifas.
     *
     * En una MENSUALIDAD es lo que se paga CADA MES: nadie teclea la colegiatura
     * del año entero en un concepto que se llama "pago de colegiatura" y está
     * marcado como mensualidad. Antes se repartía, y una mensualidad de 2.322
     * se convertía en diez cuotas de 232,20: el colegio cobraba la décima parte
     * del año sin que nada avisara.
     *
     * En los demás conceptos es el TOTAL a repartir: "inscripción 3.500 en dos
     * pagos" son 1.750 y 1.750, no 3.500 dos veces.
     */
    const porCuota = concepto.tipo === 'mensualidad';

    const montos = porCuota
      ? plantilla.map(() => tarifa.montoCentavos)
      : repartir(tarifa.montoCentavos, plantilla.map((c) => c.porcentajeMilesimas));

    const detalle: CuotaPlan[] = plantilla.map((c, i) => {
      const fechaEmision = String(c.fechaEmision);
      return {
        cuotaId: c.id,
        numero: c.numero,
        etiqueta: c.etiqueta,
        mes: c.mes,
        fechaEmision,
        fechaVencimiento: vencimientoDe(fechaEmision, concepto.diasParaPago),
        montoCentavos: montos[i],
        omitida: fechaEmision < desde,
      };
    });

    const vigentes = detalle.filter((c) => !c.omitida);

    lineas.push({
      conceptoId: concepto.id,
      nombre: concepto.nombre,
      tipo: concepto.tipo,
      admiteBeca: concepto.admiteBeca,
      montoCentavos: tarifa.montoCentavos,
      origen: tarifa.origen,
      productId: tarifa.productId,
      cuotas: detalle,
      totalCentavos: vigentes.reduce((a, c) => a + c.montoCentavos, 0),
      omitidas: detalle.length - vigentes.length,
      reglas: {
        diasParaPago: concepto.diasParaPago,
        cobraMora: concepto.cobraMora,
        moraDiasGracia: concepto.moraDiasGracia,
        avisosActivos: concepto.avisosActivos,
        avisoDiaEmision: concepto.avisoDiaEmision,
        avisoDiaVencimiento: concepto.avisoDiaVencimiento,
        avisoAntesMoraDias: concepto.avisoAntesMoraDias,
        avisoCorreo: concepto.avisoCorreo,
        avisoWhatsapp: concepto.avisoWhatsapp,
        avisoSms: concepto.avisoSms,
      },
    });
  }

  return lineas;
}
