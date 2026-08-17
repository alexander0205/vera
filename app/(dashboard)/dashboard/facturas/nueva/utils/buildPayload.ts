import type { Cliente, ItemLinea, Retencion } from './types';
import { tasaToFloat } from './calculos';
import type { PagoLinea } from '@/components/pagos/PagoMetodos';

export interface BuildPayloadInput {
  modo: 'emitir' | 'borrador';
  tipoEcf: string;
  fechaEmision: string;
  clienteSeleccionado: Cliente | null;
  rncManual: string;
  rncManualNombre: string;
  emailManual: string;
  /** Condición de pago DGII: 1=contado, 2=crédito, 3=gratuito, 4=uso. */
  tipoPago: number;
  fechaLimitePago: string;
  ncfModificado: string;
  /** Código de modificación (1..5) — solo tipos 33, 34. Vacío cuando no aplica. */
  codigoModificacion?: string;
  /** Fecha del NCF original que se modifica (YYYY-MM-DD) — solo tipos 33, 34. */
  fechaNcfModificado?: string;
  /** Razón de la modificación (texto libre, opcional) — solo tipos 33, 34. */
  razonModificacion?: string;
  /** Id del documento padre (flujo "crear nota desde factura") — tipos 33, 34. */
  origenDocumentoId?: number | null;
  /** Tipo de ingresos (1..6) — tipos 31, 32, 44, 45, 46. Default '1'. */
  tipoIngresos?: string;
  items: ItemLinea[];
  retenciones: Retencion[];
  notas: string;
  terminosCondiciones: string;
  pieFactura: string;
  comentario: string;
  pagoRecibido: boolean;
  pagoFecha: string;
  /** Líneas de pago (1 línea = pago normal; más de 1 = pago dividido). */
  pagoLineas?: PagoLinea[];
  almacenId: number | null;
  listaPreciosId: number | null;
  vendedorId: number | null;
  /** Campos operativos del registro de gasto; no se mandan al XML DGII. */
  categoriaGasto?: string;
  ncfProveedor?: string;
  fechaGasto?: string;
  /** ID del borrador existente — indica al API que haga UPDATE en vez de INSERT */
  borradorId?: number | null;
}

export function buildPayload(input: BuildPayloadInput) {
  const {
    modo, tipoEcf, fechaEmision, clienteSeleccionado, rncManual, rncManualNombre,
    emailManual, tipoPago, fechaLimitePago, ncfModificado, items,
    codigoModificacion, fechaNcfModificado, razonModificacion, origenDocumentoId, tipoIngresos,
    retenciones, notas, terminosCondiciones, pieFactura, comentario,
    pagoRecibido, pagoLineas = [], pagoFecha,
    almacenId, listaPreciosId, vendedorId, borradorId, categoriaGasto, ncfProveedor, fechaGasto,
  } = input;

  // ── Pago: 1 línea = pago single; 2+ líneas con valor = pago dividido ────────
  // Las líneas válidas (valor > 0). El endpoint de emisión acepta `pagos` como
  // array { metodo, valor } (split, vía registrarPagosSplit) o los campos single
  // pagoMetodo/pagoCuenta/pagoValor (vía registrarPago).
  const lineasValidas = pagoLineas
    .map(l => ({
      metodo: l.metodo,
      valor:  parseFloat(l.valor || '0') || 0,
      cuenta: l.cuenta?.trim() || '',
    }))
    .filter(l => l.valor > 0);
  const usarSplit = pagoRecibido && lineasValidas.length > 1;
  const pagosArray = usarSplit
    ? lineasValidas.map(l => ({ metodo: l.metodo, valor: l.valor }))
    : [];
  // En modo single tomamos la primera línea válida (o la primera si ninguna tiene valor).
  const single = lineasValidas[0] ?? {
    metodo: pagoLineas[0]?.metodo ?? 'efectivo',
    valor:  0,
    cuenta: pagoLineas[0]?.cuenta?.trim() || '',
  };
  const pagoMetodo = single.metodo;
  const pagoCuenta = single.cuenta;
  const pagoValor  = single.valor > 0 ? single.valor.toFixed(2) : '';

  const rncFinal   = clienteSeleccionado?.rnc ?? rncManual;
  const razonFinal = clienteSeleccionado?.razonSocial ?? rncManualNombre;
  const emailFinal = clienteSeleccionado?.email ?? emailManual;

  // ── Resumen denormalizado de beneficiarios para nivel factura ──────────────
  const itemsConBenef = items.filter(i => i.nombreItem.trim() && i.dependienteId);
  let dependienteIdResumen: number | undefined;
  let dependienteNombreResumen: string | undefined;
  if (itemsConBenef.length > 0) {
    const nombresUnicos = [...new Set(itemsConBenef.map(i => i.dependienteNombre ?? '').filter(Boolean))];
    const idsUnicas     = [...new Set(itemsConBenef.map(i => i.dependienteId!))];
    if (idsUnicas.length === 1) {
      dependienteIdResumen     = idsUnicas[0];
      dependienteNombreResumen = nombresUnicos[0];
    } else {
      dependienteIdResumen     = undefined;
      dependienteNombreResumen = `Varios (${idsUnicas.length})`;
    }
  }

  return {
    modo,
    tipoEcf,
    fechaEmision,
    rncComprador:         rncFinal    || undefined,
    razonSocialComprador: razonFinal  || undefined,
    emailComprador:       emailFinal  || undefined,
    tipoPago,
    fechaLimitePago:      fechaLimitePago || undefined,
    ncfModificado:        ncfModificado || undefined,
    codigoModificacion:   (ncfModificado && codigoModificacion) ? Number(codigoModificacion) : undefined,
    fechaNcfModificado:   (ncfModificado && fechaNcfModificado) ? fechaNcfModificado : undefined,
    razonModificacion:    razonModificacion?.trim() || undefined,
    origenDocumentoId:    origenDocumentoId ?? undefined,
    tipoIngresos:         tipoIngresos ? Number(tipoIngresos) : undefined,
    items: items
      .filter(i => i.nombreItem.trim() && i.cantidadItem > 0 && i.precioUnitarioItem > 0)
      .map((item) => {
        const base = item.precioUnitarioItem * item.cantidadItem;
        const descuentoMonto = base * (item.descuentoPct / 100);
        return {
          nombreItem:             item.nombreItem,
          descripcionItem:        item.descripcionItem || undefined,
          cantidadItem:           item.cantidadItem,
          precioUnitarioItem:     item.precioUnitarioItem,
          descuentoMonto:         item.descuentoPct > 0 ? descuentoMonto : undefined,
          tasaItbis:              tasaToFloat(item.tasaItbis),
          indicadorBienoServicio: parseInt(item.indicadorBienoServicio) as 1 | 2,
          // Control de inventario — sin esto el backend no puede descontar stock
          // (ver lib/inventario/descuento.ts: filtra por productoId > 0).
          productoId:             item.productoId ?? undefined,
          // Variante vendida — el descuento pega a la variante (no al producto plano).
          variantId:              item.variantId ?? undefined,
          // Beneficiario por línea — el backend valida items[].dependienteId.
          dependienteId:          item.dependienteId ?? undefined,
          dependienteNombre:      item.dependienteNombre || undefined,
        };
      }),
    // Campos extra
    retenciones:         retenciones.length ? retenciones : undefined,
    notas:               notas.trim()               || undefined,
    terminosCondiciones: terminosCondiciones.trim()  || undefined,
    pieFactura:          pieFactura.trim()            || undefined,
    comentario:          comentario.trim()            || undefined,
    // Pago recibido
    // Modo split: emitir `pagos` + pagoRecibido=true, dejar single fields undefined
    // (el backend usa `pagos` y registrarPagosSplit, ignorando los single).
    pagoRecibido: (pagoRecibido || usarSplit) || undefined,
    pagoMetodo:   (pagoRecibido && !usarSplit) ? pagoMetodo : undefined,
    pagoCuenta:   (pagoRecibido && !usarSplit) ? pagoCuenta : undefined,
    pagoValor:    (pagoRecibido && !usarSplit && pagoValor) ? parseFloat(pagoValor) : undefined,
    pagoFecha:    (pagoRecibido || usarSplit) ? pagoFecha : undefined,
    pagos:        usarSplit ? pagosArray : undefined,
    // Top section
    almacenId:      almacenId      || undefined,
    listaPreciosId: listaPreciosId || undefined,
    vendedorId:     vendedorId     || undefined,
    categoriaGasto: categoriaGasto?.trim() || undefined,
    ncfProveedor:   ncfProveedor?.trim() || undefined,
    fechaGasto:     fechaGasto || undefined,
    // Dependiente resumen — denormalizado a nivel factura (resumen de los beneficiarios por línea)
    dependienteId:     dependienteIdResumen,
    dependienteNombre: dependienteNombreResumen,
    // Para editar borradores
    borradorId: borradorId ?? undefined,
    clientId:   clienteSeleccionado?.id ?? undefined,
    lineasJson: JSON.stringify(
      items.filter(i => i.nombreItem.trim()).map(i => ({
        nombreItem:             i.nombreItem,
        descripcionItem:        i.descripcionItem,
        cantidadItem:           i.cantidadItem,
        precioUnitarioItem:     i.precioUnitarioItem,
        descuentoPct:           i.descuentoPct,
        tasaItbis:              i.tasaItbis,
        indicadorBienoServicio: i.indicadorBienoServicio,
        unidadMedida:           i.unidadMedida,
        referencia:             i.referencia,
        productoId:             i.productoId,
        variantId:              i.variantId ?? null,
        variantNombre:          i.variantNombre ?? null,
        dependienteId:          i.dependienteId ?? null,
        dependienteNombre:      i.dependienteNombre ?? '',
      }))
    ),
  };
}
