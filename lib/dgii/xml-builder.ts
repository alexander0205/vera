/**
 * Constructor de XML para los distintos tipos de e-CF
 * Genera el XML base antes de la firma digital
 */

export interface EcfItem {
  numeroLinea: number;
  nombreItem: string;
  descripcionItem?: string;
  cantidadItem: number;
  unidadMedidaItem?: string;
  precioUnitarioItem: number;
  descuentoMonto?: number;
  montoItem: number;
  tasaItbis?: number;   // 0.18, 0.16, 0 o undefined si exento
  montoItbis?: number;
  indicadorBienoServicio?: 1 | 2;  // 1=Bien, 2=Servicio
}

export interface EcfData {
  // Tipo de comprobante
  tipoEcf: string;  // "31", "32", etc.
  encf: string;     // E310000000001

  // Emisor
  rncEmisor: string;
  razonSocialEmisor: string;
  nombreComercialEmisor?: string;
  direccionEmisor?: string;
  fechaEmision: Date;
  fechaVencimientoSecuencia: Date;

  // Comprador (opcional para tipo 32)
  rncComprador?: string;
  razonSocialComprador?: string;
  emailComprador?: string;

  // Tipo de pago
  tipoPago?: 1 | 2 | 3 | 4;  // 1=Contado, 2=Crédito, 3=Gratuito, 4=Uso o Consumo
  fechaLimitePago?: Date;

  // Items
  items: EcfItem[];

  // Totales (calculados)
  montoGravadoTotal: number;
  montoGravadoI1?: number;  // 18%
  montoGravadoI2?: number;  // 16%
  montoGravadoI3?: number;  // 0%
  montoExento?: number;
  itbis1?: number;
  itbis2?: number;
  itbis3?: number;
  totalItbis: number;
  montoTotal: number;

  // Referencia (para notas débito/crédito tipos 33, 34)
  ncfModificado?: string;
  fechaNcfModificado?: Date;
  codigoModificacion?: string;
}

function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

function opt(tag: string, value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '';
  return `<${tag}>${value}</${tag}>`;
}

/**
 * Igual que opt() pero excluye valores numéricos 0 / "0.00" / "0"
 * Según DGII FAQ P.23: los tags opcionales que no apliquen NO deben incluirse en el XML.
 */
function optNonZero(tag: string, value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '';
  if (value === 0 || value === '0.00' || value === '0') return '';
  return `<${tag}>${value}</${tag}>`;
}

export function buildEcfXml(data: EcfData): string {
  const itemsXml = data.items
    .map(
      (item) => `
    <Item>
      <NumeroLinea>${item.numeroLinea}</NumeroLinea>
      <NombreItem>${escXml(item.nombreItem)}</NombreItem>
      ${opt('IndicadorBienoServicio', item.indicadorBienoServicio)}
      ${opt('DescripcionItem', item.descripcionItem ? escXml(item.descripcionItem) : undefined)}
      <CantidadItem>${item.cantidadItem}</CantidadItem>
      ${opt('UnidadMedidaItem', item.unidadMedidaItem)}
      <PrecioUnitarioItem>${item.precioUnitarioItem.toFixed(2)}</PrecioUnitarioItem>
      ${opt('DescuentoMonto', item.descuentoMonto?.toFixed(2))}
      <MontoItem>${item.montoItem.toFixed(2)}</MontoItem>
      ${optNonZero('TasaITBIS', item.tasaItbis)}
      ${optNonZero('MontoITBIS', item.montoItbis?.toFixed(2))}
    </Item>`
    )
    .join('');

  const compradorXml =
    data.tipoEcf === '32'
      ? `
    <Comprador>
      ${opt('RNCComprador', data.rncComprador)}
      ${opt('RazonSocialComprador', data.razonSocialComprador ? escXml(data.razonSocialComprador) : undefined)}
      ${opt('EmailComprador', data.emailComprador)}
    </Comprador>`
      : data.rncComprador
      ? `
    <Comprador>
      <RNCComprador>${data.rncComprador}</RNCComprador>
      <RazonSocialComprador>${escXml(data.razonSocialComprador ?? '')}</RazonSocialComprador>
      ${opt('EmailComprador', data.emailComprador)}
    </Comprador>`
      : '';

  const referenciaXml = data.ncfModificado
    ? `
  <InformacionReferencia>
    <NCFModificado>${data.ncfModificado}</NCFModificado>
    ${opt('FechaNCFModificado', data.fechaNcfModificado ? formatDate(data.fechaNcfModificado) : undefined)}
    ${opt('CodigoModificacion', data.codigoModificacion)}
  </InformacionReferencia>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>${data.tipoEcf}</TipoeCF>
      <eNCF>${data.encf}</eNCF>
      <FechaVencimientoSecuencia>${formatDate(data.fechaVencimientoSecuencia)}</FechaVencimientoSecuencia>
      <TipoPago>${data.tipoPago ?? 1}</TipoPago>
      ${opt('FechaLimitePago', data.fechaLimitePago ? formatDate(data.fechaLimitePago) : undefined)}
      <MontoTotal>${data.montoTotal.toFixed(2)}</MontoTotal>
      <FechaEmision>${formatDate(data.fechaEmision)}</FechaEmision>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${data.rncEmisor}</RNCEmisor>
      <RazonSocialEmisor>${escXml(data.razonSocialEmisor)}</RazonSocialEmisor>
      ${opt('NombreComercialEmisor', data.nombreComercialEmisor ? escXml(data.nombreComercialEmisor) : undefined)}
      ${opt('DireccionEmisor', data.direccionEmisor ? escXml(data.direccionEmisor) : undefined)}
      <FechaEmision>${formatDate(data.fechaEmision)}</FechaEmision>
    </Emisor>
    ${compradorXml}
    <Totales>
      <MontoGravadoTotal>${data.montoGravadoTotal.toFixed(2)}</MontoGravadoTotal>
      ${optNonZero('MontoGravadoI1', data.montoGravadoI1?.toFixed(2))}
      ${optNonZero('MontoGravadoI2', data.montoGravadoI2?.toFixed(2))}
      ${optNonZero('MontoGravadoI3', data.montoGravadoI3?.toFixed(2))}
      ${optNonZero('MontoExento', data.montoExento?.toFixed(2))}
      ${optNonZero('ITBIS1', data.itbis1?.toFixed(2))}
      ${optNonZero('ITBIS2', data.itbis2?.toFixed(2))}
      ${optNonZero('ITBIS3', data.itbis3?.toFixed(2))}
      <TotalITBIS>${data.totalItbis.toFixed(2)}</TotalITBIS>
      <MontoTotal>${data.montoTotal.toFixed(2)}</MontoTotal>
    </Totales>
  </Encabezado>
  <DetallesItems>
    ${itemsXml}
  </DetallesItems>
  ${referenciaXml}
</ECF>`;
}

function escXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
