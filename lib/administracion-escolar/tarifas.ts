import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarConceptoPrecios,
  adminEscolarConceptosPago,
  adminEscolarCursos,
  adminEscolarGrados,
  adminEscolarMatriculas,
} from '@/lib/db/schema';

/**
 * Cuánto le toca pagar a un estudiante por un concepto.
 *
 * El precio NO se guarda por estudiante ni por sección: se guarda una vez en el
 * servicio (o en el grado cuando hay excepción) y se resuelve subiendo el árbol
 *
 *     matrícula → sección → grado → servicio
 *
 * quedándose con el primero que tenga tarifa para ese año escolar. Así un
 * colegio configura cuatro números al año en vez de mantener un producto por
 * grado (que es como se termina con treinta "Pago de colegiatura" distintos).
 *
 * La beca va por encima de todo, pero solo para la mensualidad: es un acuerdo
 * con la familia, no una propiedad del aula. En una misma sección conviven
 * quien paga tarifa completa y quien tiene monto pactado, y ambos siguen
 * apuntando al mismo grado — que es lo que permite saber cuánto ingresó
 * realmente cada curso.
 */

/** De dónde salió el monto. Sirve para explicarlo en la UI. */
export type OrigenTarifa = 'beca' | 'seccion' | 'grado' | 'servicio';

export interface TarifaResuelta {
  montoCentavos: number;
  origen: OrigenTarifa;
  /** Nodo del que se heredó (null cuando vino de la beca). */
  objetivoId: number | null;
  /**
   * Servicio de facturación con el que se cobra. La beca cambia el monto pero
   * no el producto: el becado se sigue facturando contra su grado, que es lo
   * que permite saber cuánto ingresó cada curso de verdad.
   */
  productId: number | null;
}

/**
 * Resuelve la tarifa de `conceptoId` para la matrícula dada.
 * Devuelve null si no hay ninguna tarifa configurada en toda la cadena: el
 * llamador decide si eso es un error o si pide el monto a mano.
 */
export async function resolverTarifa(
  teamId: number,
  matriculaId: number,
  conceptoId: number,
): Promise<TarifaResuelta | null> {
  const [ctx] = await db
    .select({
      periodoId:  adminEscolarMatriculas.periodoId,
      seccionId:  adminEscolarMatriculas.cursoId,
      becaTipo:   adminEscolarMatriculas.becaTipo,
      becaValor:  adminEscolarMatriculas.becaValor,
      gradoId:    adminEscolarCursos.gradoId,
      servicioId: adminEscolarGrados.servicioId,
    })
    .from(adminEscolarMatriculas)
    .innerJoin(adminEscolarCursos, eq(adminEscolarCursos.id, adminEscolarMatriculas.cursoId))
    .innerJoin(adminEscolarGrados, eq(adminEscolarGrados.id, adminEscolarCursos.gradoId))
    .where(and(
      eq(adminEscolarMatriculas.id, matriculaId),
      eq(adminEscolarMatriculas.teamId, teamId),
    ))
    .limit(1);

  if (!ctx) return null;

  const precios = await db
    .select({
      objetivoTipo:  adminEscolarConceptoPrecios.objetivoTipo,
      objetivoId:    adminEscolarConceptoPrecios.objetivoId,
      montoCentavos: adminEscolarConceptoPrecios.montoCentavos,
      productId:     adminEscolarConceptoPrecios.productId,
    })
    .from(adminEscolarConceptoPrecios)
    .where(and(
      eq(adminEscolarConceptoPrecios.teamId, teamId),
      eq(adminEscolarConceptoPrecios.conceptoId, conceptoId),
      eq(adminEscolarConceptoPrecios.periodoId, ctx.periodoId),
      eq(adminEscolarConceptoPrecios.activo, true),
    ));

  // Lo más específico gana: una tarifa en el grado tapa la del servicio.
  const cadena: { tipo: OrigenTarifa; id: number }[] = [
    { tipo: 'seccion',  id: ctx.seccionId },
    { tipo: 'grado',    id: ctx.gradoId },
    { tipo: 'servicio', id: ctx.servicioId },
  ];

  let tarifa: TarifaResuelta | null = null;
  for (const nivel of cadena) {
    const hit = precios.find((p) => p.objetivoTipo === nivel.tipo && p.objetivoId === nivel.id);
    if (hit) {
      tarifa = {
        montoCentavos: hit.montoCentavos,
        origen: nivel.tipo,
        objetivoId: hit.objetivoId,
        productId: hit.productId,
      };
      break;
    }
  }

  // La beca se aplica al final y solo sobre la mensualidad: inscripción,
  // materiales y uniformes se cobran completos aunque el estudiante tenga beca.
  // Cambia el monto pero conserva el servicio de facturación de la estructura,
  // para que el becado siga sumando en su grado y no en una bolsa aparte.
  if (ctx.becaTipo && ctx.becaValor != null) {
    const [concepto] = await db
      .select({ recurrente: adminEscolarConceptosPago.recurrente })
      .from(adminEscolarConceptosPago)
      .where(and(
        eq(adminEscolarConceptosPago.id, conceptoId),
        eq(adminEscolarConceptosPago.teamId, teamId),
      ))
      .limit(1);

    if (concepto?.recurrente) {
      // El porcentaje necesita saber sobre cuánto descuenta, así que sin tarifa
      // debajo no hay beca que aplicar. El monto pactado sí se sostiene solo.
      const conBeca = ctx.becaTipo === 'porcentaje'
        ? (tarifa ? Math.round(tarifa.montoCentavos * (100 - ctx.becaValor) / 100) : null)
        : ctx.becaValor;

      if (conBeca != null) {
        return { montoCentavos: conBeca, origen: 'beca', objetivoId: null, productId: tarifa?.productId ?? null };
      }
    }
  }

  return tarifa;
}
