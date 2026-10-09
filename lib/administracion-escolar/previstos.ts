/**
 * Las cuotas del plan que TODAVÍA no son cargo.
 *
 * El calendario del concepto dice qué va a salir, cuándo y por cuánto; el
 * devengo lo convierte en cargo cuando llega su día. Entre una cosa y la otra
 * hay meses que la pantalla tiene que enseñar —para eso está «Previsto»— pero
 * que no son deuda y no suman en ningún total de morosidad.
 *
 * Vive aquí, y no dentro de la ficha del alumno, porque la pantalla de la
 * familia enseña lo mismo de todos los hijos a la vez. Con una copia en cada
 * sitio, un mes ya facturado se seguiría anunciando como previsto en una de
 * las dos en cuanto la regla del descarte cambiara en la otra.
 *
 * Genérico en las reglas: se arrastran tal cual desde el concepto para poder
 * explicar la cuota sin volver a pedir nada, y el servidor no tiene por qué
 * conocer el tipo que usa el diálogo del cliente.
 */

export interface CuotaDelPlan {
  cuotaId: number;
  numero: number;
  mes: number | null;
  fechaEmision: string;
  fechaVencimiento: string | null;
  montoCentavos: number;
  /** Se emitió antes de que el alumno entrara: no se le va a cobrar. */
  omitida: boolean;
}

export interface LineaDelPlan<R> {
  conceptoId: number;
  nombre: string;
  tipo: string;
  cuotas: CuotaDelPlan[];
  reglas: R;
}

/** Lo mínimo de un cargo para saber si ya gastó su cuota. */
export interface CargoDevengado {
  conceptoId: number | null;
  cuotaId: number | null;
}

export interface PrevistoDelPlan<R> {
  key: string;
  /** 0 en un concepto sin calendario: esa cuota no se puede adelantar sola. */
  cuotaId: number;
  conceptoId: number;
  concepto: string;
  tipo: string;
  /** null en un concepto que se cobra de una vez y no cae en ningún mes. */
  mes: number | null;
  anio: number;
  fechaEmision: string;
  fechaVencimiento: string | null;
  montoCentavos: number;
  reglas: R;
}

export function previstosDelPlan<R>(
  lineas: LineaDelPlan<R>[],
  cargos: CargoDevengado[],
): PrevistoDelPlan<R>[] {
  const cuotasGastadas = new Set(
    cargos.map((c) => c.cuotaId).filter((v): v is number => v != null),
  );
  // Un concepto sin calendario no tiene cuota que tachar, así que se tacha
  // entero en cuanto exista un cargo suyo.
  const conceptosSinCuota = new Set(
    cargos.filter((c) => c.cuotaId == null).map((c) => c.conceptoId),
  );

  const out: PrevistoDelPlan<R>[] = [];
  for (const linea of lineas) {
    for (const cuota of linea.cuotas) {
      if (cuota.omitida) continue;
      const yaEsta = cuota.cuotaId > 0
        ? cuotasGastadas.has(cuota.cuotaId)
        : conceptosSinCuota.has(linea.conceptoId);
      if (yaEsta) continue;
      out.push({
        key: cuota.cuotaId > 0 ? `q${cuota.cuotaId}` : `n${linea.conceptoId}-${cuota.numero}`,
        cuotaId: cuota.cuotaId,
        conceptoId: linea.conceptoId,
        concepto: linea.nombre,
        tipo: linea.tipo,
        mes: cuota.mes,
        // El año sale de la EMISIÓN, igual que en el devengo: el del
        // vencimiento saltaría de año en la cuota de diciembre de un concepto
        // con plazo, y esa cuota aparecería en el período siguiente.
        anio: Number(cuota.fechaEmision.slice(0, 4)),
        fechaEmision: cuota.fechaEmision,
        fechaVencimiento: cuota.fechaVencimiento,
        montoCentavos: cuota.montoCentavos,
        reglas: linea.reglas,
      });
    }
  }
  return out;
}
