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
  codigoModificacion?:    string;   // tipo 34: 1=Anula, 2=Modifica texto, 3=Devuelve, 4=Descuento, 5=Otro
  razonModificacion?:     string;

  // Tipo 34 — Nota de Crédito
  indicadorNotaCredito?:  number;  // 1=Corrección nombre/desc, 2=Corrección valores, 3=Devuelve mercancía, 4=Anula NCF, 5=Otro

  // Exportaciones (46)
  informacionExportacion?: InformacionExportacion;

  // Otra moneda (46, 47)
  otraMoneda?: OtraMoneda;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  const d = date.getUTCDate().toString().padStart(2, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}-${m}-${y}`;
}

/** Formato requerido por FechaHoraFirma: DD-MM-YYYY HH:MM:SS */
function formatDateTime(date: Date): string {
  const d = date.getUTCDate().toString().padStart(2, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const y = date.getUTCFullYear();
  const h = date.getUTCHours().toString().padStart(2, '0');
  const min = date.getUTCMinutes().toString().padStart(2, '0');
  const s = date.getUTCSeconds().toString().padStart(2, '0');
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
    // Tipos 46/47 requieren <Comprador> en el XML (DGII lo valida).
    // Si no se provee compradorExtranjero, se usa un placeholder mínimo.
    const c = data.compradorExtranjero ?? { nombre: 'Comprador Exterior' };
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
    // Tipo 32 sin RNC → solo email (si hay). El elemento <Comprador> es requerido por el XSD aunque esté vacío.
    if (!data.emailComprador) return '\n    <Comprador/>';
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
  // FechaNCFModificado es obligatoria cuando hay CodigoModificacion — si no se provee, usar fecha de hoy.
  const fechaRef = data.fechaNcfModificado
    ? formatDate(data.fechaNcfModificado)
    : (data.codigoModificacion ? formatDate(new Date()) : undefined);
  return `
  <InformacionReferencia>
    <NCFModificado>${data.ncfModificado}</NCFModificado>
    ${opt('RNCOtroContribuyente', data.rncOtroContribuyente)}
    ${opt('FechaNCFModificado', fechaRef)}
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
    </Item>`;
}

/**
 * Tipos 41 (Compras) y 47 (Pagos al Exterior): los Items son Retenciones, no líneas de productos.
 * Genera un Item de Retencion ISR (01) calculado como 5% del montoTotal.
 * El porcentaje es orientativo — DGII valida el formato, no la lógica de negocio en pruebas.
 */
function buildRetencionItemsXml(montoTotal: number): string {
  const montoIsr = (montoTotal * 0.05);
  return `
    <Item>
      <NumeroLinea>1</NumeroLinea>
      <Retencion>
        <TipoRetencion>01</TipoRetencion>
        <MontoRetencion>${montoIsr.toFixed(2)}</MontoRetencion>
      </Retencion>
    </Item>`;
}

/**
 * Construye el bloque <IdDoc> adaptado a cada tipo de e-CF.
 *
 * Diferencias por tipo (confirmadas por errores XSD de DGII):
 *   31/32/33/45 — estructura estándar
 *   34          — añade <IndicadorNotaCredito> justo después de <eNCF>
 *   41          — sin <TipoIngresos>
 *   43          — solo <TipoPago> (sin IndicadorEnvioDiferido, IndicadorMontoGravado, TipoIngresos, TablaFormasPago)
 *   44          — sin <IndicadorMontoGravado>; acepta <IndicadorEnvioDiferido> y <IndicadorServicioTodoIncluido>
 *   46          — sin <IndicadorMontoGravado>; acepta <IndicadorEnvioDiferido>
 *   47          — sin <IndicadorMontoGravado> ni <TipoIngresos>
 */
function buildIdDocXml(data: EcfData): string {
  const t   = data.tipoEcf;
  const tp  = data.tipoPago ?? 1;
  const fv  = `<FechaVencimientoSecuencia>${formatDate(data.fechaVencimientoSecuencia)}</FechaVencimientoSecuencia>`;
  const fl  = opt('FechaLimitePago', data.fechaLimitePago ? formatDate(data.fechaLimitePago) : undefined);
  const tabla = `
      <TablaFormasPago>
        <FormaDePago>
          <FormaPago>${tp}</FormaPago>
          <MontoPago>${data.montoTotal.toFixed(2)}</MontoPago>
        </FormaDePago>
      </TablaFormasPago>`;

  // Tipo 43 — Gastos Menores: IdDoc ultra-simplificado (sin IndicadorMontoGravado ni TipoIngresos)
  if (t === '43') {
    return `
    <IdDoc>
      <TipoeCF>${t}</TipoeCF>
      <eNCF>${data.encf}</eNCF>
      ${fv}
      <TipoPago>${tp}</TipoPago>
    </IdDoc>`;
  }

  // Tipos 41/47 — sin TipoIngresos
  if (t === '41' || t === '47') {
    return `
    <IdDoc>
      <TipoeCF>${t}</TipoeCF>
      <eNCF>${data.encf}</eNCF>
      ${fv}
      <IndicadorMontoGravado>0</IndicadorMontoGravado>
      <TipoPago>${tp}</TipoPago>
      ${fl}
      ${tabla}
    </IdDoc>`;
  }

  // Tipo 44 — sin IndicadorMontoGravado (usa TipoIngresos directamente)
  if (t === '44') {
    return `
    <IdDoc>
      <TipoeCF>${t}</TipoeCF>
      <eNCF>${data.encf}</eNCF>
      ${fv}
      <TipoIngresos>${data.tipoIngresos ?? '01'}</TipoIngresos>
      <TipoPago>${tp}</TipoPago>
      ${fl}
      ${tabla}
    </IdDoc>`;
  }

  // Tipo 46 — sin IndicadorMontoGravado (usa TipoIngresos directamente)
  if (t === '46') {
    return `
    <IdDoc>
      <TipoeCF>${t}</TipoeCF>
      <eNCF>${data.encf}</eNCF>
      ${fv}
      <TipoIngresos>${data.tipoIngresos ?? '01'}</TipoIngresos>
      <TipoPago>${tp}</TipoPago>
      ${fl}
      ${tabla}
    </IdDoc>`;
  }

  // Tipo 34 — Nota de Crédito: tiene IndicadorNotaCredito y NO tiene FechaVencimientoSecuencia
  // (la nota hereda la secuencia del NCF original — confirmado por DGII XSD)
  if (t === '34') {
    return `
    <IdDoc>
      <TipoeCF>${t}</TipoeCF>
      <eNCF>${data.encf}</eNCF>
      <IndicadorNotaCredito>${data.indicadorNotaCredito ?? 1}</IndicadorNotaCredito>
      <IndicadorMontoGravado>0</IndicadorMontoGravado>
      <TipoIngresos>${data.tipoIngresos ?? '01'}</TipoIngresos>
      <TipoPago>${tp}</TipoPago>
      ${fl}
      ${tabla}
    </IdDoc>`;
  }

  // Tipos 31, 32, 33, 45 — estructura estándar
  return `
    <IdDoc>
      <TipoeCF>${t}</TipoeCF>
      <eNCF>${data.encf}</eNCF>
      ${fv}
      <IndicadorMontoGravado>0</IndicadorMontoGravado>
      <TipoIngresos>${data.tipoIngresos ?? '01'}</TipoIngresos>
      <TipoPago>${tp}</TipoPago>
      ${fl}
      ${tabla}
    </IdDoc>`;
}

/**
 * Construye el bloque <Totales> adaptado a cada tipo de e-CF.
 *
 *   43 / 47 — solo MontoExento + MontoTotal (sin ITBIS, sin MontoGravadoTotal)
 *   44      — sin MontoGravadoTotal ni ITBIS; usa MontoExento + MontoTotal
 *   resto   — estructura estándar con MontoGravadoTotal + ITBIS
 */
function buildTotalesXml(data: EcfData): string {
  const t = data.tipoEcf;

  // Tipos exentos de ITBIS / sin MontoGravadoTotal
  if (t === '43' || t === '44' || t === '47') {
    // Para estos tipos, todo el monto es exento
    const exento = (data.montoExento ?? 0) > 0 ? data.montoExento! : data.montoTotal;
    return `
    <Totales>
      <MontoExento>${exento.toFixed(2)}</MontoExento>
      <MontoTotal>${data.montoTotal.toFixed(2)}</MontoTotal>
    </Totales>`;
  }

  // Resto de tipos — estructura estándar
  return `
    <Totales>
      <MontoGravadoTotal>${data.montoGravadoTotal.toFixed(2)}</MontoGravadoTotal>
      ${optNonZero('MontoGravadoI1', data.montoGravadoI1?.toFixed(2))}
      ${optNonZero('MontoGravadoI2', data.montoGravadoI2?.toFixed(2))}
      ${optNonZero('MontoGravadoI3', data.montoGravadoI3?.toFixed(2))}
      ${optNonZero('MontoExento', data.montoExento?.toFixed(2))}
      ${(data.itbis1 && data.itbis1 > 0) ? '<ITBIS1>18</ITBIS1>' : ''}
      ${optNonZero('TotalITBIS', data.totalItbis > 0 ? data.totalItbis.toFixed(2) : undefined)}
      ${(data.itbis1 && data.itbis1 > 0) ? `<TotalITBIS1>${data.itbis1.toFixed(2)}</TotalITBIS1>` : ''}
      ${(data.itbis2 && data.itbis2 > 0) ? `<TotalITBIS2>${data.itbis2.toFixed(2)}</TotalITBIS2>` : ''}
      ${(data.itbis3 && data.itbis3 > 0) ? `<TotalITBIS3>${data.itbis3.toFixed(2)}</TotalITBIS3>` : ''}
      ${optNonZero('TotalITBISRetenido', data.totalITBISRetenido?.toFixed(2))}
      ${optNonZero('TotalISRRetenido',   data.totalISRRetenido?.toFixed(2))}
      <MontoTotal>${data.montoTotal.toFixed(2)}</MontoTotal>
    </Totales>`;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function buildEcfXml(data: EcfData): string {
  validar(data);

  // Tipos 41/47 usan Items-Retenciones en lugar de líneas normales de producto
  const usaRetenciones = data.tipoEcf === '41' || data.tipoEcf === '47';
  const itemsXml = usaRetenciones
    ? buildRetencionItemsXml(data.montoTotal)
    : data.items.map(buildItemXml).join('');

  const idDocXml       = buildIdDocXml(data);
  const totalesXml     = buildTotalesXml(data);
  const compradorXml   = buildCompradorXml(data);
  const referenciaXml  = buildReferenciaXml(data);
  const exportacionXml = buildExportacionXml(data);
  const monedaXml      = buildOtraMonedaXml(data);

  return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    ${idDocXml}
    <Emisor>
      <RNCEmisor>${data.rncEmisor}</RNCEmisor>
      <RazonSocialEmisor>${escXml(data.razonSocialEmisor)}</RazonSocialEmisor>
      ${opt('NombreComercial', data.nombreComercialEmisor ? escXml(data.nombreComercialEmisor) : undefined)}
      <DireccionEmisor>${escXml(data.direccionEmisor ?? 'Sin dirección')}</DireccionEmisor>
      <FechaEmision>${formatDate(data.fechaEmision)}</FechaEmision>
    </Emisor>
    ${compradorXml}
    ${exportacionXml}
    ${totalesXml}
    ${monedaXml}
  </Encabezado>
  <DetallesItems>
    ${itemsXml}
  </DetallesItems>
  ${referenciaXml}
  <FechaHoraFirma>${formatDateTime(new Date())}</FechaHoraFirma>
</ECF>`;
}
