/**
 * Qué hacer con las mensualidades de UNA matrícula cuando se cambia su
 * mensualidad («Configuración mensual»: otra generación, un monto propio o un
 * descuento). Sin base de datos: la ruta lee, esto decide, la ruta escribe.
 *
 * Antes la ruta creaba un cargo por mes del recurrente, vencido el día 5 y sin
 * `cuota_id`, y solo miraba los cargos del concepto NUEVO. Tres agujeros, los
 * tres vistos en Mi Casita (Keiry, 6.000 → 8.000):
 *
 *  - Sin `cuota_id` la ficha no sabe que el cargo ES la cuota del calendario y
 *    enseña además el «Previsto» del mismo mes: el doble de deuda en pantalla.
 *    El devengo, por su lado, solo frena por mes los cargos manuales: el
 *    vencimiento quedaba el 5 en vez de emisión + días para pagar.
 *  - El mes que ya tenía cargo con la generación VIEJA se quedaba vivo y se le
 *    sumaba otro con la nueva: el mismo mes cobrado dos veces.
 *  - Los cargos pendientes del mismo concepto se quedaban al precio viejo.
 *
 * La regla, mes a mes del calendario:
 *  - Ya hay cargo de esta mensualidad → se reutiliza: se ata a la cuota si no lo
 *    estaba y, si nadie lo ha tocado (sin factura ni pagos), toma el precio nuevo.
 *  - Hay cargo de OTRA mensualidad (la generación vieja):
 *      · sin factura (o con la factura ya anulada) y sin pagos → se anula y
 *        se crea el nuevo;
 *      · con factura viva o pagos → NO se crea el nuevo y se avisa. Un cargo
 *        con factura no se toca desde aquí: decidir si esa factura se anula es
 *        de la secretaria (el formulario se lo ofrece si no tiene pagos).
 *        La cuota nueva de ese mes queda MARCADA con un cargo anulado: el
 *        devengo y el «Previsto» de la ficha cuentan un anulado como cuota
 *        gastada, así que no la vuelven a crear ni a anunciar. Sin la marca,
 *        el devengo le habría creado ese mes otra vez: el doble cobro de Keiry.
 *  - No hay nada → se crea, atado a la cuota y con su vencimiento.
 */

export interface CuotaObjetivo {
  /** 0 = el concepto no tiene calendario (cargo suelto por mes). */
  cuotaId: number;
  mes: number;
  anio: number;
  montoCentavos: number;
  fechaVencimiento: string | null;
}

export interface CargoExistente {
  id: number;
  conceptoId: number;
  cuotaId: number | null;
  mes: number | null;
  anio: number | null;
  montoCentavos: number;
  saldoCentavos: number;
  estado: string;
  ecfDocumentId: number | null;
  /** Código visible de la factura, para el aviso. */
  facturaCodigo: string | null;
  /** La factura está anulada: ya no cobra nada, el cargo vuelve a estar libre. */
  facturaAnulada?: boolean;
  /** La factura tiene cobros registrados (no se puede anular sin revertirlos). */
  facturaConPagos?: boolean;
  tienePagos: boolean;
}

export interface MesBloqueado {
  mes: number;
  anio: number;
  cargoId: number;
  motivo: 'facturado' | 'con-pagos';
  ecfDocumentId: number | null;
  facturaCodigo: string | null;
  /** Se puede ofrecer anular la factura: está viva y nadie la ha pagado. */
  facturaAnulable: boolean;
}

export interface PlanSincronizacion {
  crear: CuotaObjetivo[];
  anular: number[];
  /** Cargos de esta mensualidad que se atan a su cuota y/o toman el precio nuevo. */
  actualizar: { id: number; cuotaId?: number; fechaVencimiento?: string | null; montoCentavos?: number }[];
  bloqueados: MesBloqueado[];
  /** Cuotas nuevas de los meses bloqueados: se marcan con un cargo anulado. */
  marcar: CuotaObjetivo[];
}

/** Ni factura viva ni dinero aplicado: se puede reescribir sin perder rastro. */
function intacto(c: CargoExistente): boolean {
  if (c.tienePagos || c.estado === 'pagado') return false;
  // Con la factura anulada el saldo puede haberse movido al sincronizar; lo
  // que cuenta es que no entró dinero.
  if (c.ecfDocumentId != null) return !!c.facturaAnulada;
  return c.saldoCentavos === c.montoCentavos;
}

export function planificarMensualidades(args: {
  conceptoId: number;
  objetivo: CuotaObjetivo[];
  /** Cargos vivos (no anulados) de conceptos de tipo mensualidad de la matrícula. */
  existentes: CargoExistente[];
}): PlanSincronizacion {
  const { conceptoId, objetivo } = args;
  const vivos = args.existentes.filter((c) => c.estado !== 'anulado');
  const plan: PlanSincronizacion = { crear: [], anular: [], actualizar: [], bloqueados: [], marcar: [] };
  const usados = new Set<number>();

  for (const cuota of objetivo) {
    const delMes = vivos.filter((c) => !usados.has(c.id) && (
      (cuota.cuotaId > 0 && c.cuotaId === cuota.cuotaId)
      || (c.mes === cuota.mes && c.anio === cuota.anio)
    ));

    const propio = delMes.find((c) => c.conceptoId === conceptoId);
    if (propio) {
      usados.add(propio.id);
      const cambio: PlanSincronizacion['actualizar'][number] = { id: propio.id };
      if (cuota.cuotaId > 0 && propio.cuotaId == null) {
        cambio.cuotaId = cuota.cuotaId;
        cambio.fechaVencimiento = cuota.fechaVencimiento;
      }
      if (intacto(propio) && propio.montoCentavos !== cuota.montoCentavos) {
        cambio.montoCentavos = cuota.montoCentavos;
      }
      if (Object.keys(cambio).length > 1) plan.actualizar.push(cambio);
      continue;
    }

    const ajenos = delMes.filter((c) => c.conceptoId !== conceptoId);
    const tocado = ajenos.find((c) => !intacto(c));
    if (tocado) {
      for (const c of ajenos) usados.add(c.id);
      const facturaViva = tocado.ecfDocumentId != null && !tocado.facturaAnulada;
      plan.bloqueados.push({
        mes: cuota.mes,
        anio: cuota.anio,
        cargoId: tocado.id,
        motivo: facturaViva ? 'facturado' : 'con-pagos',
        ecfDocumentId: facturaViva ? tocado.ecfDocumentId : null,
        facturaCodigo: facturaViva ? tocado.facturaCodigo : null,
        facturaAnulable: facturaViva && !tocado.tienePagos && !tocado.facturaConPagos,
      });
      if (cuota.cuotaId > 0) plan.marcar.push(cuota);
      continue;
    }
    for (const c of ajenos) { usados.add(c.id); plan.anular.push(c.id); }
    plan.crear.push(cuota);
  }

  return plan;
}

/** «septiembre 2026», para los avisos. */
export function nombreMes(mes: number, anio: number): string {
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${nombres[mes - 1] ?? mes} ${anio}`;
}
