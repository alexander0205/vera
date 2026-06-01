import type { Cliente, ItemLinea, Plazo, Retencion } from './types';
import { PLAZOS_BASE } from './types';
import { tasaToFloat } from './calculos';

export interface BuildPayloadInput {
  modo: 'emitir' | 'borrador';
  tipoEcf: string;
  fechaEmision: string;
  clienteSeleccionado: Cliente | null;
  rncManual: string;
  rncManualNombre: string;
  emailManual: string;
  customPlazos: Plazo[];
  plazoId: string;
  fechaLimitePago: string;
  ncfModificado: string;
  /** Código de modificación (1..5) — solo tipos 33, 34. Vacío cuando no aplica. */
  codigoModificacion?: string;
  /** Fecha del NCF original que se modifica (YYYY-MM-DD) — solo tipos 33, 34. */
  fechaNcfModificado?: string;
  /** Tipo de ingresos (1..6) — tipos 31, 32, 44, 45, 46. Default '1'. */
  tipoIngresos?: string;
  items: ItemLinea[];
  retenciones: Retencion[];
  notas: string;
  terminosCondiciones: string;
  pieFactura: string;
  comentario: string;
  pagoRecibido: boolean;
  pagoMetodo: string;
  pagoCuenta: string;
  pagoValor: string;
  pagoFecha: string;
  almacenId: number | null;
  listaPreciosId: number | null;
  vendedorId: number | null;
  dependienteId?: number | null;
  dependienteNombre?: string | null;
}

export function buildPayload(input: BuildPayloadInput) {
  const {
    modo, tipoEcf, fechaEmision, clienteSeleccionado, rncManual, rncManualNombre,
    emailManual, customPlazos, plazoId, fechaLimitePago, ncfModificado, items,
    codigoModificacion, fechaNcfModificado, tipoIngresos,
    retenciones, notas, terminosCondiciones, pieFactura, comentario,
    pagoRecibido, pagoMetodo, pagoCuenta, pagoValor, pagoFecha,
    almacenId, listaPreciosId, vendedorId,
    dependienteId, dependienteNombre,
  } = input;

  const rncFinal   = clienteSeleccionado?.rnc ?? rncManual;
  const razonFinal = clienteSeleccionado?.razonSocial ?? rncManualNombre;
  const emailFinal = clienteSeleccionado?.email ?? emailManual;
  return {
    modo,
    tipoEcf,
    fechaEmision,
    rncComprador:         rncFinal    || undefined,
    razonSocialComprador: razonFinal  || undefined,
    emailComprador:       emailFinal  || undefined,
    tipoPago:             ([...PLAZOS_BASE, ...customPlazos].find(p => p.id === plazoId) ?? PLAZOS_BASE[0]).dgiiTipo,
    fechaLimitePago:      fechaLimitePago || undefined,
    ncfModificado:        ncfModificado || undefined,
    codigoModificacion:   (ncfModificado && codigoModificacion) ? Number(codigoModificacion) : undefined,
    fechaNcfModificado:   (ncfModificado && fechaNcfModificado) ? fechaNcfModificado : undefined,
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
        };
      }),
    // Campos extra
    retenciones:         retenciones.length ? retenciones : undefined,
    notas:               notas.trim()               || undefined,
    terminosCondiciones: terminosCondiciones.trim()  || undefined,
    pieFactura:          pieFactura.trim()            || undefined,
    comentario:          comentario.trim()            || undefined,
    // Pago recibido
    pagoRecibido: pagoRecibido || undefined,
    pagoMetodo:   pagoRecibido ? pagoMetodo    : undefined,
    pagoCuenta:   pagoRecibido ? pagoCuenta    : undefined,
    pagoValor:    pagoRecibido && pagoValor ? parseFloat(pagoValor) : undefined,
    pagoFecha:    pagoRecibido ? pagoFecha     : undefined,
    // Top section
    almacenId:      almacenId      || undefined,
    listaPreciosId: listaPreciosId || undefined,
    vendedorId:     vendedorId     || undefined,
    // Dependiente (metadato — no va al XML DGII)
    dependienteId:     dependienteId     ?? undefined,
    dependienteNombre: dependienteNombre ?? undefined,
    // Para editar borradores
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
      }))
    ),
  };
}
