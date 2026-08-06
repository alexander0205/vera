import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarConceptoCuotas, adminEscolarConceptosPago } from '@/lib/db/schema';
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
  fechaVencimiento: string;
  montoCentavos: number;
  /** Si ya pasó su fecha. Al alumno que entra en enero no se le cobra agosto. */
  vencida: boolean;
}

export interface LineaPlan {
  conceptoId: number;
  nombre: string;
  tipo: string;
  /** Llega marcado en la pantalla. */
  porDefecto: boolean;
  admiteBeca: boolean;
  /** Tarifa del año antes de repartir en cuotas. */
  montoCentavos: number;
  origen: OrigenTarifa;
  productId: number | null;
  cuotas: CuotaPlan[];
  /** Suma de las cuotas no vencidas: lo que de verdad se le va a cargar. */
  totalCentavos: number;
  /** Cuotas cuya fecha ya pasó, que se omiten. */
  omitidas: number;
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
 * normalmente la de inscripción. Las anteriores se marcan vencidas y no suman
 * al total — el alumno que llega en enero no debe agosto.
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
      porDefecto: adminEscolarConceptosPago.aplicaPorDefecto,
      admiteBeca: adminEscolarConceptosPago.admiteBeca,
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
          fechaVencimiento: desde, porcentajeMilesimas: 100000,
        }];

    const montos = repartir(
      tarifa.montoCentavos,
      plantilla.map((c) => c.porcentajeMilesimas),
    );

    const detalle: CuotaPlan[] = plantilla.map((c, i) => ({
      cuotaId: c.id,
      numero: c.numero,
      etiqueta: c.etiqueta,
      mes: c.mes,
      fechaVencimiento: String(c.fechaVencimiento),
      montoCentavos: montos[i],
      vencida: String(c.fechaVencimiento) < desde,
    }));

    const vigentes = detalle.filter((c) => !c.vencida);

    lineas.push({
      conceptoId: concepto.id,
      nombre: concepto.nombre,
      tipo: concepto.tipo,
      porDefecto: concepto.porDefecto,
      admiteBeca: concepto.admiteBeca,
      montoCentavos: tarifa.montoCentavos,
      origen: tarifa.origen,
      productId: tarifa.productId,
      cuotas: detalle,
      totalCentavos: vigentes.reduce((a, c) => a + c.montoCentavos, 0),
      omitidas: detalle.length - vigentes.length,
    });
  }

  return lineas;
}
