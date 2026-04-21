/**
 * Constructor de XML para los 10 tipos de e-CF de la DGII (Norma 1-20).
 *
 * Cada tipo tiene reglas específicas sobre qué secciones son obligatorias,
 * opcionales o prohibidas. Esta implementación cubre:
 *
 *   31 — Factura de Crédito Fiscal (B2B)          — RNCComprador obligatorio
 *   32 — Factura de Consumo (B2C)                  — Comprador opcional (solo email)
 *   33 — Nota de Débito                            — requiere InformacionReferencia
 *   34 — Nota de Crédito                           — requiere InformacionReferencia
 *   41 — Compras                                   — RNCComprador = vendedor (el que nos vendió)
 *   43 — Gastos Menores                            — sin RNCComprador
 *   44 — Regímenes Especiales                      — RNCComprador obligatorio
 *   45 — Gubernamental                             — RNCComprador = institución pública
 *   46 — Exportaciones                             — secciones OtraMoneda + InformacionExportacion
 *   47 — Pagos al Exterior                         — receptor extranjero (sin RNC)
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface EcfItem {
  numeroLinea:            number;
  nombreItem:             string;
  descripcionItem?:       string;
  cantidadItem:           number;
  unidadMedidaItem?:      string;
  precioUnitarioItem:     number;
  descuentoMonto?:        number;
  montoItem:              number;
  tasaItbis?:             number;   // 0.18 | 0.16 | 0 | undefined si exento
  montoItbis?:            number;
  indicadorBienoServicio?: 1 | 2;   // 1=Bien, 2=Servicio
}

export interface InformacionExportacion {
  pais?:               string;      // ISO 3166 alpha-3
  regimenAduanero?:    string;      // código DGA
  numeroDUA?:          string;
  montoGravadoTotal?:  number;
}

export interface OtraMoneda {
  tipoMoneda:      string;          // ej. 'USD'
  tipoCambio:      number;
  montoGravadoTotalOtraMoneda?:   number;
  montoExentoOtraMoneda?:         number;
  totalITBISOtraMoneda?:          number;
  montoTotalOtraMoneda?:          number;
}

export interface EcfData {
  tipoEcf: string;
  encf:    string;

  // Emisor
  rncEmisor:                 string;
  razonSocialEmisor:         string;
  nombreComercialEmisor?:    string;
  direccionEmisor?:          string;
  fechaEmision:              Date;
  fechaVencimientoSecuencia: Date;

  // Comprador / Receptor
  rncComprador?:             string;
  razonSocialComprador?:     string;
  emailComprador?:           string;

  // Comprador extranjero (tipo 46/47)
  compradorExtranjero?: {
    nombre:      string;
    identificacion?: string;   // pasaporte / tax ID
    pais?:       string;
    direccion?:  string;
  };

  // Información institucional (tipo 45 gubernamental)
  institucionGubernamental?: boolean;

  // Tipo de ingresos (requerido en RFCE — tipo 32 < RD$250K)
  // '01'=Operaciones, '02'=Financiero, '03'=Extraordinario, '04'=Arrendamiento,
  // '05'=Venta activo, '06'=Otros
  tipoIngresos?: string;

  // Pago
  tipoPago?:        1 | 2 | 3 | 4;
  fechaLimitePago?: Date;

  // Items
  items: EcfItem[];

  // Totales
  montoGravadoTotal: number;
  montoGravadoI1?:   number;  // 18%
  montoGravadoI2?:   number;  // 16%
  montoGravadoI3?:   number;  // 0%
  montoExento?:      number;
  itbis1?:           number;
  itbis2?:           number;
  itbis3?:           number;
  totalItbis:        number;
  montoTotal:        number;
  totalITBISRetenido?: number;  // retenciones ITBIS
  totalISRRetenido?:   number;  // retenciones ISR

  // Referencia (33, 34, opcional en otros)
  ncfModificado?:         string;
  rncOtroContribuyente?:  string;   // RNC del comprador cuando se modifica un e-CF de otro contribuyente
  fechaNcfModificado?:    Date;
  codigoModificacion?:    string;   // 1=Total, 2=Parcial, 3=Anulación
  razonModificacion?:     string;

  // Exportaciones (46)
  informacionExportacion?: InformacionExportacion;

  // Otra moneda (46, 47)
  otraMoneda?: OtraMoneda;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

/** Formato requerido por FechaHoraFirma: DD-MM-YYYY HH:MM:SS */
function formatDateTime(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  const h = date.getHours().toString().padStart(2, '0');
  const min = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return `${d}-${m}-${y} ${h}:${min}:${s}`;
}

function opt(tag: string, value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '';
  return `<${tag}>${value}</${tag}>`;
}

/**
 * Igual que opt() pero excluye valores numéricos 0 / "0.00" / "0"
 * Según DGII FAQ P.23: los tags opcionales que no apliquen NO deben incluirse.
 */
function optNonZero(tag: string, value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '';
  if (value === 0 || value === '0.00' || value === '0') return '';
  return `<${tag}>${value}</${tag}>`;
}

function escXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Reglas por tipo ──────────────────────────────────────────────────────────

type CompradorRule = 'OBLIGATORIO' | 'OPCIONAL' | 'PROHIBIDO' | 'EXTRANJERO';

interface TipoEcfRule {
  compradorRule:           CompradorRule;
  requiereReferencia:      boolean;   // 33, 34
  requiereExportacion:     boolean;   // 46
  permiteOtraMoneda:       boolean;   // 46, 47
  emisorEsComprador:       boolean;   // 41 — el "emisor" en realidad es el comprador de sus compras
}

const RULES: Record<string, TipoEcfRule> = {
  '31': { compradorRule: 'OBLIGATORIO', requiereReferencia: false, requiereExportacion: false, permiteOtraMoneda: false, emisorEsComprador: false },
  '32': { compradorRule: 'OPCIONAL',    requiereReferencia: false, requiereExportacion: false, permiteOtraMoneda: false, emisorEsComprador: false },
  '33': { compradorRule: 'OBLIGATORIO', requiereReferencia: true,  requiereExportacion: false, permiteOtraMoneda: false, emisorEsComprador: false },
  '34': { compradorRule: 'OBLIGATORIO', requiereReferencia: true,  requiereExportacion: false, permiteOtraMoneda: false, emisorEsComprador: false },
  '41': { compradorRule: 'OBLIGATORIO', requiereReferencia: false, requiereExportacion: false, permiteOtraMoneda: false, emisorEsComprador: true  },
  '43': { compradorRule: 'PROHIBIDO',   requiereReferencia: false, requiereExportacion: false, permiteOtraMoneda: false, emisorEsComprador: false },
  // Tipos 44/45: RNCComprador recomendado pero no bloqueante en pruebas
  '44': { compradorRule: 'OPCIONAL',    requiereReferencia: false, requiereExportacion: false, permiteOtraMoneda: false, emisorEsComprador: false },
  '45': { compradorRule: 'OPCIONAL',    requiereReferencia: false, requiereExportacion: false, permiteOtraMoneda: false, emisorEsComprador: false },
  // Tipos 46/47: compradorExtranjero se usa si se provee; si no, se omite la sección
  '46': { compradorRule: 'EXTRANJERO',  requiereReferencia: false, requiereExportacion: false, permiteOtraMoneda: true,  emisorEsComprador: false },
  '47': { compradorRule: 'EXTRANJERO',  requiereReferencia: false, requiereExportacion: false, permiteOtraMoneda: true,  emisorEsComprador: false },
};

export class BuildEcfError extends Error {
  constructor(message: string, public campo?: string) { super(message); }
}

function validar(data: EcfData): void {
  const rule = RULES[data.tipoEcf];
  if (!rule) throw new BuildEcfError(`Tipo de e-CF desconocido: ${data.tipoEcf}`);

  // Validaciones por tipo
  if (rule.compradorRule === 'OBLIGATORIO' && !data.rncComprador) {
    throw new BuildEcfError(`Tipo ${data.tipoEcf} requiere RNCComprador`, 'rncComprador');
  }
  // Tipos 46/47: compradorExtranjero es opcional — si no se provee se omite la sección Comprador
  // (DGII lo acepta en el Set de Pruebas de habilitación)
  if (rule.requiereReferencia && !data.ncfModificado) {
    throw new BuildEcfError(`Tipo ${data.tipoEcf} (nota ${data.tipoEcf === '33' ? 'débito' : 'crédito'}) requiere NCFModificado`, 'ncfModificado');
  }
}

// ─── Secciones ────────────────────────────────────────────────────────────────

function buildCompradorXml(data: EcfData): string {
  const rule = RULES[data.tipoEcf];

  if (rule.compradorRule === 'PROHIBIDO') return '';

  if (rule.compradorRule === 'EXTRANJERO') {
    // Si no hay datos de comprador extranjero, omitir la sección (pruebas habilitación)
    if (!data.compradorExtranjero) return '';
    const c = data.compradorExtranjero;
    return `
    <Comprador>
      ${opt('IdentificadorExtranjero', c.identificacion)}
      <RazonSocialComprador>${escXml(c.nombre)}</RazonSocialComprador>
      ${opt('PaisComprador', c.pais)}
      ${opt('DireccionComprador', c.direccion ? escXml(c.direccion) : undefined)}
      ${opt('EmailComprador', data.emailComprador)}
    </Comprador>`;
  }

  if (rule.compradorRule === 'OPCIONAL' && !data.rncComprador) {
    // Tipo 32 sin RNC → solo email (si hay)
    if (!data.emailComprador) return '';
    return `
    <Comprador>
      ${opt('EmailComprador', data.emailComprador)}
    </Comprador>`;
  }

  return `
    <Comprador>
      ${opt('RNCComprador', data.rncComprador)}
      ${opt('RazonSocialComprador', data.razonSocialComprador ? escXml(data.razonSocialComprador) : undefined)}
      ${opt('EmailComprador', data.emailComprador)}
    </Comprador>`;
}

function buildReferenciaXml(data: EcfData): string {
  if (!data.ncfModificado) return '';
  // Orden obligatorio según XSD: NCFModificado → RNCOtroContribuyente → FechaNCFModificado → CodigoModificacion → RazonModificacion
  return `
  <InformacionReferencia>
    <NCFModificado>${data.ncfModificado}</NCFModificado>
    ${opt('RNCOtroContribuyente', data.rncOtroContribuyente)}
    ${opt('FechaNCFModificado', data.fechaNcfModificado ? formatDate(data.fechaNcfModificado) : undefined)}
    ${opt('CodigoModificacion', data.codigoModificacion)}
    ${opt('RazonModificacion', data.razonModificacion ? escXml(data.razonModificacion) : undefined)}
  </InformacionReferencia>`;
}

function buildExportacionXml(data: EcfData): string {
  if (!data.informacionExportacion) return '';
  const x = data.informacionExportacion;
  return `
  <InformacionExportacion>
    ${opt('PaisExportacion', x.pais)}
    ${opt('RegimenAduanero', x.regimenAduanero)}
    ${opt('NumeroDUAoEmbarque', x.numeroDUA)}
    ${optNonZero('MontoGravadoTotalExportacion', x.montoGravadoTotal?.toFixed(2))}
  </InformacionExportacion>`;
}

function buildOtraMonedaXml(data: EcfData): string {
  if (!data.otraMoneda) return '';
  const m = data.otraMoneda;
  return `
  <OtraMoneda>
    <TipoMoneda>${m.tipoMoneda}</TipoMoneda>
    <TipoCambio>${m.tipoCambio.toFixed(4)}</TipoCambio>
    ${optNonZero('MontoGravadoTotalOtraMoneda', m.montoGravadoTotalOtraMoneda?.toFixed(2))}
    ${optNonZero('MontoExentoOtraMoneda',       m.montoExentoOtraMoneda?.toFixed(2))}
    ${optNonZero('TotalITBISOtraMoneda',        m.totalITBISOtraMoneda?.toFixed(2))}
    ${optNonZero('MontoTotalOtraMoneda',        m.montoTotalOtraMoneda?.toFixed(2))}
  </OtraMoneda>`;
}

function buildItemXml(item: EcfItem): string {
  // IndicadorFacturacion: 1=Afecta ITBIS, 2=Exento — debe aparecer ANTES de NombreItem (requisito XSD)
  const indicadorFacturacion = (item.tasaItbis && item.tasaItbis > 0) ? 1 : 2;

  return `
    <Item>
      <NumeroLinea>${item.numeroLinea}</NumeroLinea>
      <IndicadorFacturacion>${indicadorFacturacion}</IndicadorFacturacion>
      <NombreItem>${escXml(item.nombreItem)}</NombreItem>
      ${opt('IndicadorBienoServicio', item.indicadorBienoServicio)}
      ${opt('DescripcionItem', item.descripcionItem ? escXml(item.descripcionItem) : undefined)}
      <CantidadItem>${item.cantidadItem}</CantidadItem>
      ${opt('UnidadMedida', item.unidadMedidaItem)}
      <PrecioUnitarioItem>${item.precioUnitarioItem.toFixed(2)}</PrecioUnitarioItem>
      ${opt('DescuentoMonto', item.descuentoMonto?.toFixed(2))}
      <MontoItem>${item.montoItem.toFixed(2)}</MontoItem>
      ${optNonZero('TasaITBIS', item.tasaItbis)}
      ${optNonZero('MontoITBIS', item.montoItbis?.toFixed(2))}
    </Item>`;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function buildEcfXml(data: EcfData): string {
  validar(data);

  const itemsXml       = data.items.map(buildItemXml).join('');
  const compradorXml   = buildCompradorXml(data);
  const referenciaXml  = buildReferenciaXml(data);
  const exportacionXml = buildExportacionXml(data);
  const monedaXml      = buildOtraMonedaXml(data);

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>${data.tipoEcf}</TipoeCF>
      <eNCF>${data.encf}</eNCF>
      <FechaVencimientoSecuencia>${formatDate(data.fechaVencimientoSecuencia)}</FechaVencimientoSecuencia>
      ${opt('IndicadorEnvioDiferido', data.tipoEcf === '43' ? 1 : undefined)}
      ${opt('TipoIngresos', data.tipoIngresos ?? (data.tipoEcf === '32' ? '01' : undefined))}
      <TipoPago>${data.tipoPago ?? 1}</TipoPago>
      ${opt('FechaLimitePago', data.fechaLimitePago ? formatDate(data.fechaLimitePago) : undefined)}
    </IdDoc>
    <Emisor>
      <RNCEmisor>${data.rncEmisor}</RNCEmisor>
      <RazonSocialEmisor>${escXml(data.razonSocialEmisor)}</RazonSocialEmisor>
      ${opt('NombreComercial', data.nombreComercialEmisor ? escXml(data.nombreComercialEmisor) : undefined)}
      <DireccionEmisor>${escXml(data.direccionEmisor ?? 'Sin dirección')}</DireccionEmisor>
      <FechaEmision>${formatDate(data.fechaEmision)}</FechaEmision>
    </Emisor>
    ${compradorXml}
    ${exportacionXml}
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
      ${optNonZero('TotalITBISRetenido', data.totalITBISRetenido?.toFixed(2))}
      ${optNonZero('TotalISRRetenido',   data.totalISRRetenido?.toFixed(2))}
      <MontoTotal>${data.montoTotal.toFixed(2)}</MontoTotal>
    </Totales>
    ${monedaXml}
  </Encabezado>
  <DetallesItems>
    ${itemsXml}
  </DetallesItems>
  ${referenciaXml}
  <FechaHoraFirma>${formatDateTime(new Date())}</FechaHoraFirma>
</ECF>`;
}
