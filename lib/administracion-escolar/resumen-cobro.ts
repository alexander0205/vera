/**
 * Las cuatro cifras de cobro de un alumno o una familia: Vencido, Próximo
 * pago, Falta del año y Pagado.
 *
 * Las fichas decían «Facturado», «Pendiente», «Pendiente anualidad», «Deuda
 * escolar», «Por facturar»… cada una con su propia cuenta, y ninguna decía lo
 * único que se pregunta al mirar: ¿esto ya se debe o todavía no? «Pendiente»
 * juntaba lo vencido con las cuotas de junio, y «Facturado» sumaba cargos que
 * nadie había facturado.
 *
 * Ahora las cuatro pantallas (ficha de familia, panel de Responsables, panel de
 * Matriculación y panel de Estudiantes) parten el mismo dinero con la misma
 * regla, por la FECHA EN QUE VENCE cada cosa:
 *
 *   · Vencido      — pasó su fecha y no se ha pagado.
 *   · Próximo pago — lo que vence ahora: el mes de la fecha más cercana.
 *   · Falta del año — las cuotas de los meses que vienen; aún no se deben.
 *   · Pagado       — lo cobrado.
 *
 * Que esté facturado o no es un paso interno del cobro y va como detalle: una
 * cuota vencida sin factura sigue vencida para la familia, y lo que toca con
 * ella es emitirla.
 *
 * No importa nada de la base: lo usan el servidor y el navegador.
 */

export interface PartidaCobro {
  /** Lo que falta por pagar de esta partida. */
  saldoCentavos: number;
  /** Lo que valía. Con él se sabe cuánto se pagó; sin él no suma a «Pagado». */
  montoCentavos?: number;
  /** `yyyy-MM-dd`: el día que vence. `null` = sin fecha límite: se paga ya. */
  vence: string | null;
  /** Ya tiene factura emitida. */
  facturada?: boolean;
  /** Factura que no viene de un cargo del colegio. */
  ajena?: boolean;
}

export interface ResumenCobro {
  /** Pagado + todo lo que falta: lo que se cobra en el año. */
  totalCentavos: number;
  pagadoCentavos: number;
  vencido: {
    centavos: number;
    partidas: number;
    /** La fecha más vieja de lo vencido. */
    desde: string | null;
    /** De lo vencido, lo que todavía no tiene factura: hay que emitirla. */
    sinFacturaCentavos: number;
    /** De lo vencido, lo que es de facturas de fuera del colegio. */
    ajenoCentavos: number;
  };
  proximo: {
    centavos: number;
    partidas: number;
    /** El día que vence lo próximo. `null` si lo próximo no tiene fecha. */
    fecha: string | null;
  };
  falta: {
    centavos: number;
    partidas: number;
    desde: string | null;
    hasta: string | null;
  };
}

/**
 * Parte las partidas en vencido / próximo / falta del año.
 *
 * «Próximo pago» es todo lo del MES de la fecha más cercana, no solo lo de ese
 * día: la colegiatura y el transporte de noviembre vencen en días distintos y
 * los dos son el pago de noviembre.
 *
 * `pagadoExtraCentavos` es lo cobrado que no sale de las partidas (pagos de
 * facturas que no se pasan como partida).
 */
export function resumirCobro(partidas: PartidaCobro[], hoy: string, pagadoExtraCentavos = 0): ResumenCobro {
  const vivas = partidas.filter((p) => p.saldoCentavos > 0);
  const vencidas = vivas.filter((p) => p.vence != null && p.vence < hoy);
  const enPlazo = vivas.filter((p) => p.vence == null || p.vence >= hoy);

  const fechas = enPlazo.map((p) => p.vence).filter((v): v is string => v != null).sort();
  const fecha = fechas[0] ?? null;
  const mes = fecha?.slice(0, 7) ?? null;
  // Sin fecha límite se paga ya: es del próximo pago, no del resto del año.
  const proximas = enPlazo.filter((p) => p.vence == null || p.vence.slice(0, 7) === mes);
  const despues = enPlazo.filter((p) => p.vence != null && p.vence.slice(0, 7) !== mes);

  const suma = (xs: PartidaCobro[]) => xs.reduce((s, p) => s + p.saldoCentavos, 0);
  const fechasDespues = despues.map((p) => p.vence as string).sort();
  const pagado = partidas.reduce((s, p) =>
    s + (p.montoCentavos != null ? Math.max(0, p.montoCentavos - Math.max(0, p.saldoCentavos)) : 0), 0)
    + pagadoExtraCentavos;
  const debe = suma(vivas);

  return {
    totalCentavos: pagado + debe,
    pagadoCentavos: pagado,
    vencido: {
      centavos: suma(vencidas),
      partidas: vencidas.length,
      desde: vencidas.map((p) => p.vence as string).sort()[0] ?? null,
      sinFacturaCentavos: suma(vencidas.filter((p) => !p.facturada)),
      ajenoCentavos: suma(vencidas.filter((p) => p.ajena)),
    },
    proximo: { centavos: suma(proximas), partidas: proximas.length, fecha },
    falta: {
      centavos: suma(despues),
      partidas: despues.length,
      desde: fechasDespues[0] ?? null,
      hasta: fechasDespues[fechasDespues.length - 1] ?? null,
    },
  };
}

/**
 * Las partidas de una familia, tal como las trae su detalle
 * (`/api/administracion-escolar/responsables/[id]`): los cargos de sus hijos y
 * sus facturas sin cargo detrás (las sueltas y las notas de mora). La ficha
 * completa y el panel de Responsables cuentan con esto, así dicen lo mismo.
 */
export function partidasDeFamilia(d: {
  cargos: { saldoCentavos: number; montoCentavos: number; fechaVencimiento: string | null; ecfDocumentId: number | null; estado: string }[];
  facturas: { saldoCentavos: number; montoTotal: number; vence: string; esMora: boolean }[];
}): PartidaCobro[] {
  return [
    ...d.cargos.filter((g) => g.estado !== 'anulado').map((g) => ({
      saldoCentavos: g.saldoCentavos, montoCentavos: g.montoCentavos,
      vence: g.fechaVencimiento, facturada: g.ecfDocumentId != null,
    })),
    ...d.facturas.map((f) => ({
      saldoCentavos: f.saldoCentavos, montoCentavos: f.montoTotal,
      vence: f.vence, facturada: true,
      // La mora es recargo de una factura del colegio; las sueltas, no.
      ajena: !f.esMora,
    })),
  ];
}
