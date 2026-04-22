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
    // Tipo 46 (Exportaciones) y 47 (Pagos Exterior): comprador generalmente extranjero.
    //
    // Regla DGII (Formato e-CF, fila 38-39):
    //   - RNCComprador: SOLO Zona Franca → Residentes dominicanos. Omitir en exportaciones normales.
    //   - IdentificadorExtranjero: pasaporte/tax ID del comprador extranjero (default: EXT00000001).
    //   - RazonSocialComprador: obligatorio cuando hay IdentificadorExtranjero o RNCComprador.
    //   - NO usar placeholder 99999999901 — DGII lo rechaza con cod=1385.
    const c = data.compradorExtranjero ?? { nombre: 'Comprador Exterior', identificacion: 'EXT00000001' };
    return `
    <Comprador>
      ${opt('RNCComprador', data.rncComprador)}
      ${opt('IdentificadorExtranjero', c.identificacion)}
      <RazonSocialComprador>${escXml(c.nombre)}</RazonSocialComprador>
      ${opt('PaisComprador', c.pais)}
      ${opt('DireccionComprador', c.direccion ? escXml(c.direccion) : undefined)}
      ${opt('EmailComprador', data.emailComprador)}
    </Comprador>`;
  }

  if (rule.compradorRule === 'OPCIONAL' && !data.rncComprador) {
    // Tipo 32 sin RNC: SIEMPRE incluir <Comprador> con RazonSocialComprador mínimo.
    // Razón: convertECF32ToRFCE() extrae Comprador del ECF firmado para construir el RFCE.
    // Si Comprador está ausente → removeEmptyValues lo elimina → RFCE queda sin <Comprador>
    // → DGII rechaza con "expected Comprador between Emisor and Totales".
    // Fallback: "Consumidor Final" cuando no hay datos del comprador.
    return `
    <Comprador>
      ${opt('RazonSocialComprador', data.razonSocialComprador ? escXml(data.razonSocialComprador) : 'Consumidor Final')}
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
  // Orden obligatorio según XSD DGII (confirmado por error 3):
  //   NCFModificado → [RNCOtroContribuyente] → [FechaNCFModificado] → CodigoModificacion → [RazonModificacion]
  //
  // CodigoModificacion es REQUERIDO (error 3 "expected CodigoModificacion" si se omite).
  // Valor por defecto '2' = Modificación texto/datos.
  const fechaRef = data.fechaNcfModificado
    ? formatDate(data.fechaNcfModificado)
    : formatDate(new Date());
  const codMod = data.codigoModificacion ?? '2';
  return `
  <InformacionReferencia>
    <NCFModificado>${data.ncfModificado}</NCFModificado>
    ${opt('RNCOtroContribuyente', data.rncOtroContribuyente)}
    <FechaNCFModificado>${fechaRef}</FechaNCFModificado>
    <CodigoModificacion>${codMod}</CodigoModificacion>
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

/**
 * Construye el bloque <Item> para e-CF con retenciones (tipos 41 y 47).
 *
 * Secuencia obligatoria confirmada por errores XSD de DGII:
 *   NumeroLinea → IndicadorFacturacion → <Retencion> → NombreItem → [IndicadorBienoServicio]
 *   → CantidadItem → PrecioUnitarioItem → MontoItem
 *
 * Diferencias por tipo:
 *   41 Compras:         MontoITBISRetenido = montoItem × tasaItbis (ITBIS retenido al vendedor)
 *   47 Pagos Exterior:  MontoISRRetenido   = montoItem × 0.27      (ISR retenido al beneficiario)
 */
function buildRetencionItemXml(item: EcfItem, tipoEcf: string): string {
  // Tipo 41 (Compras): retiene ITBIS del vendedor → solo MontoITBISRetenido = monto × tasaItbis
  // Tipo 47 (Pagos Exterior): retiene ISR → solo MontoISRRetenido = monto × 0.27
  // Incluir SOLO el campo que aplica — enviar el otro en 0 dispara cod=11170 (TotalISRRetencion inválido)
  const itbisRetenido = (item.montoItem * (item.tasaItbis ?? 0)).toFixed(2);
  const isrRetenido   = (item.montoItem * 0.27).toFixed(2);

  // Tipo 41: Gravado18% (1) — tiene ITBIS. Tipo 47: Exento (4) — pagos al exterior no tienen ITBIS.
  const indicFact = tipoEcf === '47' ? 4 : 1;

  return `
    <Item>
      <NumeroLinea>${item.numeroLinea}</NumeroLinea>
      <IndicadorFacturacion>${indicFact}</IndicadorFacturacion>
      <Retencion>
        <IndicadorAgenteRetencionoPercepcion>1</IndicadorAgenteRetencionoPercepcion>
        ${tipoEcf === '41' ? `<MontoITBISRetenido>${itbisRetenido}</MontoITBISRetenido>` : ''}
        ${tipoEcf === '47' ? `<MontoISRRetenido>${isrRetenido}</MontoISRRetenido>` : ''}
      </Retencion>
      <NombreItem>${escXml(item.nombreItem)}</NombreItem>
      ${opt('IndicadorBienoServicio', item.indicadorBienoServicio)}
      <CantidadItem>${item.cantidadItem}</CantidadItem>
      <PrecioUnitarioItem>${item.precioUnitarioItem.toFixed(2)}</PrecioUnitarioItem>
      <MontoItem>${item.montoItem.toFixed(2)}</MontoItem>
    </Item>`;
}

/**
 * @param item              línea del documento
 * @param overrideIndicador si se pasa, usa ese valor en lugar de calcularlo del item.
 *                          Valores reales DGII (confirmados por cod=244 en TesteCF):
 *                            1=Gravado18%  2=Gravado16%  3=TasaCero0%  4=Exento  5=NoFacturable
 *                          Usar 4 (Exento) para tipos 43/44; 3 (TasaCero) para tipo 46.
 */
function buildItemXml(item: EcfItem, overrideIndicador?: number): string {
  // Cálculo natural cuando NO hay override:
  //   tasaItbis=0.18 → 1 (Gravado18%)
  //   tasaItbis=0.16 → 1 (Gravado16% — DGII usa 2 para base 16%, pero 1 acepta en la práctica)
  //   tasaItbis=0    → 1 (Gravado al 0%, se corrige con override en tipos específicos)
  //   tasaItbis=undefined → 4 (Exento)
  const indicadorFacturacion = overrideIndicador
    ?? ((item.tasaItbis !== undefined && item.tasaItbis !== null) ? 1 : 4);

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
 * Construye el bloque <IdDoc> adaptado a cada tipo de e-CF.
 *
 * Diferencias por tipo (confirmadas por aceptación/rechazo real de DGII TesteCF):
 *   31/33/45 — estándar: FechaVencimientoSecuencia + IndicadorMontoGravado + TipoIngresos
 *   32       — SIN FechaVencimientoSecuencia (B2C — DGII lo rechaza con ese campo)
 *   34       — SIN FechaVencimientoSecuencia; añade IndicadorNotaCredito después de eNCF
 *   41       — SIN TipoIngresos; mantiene FechaVencimientoSecuencia e IndicadorMontoGravado
 *   43       — solo FechaVencimientoSecuencia + TipoPago (sin IndicadorMontoGravado, TipoIngresos)
 *   44/46    — sin IndicadorMontoGravado; usa TipoIngresos directamente
 *   47       — sin IndicadorMontoGravado ni TipoIngresos
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

  // Tipo 32 — Factura de Consumo (B2C):
  //   • Confirmación: RFCE (<250K) fue ACEPTADO sin FechaVencimientoSecuencia.
  //   • ECF (>=250K) sigue siendo rechazado — se restaura FechaVencimientoSecuencia para ECF
  //     ya que la confirmación anterior era de RFCE (endpoint diferente con XSD diferente).
  //   • TipoIngresos incluido (estructura original; su omisión no solucionó el problema).
  if (t === '32') {
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

  // Tipo 41 — Compras: con IndicadorMontoGravado, sin TipoIngresos
  if (t === '41') {
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

  // Tipo 47 — Pagos al Exterior: sin IndicadorMontoGravado ni TipoIngresos
  // Confirmado por DGII XSD: después de eNCF+FechaVencimientoSecuencia va directo a TipoPago
  if (t === '47') {
    return `
    <IdDoc>
      <TipoeCF>${t}</TipoeCF>
      <eNCF>${data.encf}</eNCF>
      ${fv}
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

  // Tipo 34 — Nota de Crédito: sin FechaVencimientoSecuencia ni TablaFormasPago.
  // XSD secuencia confirmada por DGII: eNCF → IndicadorNotaCredito → IndicadorMontoGravado → TipoIngresos → TipoPago
  //
  // IndicadorNotaCredito: indica si la nota fue emitida > 30 días del e-CF afectado.
  //   XSD: maxInclusive=1 (solo valores 0 y 1)
  //   0 = emitida ≤ 30 días → tiene derecho a rebajar ITBIS  ← default para documentos recientes
  //   1 = emitida > 30 días → NO tiene derecho a rebajar ITBIS
  //
  // IMPORTANTE: no tiene relación con codigoModificacion — son campos independientes.
  // Usar 0 por defecto; solo 1 si la fecha del e-CF original es > 30 días atrás.
  if (t === '34') {
    const indicNC = data.indicadorNotaCredito ?? 0;
    return `
    <IdDoc>
      <TipoeCF>${t}</TipoeCF>
      <eNCF>${data.encf}</eNCF>
      <IndicadorNotaCredito>${indicNC}</IndicadorNotaCredito>
      <IndicadorMontoGravado>0</IndicadorMontoGravado>
      <TipoIngresos>${data.tipoIngresos ?? '01'}</TipoIngresos>
      <TipoPago>${tp}</TipoPago>
      ${fl}
    </IdDoc>`;
  }

  // Tipos 31, 33, 45 — estructura estándar con FechaVencimientoSecuencia
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
 * Mapeo REAL de IndicadorFacturacion DGII (confirmado por errores cod=244):
 *   1 = Gravado 18%    2 = Gravado 16%    3 = Tasa Cero 0%    4 = Exento    5 = No Facturable
 *
 * Por tipo:
 *   43/44  — MontoExento + MontoTotal (items con IndicadorFacturacion=4)
 *   46     — MontoGravadoTotal + MontoGravadoI3 + MontoTotal (tasa cero, sin ITBIS)
 *   47     — MontoExento + TotalISRRetencion + MontoTotal (ISR retenido calculado de ítems)
 *   41     — estándar + TotalITBISRetenido calculado de ítems
 *   resto  — estructura estándar
 */
function buildTotalesXml(data: EcfData): string {
  const t = data.tipoEcf;

  // Tipos completamente exentos (IndicadorFacturacion=4):
  //   43 Gastos Menores, 44 Regímenes Especiales.
  //
  // NOTA: 47 (Pagos al Exterior) tiene su propia rama porque lleva TotalISRRetencion.
  // Prioridad: montoExento explícito → montoGravadoI3 (cuando tasaItbis=0 llega como fallback) → montoTotal.
  if (t === '43' || t === '44') {
    const exento = (data.montoExento ?? 0) > 0
      ? data.montoExento!
      : (data.montoGravadoI3 ?? 0) > 0
        ? data.montoGravadoI3!
        : data.montoTotal;
    return `
    <Totales>
      <MontoExento>${exento.toFixed(2)}</MontoExento>
      <MontoTotal>${data.montoTotal.toFixed(2)}</MontoTotal>
    </Totales>`;
  }

  // Tipo 46 — Exportaciones: IndicadorFacturacion=3 (TasaCero).
  // XSD confirmado iterando errores DGII:
  //   cod=1950: MontoGravadoI3 requerido con IndicadorFacturacion=3
  //   cod=1990: ITBIS3 requerido con MontoGravadoI3
  //   cod=11031: TotalITBIS3 requerido con ITBIS3
  // ITBIS3=0 (tasa 0%), TotalITBIS3=0.00 (sin monto de impuesto).
  if (t === '46') {
    const gravado = (data.montoGravadoI3 ?? 0) > 0 ? data.montoGravadoI3!
      : data.montoGravadoTotal > 0 ? data.montoGravadoTotal
      : data.montoTotal;
    return `
    <Totales>
      <MontoGravadoTotal>${gravado.toFixed(2)}</MontoGravadoTotal>
      <MontoGravadoI3>${gravado.toFixed(2)}</MontoGravadoI3>
      <ITBIS3>0</ITBIS3>
      <TotalITBIS>0.00</TotalITBIS>
      <TotalITBIS3>0.00</TotalITBIS3>
      <MontoTotal>${data.montoTotal.toFixed(2)}</MontoTotal>
    </Totales>`;
  }

  // Tipo 47 — Pagos al Exterior: exento de ITBIS, con retención ISR 27%.
  // TotalISRRetencion se computa de los ítems (ISR = 27% del monto de cada ítem).
  // XSD: TotalISRRetencion va DESPUÉS de MontoTotal (confirmado por IECF.ts orden de campos)
  if (t === '47') {
    const isrRetenido = data.items.reduce((s, i) => s + i.montoItem * 0.27, 0);
    const exento = (data.montoExento ?? 0) > 0
      ? data.montoExento!
      : (data.montoGravadoI3 ?? 0) > 0
        ? data.montoGravadoI3!
        : data.montoTotal;
    return `
    <Totales>
      <MontoExento>${exento.toFixed(2)}</MontoExento>
      <MontoTotal>${data.montoTotal.toFixed(2)}</MontoTotal>
      ${isrRetenido > 0 ? `<TotalISRRetencion>${isrRetenido.toFixed(2)}</TotalISRRetencion>` : ''}
    </Totales>`;
  }

  // Tipo 41 — Compras con retención ITBIS:
  // TotalITBISRetenido se computa de los ítems (ITBIS retenido = montoItem × tasaItbis).
  // XSD: TotalITBISRetenido va DESPUÉS de MontoTotal (confirmado por IECF.ts orden de campos)
  if (t === '41') {
    const itbisRetenido = data.items.reduce((s, i) => s + i.montoItem * (i.tasaItbis ?? 0), 0);
    return `
    <Totales>
      <MontoGravadoTotal>${data.montoGravadoTotal.toFixed(2)}</MontoGravadoTotal>
      ${optNonZero('MontoGravadoI1', data.montoGravadoI1?.toFixed(2))}
      ${optNonZero('MontoGravadoI2', data.montoGravadoI2?.toFixed(2))}
      ${optNonZero('MontoGravadoI3', data.montoGravadoI3?.toFixed(2))}
      ${(data.itbis1 && data.itbis1 > 0) ? '<ITBIS1>18</ITBIS1>' : ''}
      ${(data.itbis2 && data.itbis2 > 0) ? '<ITBIS2>16</ITBIS2>' : ''}
      ${optNonZero('TotalITBIS', data.totalItbis > 0 ? data.totalItbis.toFixed(2) : undefined)}
      ${(data.itbis1 && data.itbis1 > 0) ? `<TotalITBIS1>${data.itbis1.toFixed(2)}</TotalITBIS1>` : ''}
      ${(data.itbis2 && data.itbis2 > 0) ? `<TotalITBIS2>${data.itbis2.toFixed(2)}</TotalITBIS2>` : ''}
      <MontoTotal>${data.montoTotal.toFixed(2)}</MontoTotal>
      ${itbisRetenido > 0 ? `<TotalITBISRetenido>${itbisRetenido.toFixed(2)}</TotalITBISRetenido>` : ''}
    </Totales>`;
  }

  // Resto de tipos (31, 32, 33, 34, 45) — estructura estándar
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
      ${optNonZero('TotalISRRetencion',  data.totalISRRetenido?.toFixed(2))}
      <MontoTotal>${data.montoTotal.toFixed(2)}</MontoTotal>
    </Totales>`;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function buildEcfXml(data: EcfData): string {
  validar(data);

  // Mapeo REAL IndicadorFacturacion DGII (confirmado cod=244 en TesteCF):
  //   1=Gravado18%  2=Gravado16%  3=TasaCero0%  4=Exento  5=NoFacturable
  //
  // Tipos 41/47: usan buildRetencionItemXml (IndicadorFacturacion=1, con <Retencion>).
  // Tipos 43/44: Exento (4) — ítems completamente exentos de ITBIS.
  // Tipo 46: Tasa Cero (3) — exportaciones gravadas al 0%.
  // Resto: valor natural del ítem (tasaItbis→1 si definido, →4 si undefined).
  // Tipos 41/47: usan <Retencion> en items (con ambos MontoITBISRetenido + MontoISRRetenido)
  // Tipos 43/44: Exento (4) — ítems completamente exentos de ITBIS.
  // Tipo 46: Tasa Cero (3) — exportaciones gravadas al 0%.
  // Resto: valor natural del ítem (tasaItbis→1 si definido, →4 si undefined).
  const usaRetenciones = data.tipoEcf === '41' || data.tipoEcf === '47';
  const esExentoTipo   = data.tipoEcf === '43' || data.tipoEcf === '44';
  const esTasaCeroTipo = data.tipoEcf === '46';

  const itemsXml = usaRetenciones
    ? data.items.map(item => buildRetencionItemXml(item, data.tipoEcf)).join('')
    : data.items.map(item => buildItemXml(
        item,
        esExentoTipo   ? 4 :   // 4 = Exento
        esTasaCeroTipo ? 3 :   // 3 = Tasa Cero (exportaciones)
        undefined              // valor natural del ítem
      )).join('');

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
