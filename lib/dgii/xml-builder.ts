/**
 * Constructor de XML para los 10 tipos de e-CF de la DGII — Norma 1-20.
 *
 * ─── Tipos soportados ────────────────────────────────────────────────────────
 *  31  Factura de Crédito Fiscal (B2B)     — RNCComprador obligatorio
 *  32  Factura de Consumo (B2C)            — Comprador opcional; <250K → RFCE síncrono
 *  33  Nota de Débito                      — requiere InformacionReferencia
 *  34  Nota de Crédito                     — requiere InformacionReferencia
 *  41  Compras (Agente Retención ITBIS)    — RNCComprador = RNC del vendedor
 *  43  Gastos Menores                      — sin comprador; IdDoc mínimo
 *  44  Regímenes Especiales                — RNCComprador recomendado
 *  45  Gubernamental                       — RNCComprador = institución pública
 *  46  Exportaciones                       — comprador extranjero; IndicadorFacturacion=3 (TasaCero)
 *  47  Pagos al Exterior                   — comprador extranjero; ISR 27%; IndicadorFacturacion=4 (Exento)
 *
 * ─── Hallazgos clave confirmados en el Set de Pruebas TesteCF ────────────────
 *
 *  IndicadorFacturacion (cod=244):
 *    1=Gravado18%  2=Gravado16%  3=TasaCero  4=Exento  5=NoFacturable
 *    La documentación original usa secuencia genérica — los valores REALES son estos.
 *
 *  IndicadorNotaCredito (tipo 34, maxInclusive=1):
 *    0 = nota emitida ≤ 30 días del e-CF original → puede rebajar ITBIS  (default)
 *    1 = nota emitida >  30 días del e-CF original → NO puede rebajar ITBIS
 *    No tiene relación con el tipo de corrección (eso es CodigoModificacion).
 *
 *  CodigoModificacion (tipos 33 y 34):
 *    '1' = Anulación — SOLO válido en tipo 34
 *    '2' = Corrección de Texto — montoTotal DEBE ser cero (DGII lo rechaza si ≠ 0)
 *    '3' = Devolución / Descuento monetario
 *    Tipo 33 usar '2' (Disminución) o '3'. Nunca '1' en tipo 33.
 *
 *  Orden de campos en <Totales> (confirmado por IECF.ts — interfaz TypeScript del XSD DGII):
 *    TotalITBISRetenido y TotalISRRetencion van DESPUÉS de MontoTotal (campos 21-22).
 *
 *  Tipo 41 — Compras (retención ITBIS):
 *    Ítem Bien     (indicadorBienoServicio=1): solo MontoITBISRetenido.
 *    Ítem Servicio (indicadorBienoServicio=2): MontoITBISRetenido + MontoISRRetenido.
 *    Enviar MontoISRRetenido=0 con un Bien dispara cod=11170 (TotalISRRetencion inválido).
 *
 *  Tipo 46 — Exportaciones:
 *    IdentificadorExtranjero obligatorio. NUNCA usar placeholder 99999999901 → cod=1385.
 *    IndicadorFacturacion=3 (TasaCero) requiere MontoGravadoI3 + ITBIS3 + TotalITBIS3 en Totales.
 *
 *  Tipo 32 — RFCE síncrono:
 *    Para facturas < RD$250,000 el SDK devuelve trackId='' (vacío).
 *    convertECF32ToRFCE() requiere que <Comprador> esté presente en el ECF firmado.
 */

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface EcfItem {
  numeroLinea:             number;
  nombreItem:              string;
  descripcionItem?:        string;
  cantidadItem:            number;
  unidadMedidaItem?:       string;      // código DGII de unidad de medida
  precioUnitarioItem:      number;
  descuentoMonto?:         number;
  montoItem:               number;
  tasaItbis?:              number;      // 0.18 | 0.16 | 0 | undefined (exento)
  montoItbis?:             number;
  indicadorBienoServicio?: 1 | 2;       // 1=Bien, 2=Servicio
}

/** Comprador o beneficiario extranjero (tipos 46 y 47) */
export interface CompradorExtranjero {
  nombre:          string;
  identificacion?: string;              // pasaporte / tax ID / IRS EIN
  pais?:           string;              // ISO 3166 alpha-3 (ej. 'USA', 'COL')
  direccion?:      string;
}

export interface InformacionExportacion {
  pais?:              string;           // ISO 3166 alpha-3
  regimenAduanero?:   string;           // código DGA
  numeroDUA?:         string;
  montoGravadoTotal?: number;
}

export interface OtraMoneda {
  tipoMoneda:                   string; // ej. 'USD', 'EUR'
  tipoCambio:                   number;
  montoGravadoTotalOtraMoneda?: number;
  montoExentoOtraMoneda?:       number;
  totalITBISOtraMoneda?:        number;
  montoTotalOtraMoneda?:        number;
}

export interface EcfData {
  tipoEcf: string;
  encf:    string;

  // ── Emisor ──────────────────────────────────────────────────────────────────
  rncEmisor:                  string;
  razonSocialEmisor:          string;
  nombreComercialEmisor?:     string;
  direccionEmisor?:           string;
  fechaEmision:               Date;
  fechaVencimientoSecuencia:  Date;

  // ── Comprador (persona jurídica / natural dominicana) ────────────────────────
  rncComprador?:          string;
  razonSocialComprador?:  string;
  emailComprador?:        string;

  // ── Comprador / Beneficiario Extranjero (tipos 46 y 47) ─────────────────────
  compradorExtranjero?:   CompradorExtranjero;

  // ── Tipo de Ingresos ─────────────────────────────────────────────────────────
  // Requerido en tipos con TipoIngresos en IdDoc (ver IDDOC_CONFIG.ti).
  // '01'=Ingresos por Operaciones  '02'=Financieros  '03'=Extraordinarios
  // '04'=Arrendamiento             '05'=Venta Activos Depreciables  '06'=Otros
  tipoIngresos?: string;

  // ── Pago ─────────────────────────────────────────────────────────────────────
  tipoPago?:        1 | 2 | 3 | 4;     // 1=Contado, 2=Crédito, 3=GratuidadoReg, 4=Otro
  fechaLimitePago?: Date;

  // ── Ítems ────────────────────────────────────────────────────────────────────
  items: EcfItem[];

  // ── Totales (calculados por calcularTotales() en lib/ecf/types.ts) ───────────
  montoGravadoTotal:   number;
  montoGravadoI1?:     number;         // base gravada al 18%
  montoGravadoI2?:     number;         // base gravada al 16%
  montoGravadoI3?:     number;         // base gravada al  0% (TasaCero / exportaciones)
  montoExento?:        number;
  itbis1?:             number;         // ITBIS calculado al 18%
  itbis2?:             number;         // ITBIS calculado al 16%
  itbis3?:             number;         // ITBIS calculado al  0% (siempre 0)
  totalItbis:          number;
  montoTotal:          number;
  totalITBISRetenido?: number;         // retención ITBIS (tipo 41)
  totalISRRetenido?:   number;         // retención ISR   (tipo 47)

  // ── Referencia (tipos 33 y 34 — obligatorio; otros — opcional) ──────────────
  ncfModificado?:        string;
  rncOtroContribuyente?: string;       // RNC del comprador del e-CF que se modifica
  fechaNcfModificado?:   Date;
  // CodigoModificacion confirmados en TesteCF:
  //   '1' = Anulación         — SOLO tipo 34
  //   '2' = Corrección Texto  — montoTotal DEBE ser cero
  //   '3' = Devolución / Descuento monetario
  // Default '2'. Tipo 33: usar '2' o '3' (nunca '1').
  codigoModificacion?:   string;
  razonModificacion?:    string;

  // ── Tipo 34 — Nota de Crédito ────────────────────────────────────────────────
  // 0 = nota emitida ≤ 30 días → puede rebajar ITBIS  (default)
  // 1 = nota emitida >  30 días → NO puede rebajar ITBIS
  // XSD maxInclusive=1 — solo 0 y 1 son válidos.
  indicadorNotaCredito?: number;

  // ── Exportaciones (tipo 46) ──────────────────────────────────────────────────
  informacionExportacion?: InformacionExportacion;

  // ── Otra Moneda (tipos 46 y 47) ──────────────────────────────────────────────
  otraMoneda?: OtraMoneda;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class BuildEcfError extends Error {
  constructor(message: string, public campo?: string) {
    super(message);
    this.name = 'BuildEcfError';
  }
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/**
 * Tasa de retención ISR para pagos a beneficiarios no residentes.
 * Ley 11-92, Art. 306-bis — aplica en tipo 47 (Pagos al Exterior).
 */
const ISR_EXTERIOR = 0.27;

/**
 * Valores reales de IndicadorFacturacion DGII.
 * Confirmados en TesteCF mediante error cod=244 ("valor no permitido").
 * La documentación original usa secuencia genérica 1-5; estos son los valores vigentes.
 */
const IND_FACT = {
  GRAVADO_18:    1,  // Base gravada ITBIS 18% (estándar)
  GRAVADO_16:    2,  // Base gravada ITBIS 16% (sectores especiales)
  TASA_CERO:     3,  // Gravado al 0% — exportaciones (tipo 46)
  EXENTO:        4,  // Exento de ITBIS (tipos 43, 44, 47)
  NO_FACTURABLE: 5,  // No facturable (gasto propio no trasladable)
} as const;

// ─── Tablas de configuración por tipo ─────────────────────────────────────────

/**
 * Modo de facturación: determina IndicadorFacturacion de los ítems
 * y la estructura del bloque <Totales>.
 *
 *   NORMAL          — Estándar con ITBIS (tipos 31, 32, 33, 34, 45)
 *   EXENTO          — Sin ITBIS, solo MontoExento (tipos 43, 44)
 *   TASA_CERO       — Exportaciones gravadas al 0% (tipo 46)
 *   RETENCION_ITBIS — Agente retenedor de ITBIS (tipo 41 Compras)
 *   RETENCION_ISR   — Agente retenedor ISR exterior (tipo 47 Pagos Exterior)
 */
type ModoFacturacion =
  | 'NORMAL'
  | 'EXENTO'
  | 'TASA_CERO'
  | 'RETENCION_ITBIS'
  | 'RETENCION_ISR';

/**
 * Regla del bloque <Comprador> por tipo.
 *
 *   OBLIGATORIO — <Comprador> con RNCComprador es requerido
 *   OPCIONAL    — se incluye si hay datos; tipo 32 siempre incluye mínimo "Consumidor Final"
 *   PROHIBIDO   — <Comprador> no debe aparecer (tipo 43)
 *   EXTRANJERO  — usar IdentificadorExtranjero / nombre (tipos 46, 47)
 */
type CompradorRule = 'OBLIGATORIO' | 'OPCIONAL' | 'PROHIBIDO' | 'EXTRANJERO';

interface TipoConfig {
  compradorRule:      CompradorRule;
  modoFacturacion:    ModoFacturacion;
  /** El tipo requiere NCFModificado + CodigoModificacion en <InformacionReferencia> */
  requiereReferencia: boolean;
}

const TIPO_CONFIG: Record<string, TipoConfig> = {
  '31': { compradorRule: 'OBLIGATORIO', modoFacturacion: 'NORMAL',          requiereReferencia: false },
  '32': { compradorRule: 'OPCIONAL',    modoFacturacion: 'NORMAL',          requiereReferencia: false },
  '33': { compradorRule: 'OBLIGATORIO', modoFacturacion: 'NORMAL',          requiereReferencia: true  },
  '34': { compradorRule: 'OBLIGATORIO', modoFacturacion: 'NORMAL',          requiereReferencia: true  },
  '41': { compradorRule: 'OBLIGATORIO', modoFacturacion: 'RETENCION_ITBIS', requiereReferencia: false },
  '43': { compradorRule: 'PROHIBIDO',   modoFacturacion: 'EXENTO',          requiereReferencia: false },
  // Tipos 44/45: RNCComprador es recomendado por la normativa DGII pero no bloqueante
  // en el Set de Pruebas TesteCF. En producción, si DGII rechaza sin RNC, cambiar a 'OBLIGATORIO'.
  '44': { compradorRule: 'OPCIONAL',    modoFacturacion: 'EXENTO',          requiereReferencia: false },
  '45': { compradorRule: 'OPCIONAL',    modoFacturacion: 'NORMAL',          requiereReferencia: false },
  '46': { compradorRule: 'EXTRANJERO',  modoFacturacion: 'TASA_CERO',       requiereReferencia: false },
  '47': { compradorRule: 'EXTRANJERO',  modoFacturacion: 'RETENCION_ISR',   requiereReferencia: false },
};

/**
 * Campos opcionales de <IdDoc> por tipo de e-CF.
 *
 * Orden canónico XSD DGII (todos los tipos respetan esta secuencia):
 *   TipoeCF → eNCF → [IndicadorNotaCredito] → [FechaVencimientoSecuencia] →
 *   [IndicadorMontoGravado] → [TipoIngresos] → TipoPago →
 *   [FechaLimitePago] → [TablaFormasPago]
 */
interface IdDocConfig {
  /** Incluir <FechaVencimientoSecuencia>  — ausente en tipo 34 (notas de crédito) */
  fv:    boolean;
  /** Incluir <IndicadorMontoGravado>      — ausente en tipos 43, 44, 46, 47 */
  img:   boolean;
  /** Incluir <TipoIngresos>              — ausente en tipos 41, 43, 47 */
  ti:    boolean;
  /** Incluir <TablaFormasPago>           — ausente en tipos 34 y 43 */
  tabla: boolean;
  /** Incluir <IndicadorNotaCredito>      — exclusivo del tipo 34 */
  nc:    boolean;
}

//                                               fv     img    ti     tabla  nc
const IDDOC_CONFIG: Record<string, IdDocConfig> = {
  '31': { fv: true,  img: true,  ti: true,  tabla: true,  nc: false }, // Crédito Fiscal
  '32': { fv: false, img: true,  ti: true,  tabla: true,  nc: false }, // Consumo — DGII /recepcion no acepta FechaVencimientoSecuencia (RFCE es más laxo pero el XSD regular no lo permite)
  '33': { fv: true,  img: true,  ti: true,  tabla: true,  nc: false }, // Nota Débito
  '34': { fv: false, img: true,  ti: true,  tabla: false, nc: true  }, // Nota Crédito — sin FV ni TablaFormasPago
  '41': { fv: true,  img: true,  ti: false, tabla: true,  nc: false }, // Compras
  '43': { fv: true,  img: false, ti: false, tabla: false, nc: false }, // Gastos Menores — IdDoc mínimo
  '44': { fv: true,  img: false, ti: true,  tabla: true,  nc: false }, // Regímenes Especiales
  '45': { fv: true,  img: true,  ti: true,  tabla: true,  nc: false }, // Gubernamental
  '46': { fv: true,  img: false, ti: true,  tabla: true,  nc: false }, // Exportaciones
  '47': { fv: true,  img: false, ti: false, tabla: true,  nc: false }, // Pagos Exterior
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formato de fecha DGII: DD-MM-YYYY */
function formatDate(date: Date): string {
  const d = date.getUTCDate().toString().padStart(2, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}-${m}-${y}`;
}

/** Formato de fecha-hora DGII para FechaHoraFirma: DD-MM-YYYY HH:MM:SS */
function formatDateTime(date: Date): string {
  const d   = date.getUTCDate().toString().padStart(2, '0');
  const m   = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const y   = date.getUTCFullYear();
  const h   = date.getUTCHours().toString().padStart(2, '0');
  const min = date.getUTCMinutes().toString().padStart(2, '0');
  const s   = date.getUTCSeconds().toString().padStart(2, '0');
  return `${d}-${m}-${y} ${h}:${min}:${s}`;
}

/** Formatea un número a 2 decimales */
const f2 = (n: number): string => n.toFixed(2);

/** Genera etiqueta XML solo si value tiene contenido (no undefined/null/vacío) */
function opt(tag: string, value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '';
  return `<${tag}>${value}</${tag}>`;
}

/**
 * Igual que opt() pero excluye valores cero (0, '0', '0.00').
 * DGII FAQ P.23: los tags opcionales que no apliquen NO deben incluirse en el XML.
 */
function optNonZero(tag: string, value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '';
  if (value === 0 || value === '0' || value === '0.00') return '';
  return `<${tag}>${value}</${tag}>`;
}

/** Escapa caracteres especiales XML en strings de texto libre */
function escXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Validación ───────────────────────────────────────────────────────────────

/** Valida los campos obligatorios según el tipo y retorna su configuración */
function validarEcf(data: EcfData): TipoConfig {
  const cfg = TIPO_CONFIG[data.tipoEcf];
  if (!cfg) {
    throw new BuildEcfError(`Tipo de e-CF desconocido: ${data.tipoEcf}`);
  }
  if (cfg.compradorRule === 'OBLIGATORIO' && !data.rncComprador) {
    throw new BuildEcfError(
      `Tipo ${data.tipoEcf} requiere RNCComprador`,
      'rncComprador',
    );
  }
  if (cfg.requiereReferencia && !data.ncfModificado) {
    const nombre = data.tipoEcf === '33' ? 'débito' : 'crédito';
    throw new BuildEcfError(
      `Nota de ${nombre} (tipo ${data.tipoEcf}) requiere NCFModificado`,
      'ncfModificado',
    );
  }
  return cfg;
}

// ─── Construcción de ítems ────────────────────────────────────────────────────

/**
 * Resuelve el valor correcto de <IndicadorFacturacion> según el modo del tipo
 * y las características del ítem.
 *
 * Modos con valor fijo (todos los ítems del tipo usan el mismo indicador):
 *   EXENTO          → 4  (tipos 43, 44 — sin ITBIS)
 *   TASA_CERO       → 3  (tipo 46 — exportaciones gravadas al 0%)
 *   RETENCION_ITBIS → 1  (tipo 41 — base gravada al 18%, ITBIS retenido)
 *   RETENCION_ISR   → 4  (tipo 47 — exento de ITBIS, solo se retiene ISR)
 *
 * Modo NORMAL: valor calculado por la tasa del ítem.
 */
function resolverIndicadorFacturacion(item: EcfItem, modo: ModoFacturacion): number {
  switch (modo) {
    case 'EXENTO':          return IND_FACT.EXENTO;
    case 'TASA_CERO':       return IND_FACT.TASA_CERO;
    case 'RETENCION_ITBIS': return IND_FACT.GRAVADO_18;
    case 'RETENCION_ISR':   return IND_FACT.EXENTO;
    default: { // NORMAL
      const tasa = item.tasaItbis;
      if (tasa === undefined || tasa === null) return IND_FACT.EXENTO;
      if (tasa === 0.18) return IND_FACT.GRAVADO_18;
      if (tasa === 0.16) return IND_FACT.GRAVADO_16;
      if (tasa === 0)    return IND_FACT.TASA_CERO;
      return IND_FACT.GRAVADO_18; // fallback para tasas no estándar
    }
  }
}

/**
 * Construye el bloque <Retencion> dentro de un <Item> (tipos 41 y 47).
 * Retorna cadena vacía para todos los demás tipos.
 *
 * Tipo 41 — Compras (retención ITBIS del vendedor):
 *   MontoITBISRetenido = montoItem × tasaItbis
 *   Si indicadorBienoServicio=2 (Servicio) → también MontoISRRetenido = montoItem × 27%
 *   IMPORTANTE: NO incluir MontoISRRetenido con IndicadorBienoServicio=1 (Bien)
 *   → DGII cod=11170 "TotalISRRetencion no es válido" si se envía el campo con cero.
 *
 * Tipo 47 — Pagos al Exterior (retención ISR al beneficiario no residente):
 *   MontoISRRetenido = montoItem × 27% (Ley 11-92, Art. 306-bis)
 *   NUNCA incluir MontoITBISRetenido — no aplica para pagos al exterior.
 */
function buildRetencionBlock(item: EcfItem, modo: ModoFacturacion): string {
  if (modo === 'RETENCION_ITBIS') {
    const itbis      = f2(item.montoItem * (item.tasaItbis ?? 0));
    const esServicio = item.indicadorBienoServicio === 2;
    return `
      <Retencion>
        <IndicadorAgenteRetencionoPercepcion>1</IndicadorAgenteRetencionoPercepcion>
        <MontoITBISRetenido>${itbis}</MontoITBISRetenido>
        ${esServicio ? `<MontoISRRetenido>${f2(item.montoItem * ISR_EXTERIOR)}</MontoISRRetenido>` : ''}
      </Retencion>`;
  }

  if (modo === 'RETENCION_ISR') {
    return `
      <Retencion>
        <IndicadorAgenteRetencionoPercepcion>1</IndicadorAgenteRetencionoPercepcion>
        <MontoISRRetenido>${f2(item.montoItem * ISR_EXTERIOR)}</MontoISRRetenido>
      </Retencion>`;
  }

  return '';
}

/**
 * Construye el bloque <Item> de un ítem de detalle.
 * Sirve para todos los tipos de e-CF; el modo determina IndicadorFacturacion
 * y si se incluye <Retencion>.
 */
function buildItemXml(item: EcfItem, modo: ModoFacturacion): string {
  const indicFact = resolverIndicadorFacturacion(item, modo);
  const retencion = buildRetencionBlock(item, modo);

  return `
    <Item>
      <NumeroLinea>${item.numeroLinea}</NumeroLinea>
      <IndicadorFacturacion>${indicFact}</IndicadorFacturacion>
      ${retencion}
      <NombreItem>${escXml(item.nombreItem)}</NombreItem>
      ${opt('IndicadorBienoServicio', item.indicadorBienoServicio)}
      ${opt('DescripcionItem', item.descripcionItem ? escXml(item.descripcionItem) : undefined)}
      <CantidadItem>${item.cantidadItem}</CantidadItem>
      ${opt('UnidadMedida', item.unidadMedidaItem)}
      <PrecioUnitarioItem>${f2(item.precioUnitarioItem)}</PrecioUnitarioItem>
      ${optNonZero('DescuentoMonto', item.descuentoMonto !== undefined ? f2(item.descuentoMonto) : undefined)}
      <MontoItem>${f2(item.montoItem)}</MontoItem>
    </Item>`;
}

// ─── Secciones del Encabezado ─────────────────────────────────────────────────

/**
 * Construye <IdDoc> de forma data-driven usando IDDOC_CONFIG.
 *
 * Cada tipo tiene una fila en IDDOC_CONFIG que indica cuáles campos opcionales
 * incluir. El orden de los campos es siempre el orden canónico del XSD DGII.
 */
function buildIdDocXml(data: EcfData): string {
  const cfg = IDDOC_CONFIG[data.tipoEcf];
  if (!cfg) throw new BuildEcfError(`IDDOC_CONFIG sin entrada para tipo: ${data.tipoEcf}`);

  const tp = data.tipoPago ?? 1;

  const tablaFormasPago = `
      <TablaFormasPago>
        <FormaDePago>
          <FormaPago>${tp}</FormaPago>
          <MontoPago>${f2(data.montoTotal)}</MontoPago>
        </FormaDePago>
      </TablaFormasPago>`;

  return `
    <IdDoc>
      <TipoeCF>${data.tipoEcf}</TipoeCF>
      <eNCF>${data.encf}</eNCF>
      ${cfg.nc    ? `<IndicadorNotaCredito>${data.indicadorNotaCredito ?? 0}</IndicadorNotaCredito>` : ''}
      ${cfg.fv    ? `<FechaVencimientoSecuencia>${formatDate(data.fechaVencimientoSecuencia)}</FechaVencimientoSecuencia>` : ''}
      ${cfg.img   ? `<IndicadorMontoGravado>0</IndicadorMontoGravado>` : ''}
      ${cfg.ti    ? `<TipoIngresos>${data.tipoIngresos ?? '01'}</TipoIngresos>` : ''}
      <TipoPago>${tp}</TipoPago>
      ${opt('FechaLimitePago', data.fechaLimitePago ? formatDate(data.fechaLimitePago) : undefined)}
      ${cfg.tabla ? tablaFormasPago : ''}
    </IdDoc>`;
}

/**
 * Construye el bloque <Comprador> según la regla del tipo de e-CF.
 *
 * Tipo 32 (OPCIONAL sin RNC): siempre se incluye con mínimo "Consumidor Final"
 * porque convertECF32ToRFCE() extrae <Comprador> del ECF firmado para el RFCE.
 * Sin <Comprador> en el ECF → el RFCE resultante queda inválido → DGII rechaza.
 *
 * Tipos 46/47 (EXTRANJERO): usar IdentificadorExtranjero.
 * NUNCA usar RNCComprador=99999999901 como placeholder → DGII cod=1385.
 * Default cuando no hay datos: { nombre: 'Comprador Exterior', identificacion: 'EXT00000001' }.
 */
function buildCompradorXml(data: EcfData): string {
  const { compradorRule } = TIPO_CONFIG[data.tipoEcf];

  if (compradorRule === 'PROHIBIDO') return '';

  if (compradorRule === 'EXTRANJERO') {
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

  // OPCIONAL sin RNC → mínimo con nombre (requerido para RFCE en tipo 32)
  if (compradorRule === 'OPCIONAL' && !data.rncComprador) {
    return `
    <Comprador>
      <RazonSocialComprador>${escXml(data.razonSocialComprador ?? 'Consumidor Final')}</RazonSocialComprador>
      ${opt('EmailComprador', data.emailComprador)}
    </Comprador>`;
  }

  // OBLIGATORIO o OPCIONAL con RNC
  return `
    <Comprador>
      ${opt('RNCComprador', data.rncComprador)}
      ${opt('RazonSocialComprador', data.razonSocialComprador ? escXml(data.razonSocialComprador) : undefined)}
      ${opt('EmailComprador', data.emailComprador)}
    </Comprador>`;
}

/**
 * Construye <InformacionReferencia> para notas de débito/crédito.
 * También puede incluirse en otros tipos que modifiquen un e-CF existente.
 *
 * Orden de campos requerido por XSD (confirmado por error "expected CodigoModificacion"):
 *   NCFModificado → [RNCOtroContribuyente] → FechaNCFModificado →
 *   CodigoModificacion → [RazonModificacion]
 *
 * CodigoModificacion es siempre requerido. Default '2' (Disminución/CorrTexto).
 * AVISO: '2' exige que montoTotal sea cero — para notas monetarias usar '3'.
 */
function buildReferenciaXml(data: EcfData): string {
  if (!data.ncfModificado) return '';

  const fechaRef = data.fechaNcfModificado
    ? formatDate(data.fechaNcfModificado)
    : formatDate(new Date());

  return `
  <InformacionReferencia>
    <NCFModificado>${data.ncfModificado}</NCFModificado>
    ${opt('RNCOtroContribuyente', data.rncOtroContribuyente)}
    <FechaNCFModificado>${fechaRef}</FechaNCFModificado>
    <CodigoModificacion>${data.codigoModificacion ?? '2'}</CodigoModificacion>
    ${opt('RazonModificacion', data.razonModificacion ? escXml(data.razonModificacion) : undefined)}
  </InformacionReferencia>`;
}

/** Construye <InformacionExportacion> — solo para tipo 46 */
function buildExportacionXml(data: EcfData): string {
  if (!data.informacionExportacion) return '';
  const x = data.informacionExportacion;
  return `
  <InformacionExportacion>
    ${opt('PaisExportacion', x.pais)}
    ${opt('RegimenAduanero', x.regimenAduanero)}
    ${opt('NumeroDUAoEmbarque', x.numeroDUA)}
    ${optNonZero('MontoGravadoTotalExportacion', x.montoGravadoTotal !== undefined ? f2(x.montoGravadoTotal) : undefined)}
  </InformacionExportacion>`;
}

/** Construye <OtraMoneda> — para tipos 46 y 47 */
function buildOtraMonedaXml(data: EcfData): string {
  if (!data.otraMoneda) return '';
  const m = data.otraMoneda;
  return `
  <OtraMoneda>
    <TipoMoneda>${m.tipoMoneda}</TipoMoneda>
    <TipoCambio>${m.tipoCambio.toFixed(4)}</TipoCambio>
    ${optNonZero('MontoGravadoTotalOtraMoneda', m.montoGravadoTotalOtraMoneda !== undefined ? f2(m.montoGravadoTotalOtraMoneda) : undefined)}
    ${optNonZero('MontoExentoOtraMoneda',       m.montoExentoOtraMoneda       !== undefined ? f2(m.montoExentoOtraMoneda)       : undefined)}
    ${optNonZero('TotalITBISOtraMoneda',        m.totalITBISOtraMoneda        !== undefined ? f2(m.totalITBISOtraMoneda)        : undefined)}
    ${optNonZero('MontoTotalOtraMoneda',        m.montoTotalOtraMoneda        !== undefined ? f2(m.montoTotalOtraMoneda)        : undefined)}
  </OtraMoneda>`;
}

// ─── Totales (uno por modo de facturación) ────────────────────────────────────

/**
 * <Totales> para modo NORMAL — tipos 31, 32, 33, 34, 45.
 *
 * Estructura: MontoGravadoTotal → [bases por tasa] → [MontoExento] →
 *   [tasas ITBIS] → [TotalITBIS] → [totales ITBIS por tasa] →
 *   MontoTotal → [TotalITBISRetenido] → [TotalISRRetencion]
 *
 * Los campos TotalITBISRetenido y TotalISRRetencion van DESPUÉS de MontoTotal
 * — confirmado por el orden de campos en la interfaz IECF.ts (campos 21-22).
 */
function buildTotalesNormal(data: EcfData): string {
  return `
    <Totales>
      <MontoGravadoTotal>${f2(data.montoGravadoTotal)}</MontoGravadoTotal>
      ${optNonZero('MontoGravadoI1', data.montoGravadoI1 !== undefined ? f2(data.montoGravadoI1) : undefined)}
      ${optNonZero('MontoGravadoI2', data.montoGravadoI2 !== undefined ? f2(data.montoGravadoI2) : undefined)}
      ${optNonZero('MontoGravadoI3', data.montoGravadoI3 !== undefined ? f2(data.montoGravadoI3) : undefined)}
      ${optNonZero('MontoExento', data.montoExento !== undefined ? f2(data.montoExento) : undefined)}
      ${(data.itbis1 ?? 0) > 0 ? `<ITBIS1>18</ITBIS1>` : ''}
      ${(data.itbis2 ?? 0) > 0 ? `<ITBIS2>16</ITBIS2>` : ''}
      ${optNonZero('TotalITBIS', data.totalItbis > 0 ? f2(data.totalItbis) : undefined)}
      ${(data.itbis1 ?? 0) > 0 ? `<TotalITBIS1>${f2(data.itbis1!)}</TotalITBIS1>` : ''}
      ${(data.itbis2 ?? 0) > 0 ? `<TotalITBIS2>${f2(data.itbis2!)}</TotalITBIS2>` : ''}
      ${(data.itbis3 ?? 0) > 0 ? `<TotalITBIS3>${f2(data.itbis3!)}</TotalITBIS3>` : ''}
      <MontoTotal>${f2(data.montoTotal)}</MontoTotal>
      ${optNonZero('TotalITBISRetenido', data.totalITBISRetenido !== undefined ? f2(data.totalITBISRetenido) : undefined)}
      ${optNonZero('TotalISRRetencion',  data.totalISRRetenido   !== undefined ? f2(data.totalISRRetenido)   : undefined)}
    </Totales>`;
}

/**
 * <Totales> para modo EXENTO — tipos 43 (Gastos Menores) y 44 (Regímenes Especiales).
 *
 * Solo MontoExento + MontoTotal; sin MontoGravadoTotal ni ITBIS.
 *
 * Fallback de montoExento: calcularTotales() puede llenar montoGravadoI3
 * en lugar de montoExento cuando tasaItbis=0. Se prioriza montoExento explícito
 * y luego montoGravadoI3 como fuente alternativa de la base exenta.
 */
function buildTotalesExento(data: EcfData): string {
  const exento = (data.montoExento ?? 0) > 0
    ? data.montoExento!
    : (data.montoGravadoI3 ?? 0) > 0
      ? data.montoGravadoI3!
      : data.montoTotal;

  return `
    <Totales>
      <MontoExento>${f2(exento)}</MontoExento>
      <MontoTotal>${f2(data.montoTotal)}</MontoTotal>
    </Totales>`;
}

/**
 * <Totales> para modo TASA_CERO — tipo 46 (Exportaciones).
 *
 * IndicadorFacturacion=3 requiere los siguientes campos (secuencia de errores DGII
 * que confirmaron cada uno):
 *   cod=1950 → MontoGravadoI3 requerido cuando hay IndicadorFacturacion=3
 *   cod=1990 → ITBIS3 requerido cuando existe MontoGravadoI3
 *   cod=11031 → TotalITBIS3 requerido cuando existe ITBIS3
 *
 * ITBIS3=0 (tasa 0%) y TotalITBIS3=0.00 (sin monto de impuesto).
 */
function buildTotalesTasaCero(data: EcfData): string {
  const gravado = (data.montoGravadoI3 ?? 0) > 0
    ? data.montoGravadoI3!
    : data.montoGravadoTotal > 0
      ? data.montoGravadoTotal
      : data.montoTotal;

  return `
    <Totales>
      <MontoGravadoTotal>${f2(gravado)}</MontoGravadoTotal>
      <MontoGravadoI3>${f2(gravado)}</MontoGravadoI3>
      <ITBIS3>0</ITBIS3>
      <TotalITBIS>0.00</TotalITBIS>
      <TotalITBIS3>0.00</TotalITBIS3>
      <MontoTotal>${f2(data.montoTotal)}</MontoTotal>
    </Totales>`;
}

/**
 * <Totales> para modo RETENCION_ITBIS — tipo 41 (Compras).
 *
 * TotalITBISRetenido = suma de MontoITBISRetenido de todos los ítems.
 * TotalISRRetencion  = suma de MontoISRRetenido de ítems Servicio (si aplica).
 * Ambos van DESPUÉS de MontoTotal (XSD IECF.ts campos 21-22).
 */
function buildTotalesRetencionItbis(data: EcfData): string {
  const itbisRetenido = data.items.reduce((s, i) => s + i.montoItem * (i.tasaItbis ?? 0), 0);
  const isrRetenido   = data.items
    .filter(i => i.indicadorBienoServicio === 2)
    .reduce((s, i) => s + i.montoItem * ISR_EXTERIOR, 0);

  return `
    <Totales>
      <MontoGravadoTotal>${f2(data.montoGravadoTotal)}</MontoGravadoTotal>
      ${optNonZero('MontoGravadoI1', data.montoGravadoI1 !== undefined ? f2(data.montoGravadoI1) : undefined)}
      ${optNonZero('MontoGravadoI2', data.montoGravadoI2 !== undefined ? f2(data.montoGravadoI2) : undefined)}
      ${optNonZero('MontoGravadoI3', data.montoGravadoI3 !== undefined ? f2(data.montoGravadoI3) : undefined)}
      ${(data.itbis1 ?? 0) > 0 ? `<ITBIS1>18</ITBIS1>` : ''}
      ${(data.itbis2 ?? 0) > 0 ? `<ITBIS2>16</ITBIS2>` : ''}
      ${optNonZero('TotalITBIS', data.totalItbis > 0 ? f2(data.totalItbis) : undefined)}
      ${(data.itbis1 ?? 0) > 0 ? `<TotalITBIS1>${f2(data.itbis1!)}</TotalITBIS1>` : ''}
      ${(data.itbis2 ?? 0) > 0 ? `<TotalITBIS2>${f2(data.itbis2!)}</TotalITBIS2>` : ''}
      <MontoTotal>${f2(data.montoTotal)}</MontoTotal>
      ${itbisRetenido > 0 ? `<TotalITBISRetenido>${f2(itbisRetenido)}</TotalITBISRetenido>` : ''}
      ${isrRetenido   > 0 ? `<TotalISRRetencion>${f2(isrRetenido)}</TotalISRRetencion>`     : ''}
    </Totales>`;
}

/**
 * <Totales> para modo RETENCION_ISR — tipo 47 (Pagos al Exterior).
 *
 * El pagador retiene ISR al beneficiario no residente: 27% sobre el monto bruto
 * (Ley 11-92, Art. 306-bis). Sin ITBIS — los pagos al exterior son exentos.
 * TotalISRRetencion va DESPUÉS de MontoTotal (XSD IECF.ts campo 22).
 */
function buildTotalesRetencionIsr(data: EcfData): string {
  const isrRetenido = data.items.reduce((s, i) => s + i.montoItem * ISR_EXTERIOR, 0);
  const exento = (data.montoExento ?? 0) > 0
    ? data.montoExento!
    : (data.montoGravadoI3 ?? 0) > 0
      ? data.montoGravadoI3!
      : data.montoTotal;

  return `
    <Totales>
      <MontoExento>${f2(exento)}</MontoExento>
      <MontoTotal>${f2(data.montoTotal)}</MontoTotal>
      ${isrRetenido > 0 ? `<TotalISRRetencion>${f2(isrRetenido)}</TotalISRRetencion>` : ''}
    </Totales>`;
}

/** Dispatcher: delega al builder de Totales correspondiente al modo */
function buildTotalesXml(data: EcfData, modo: ModoFacturacion): string {
  switch (modo) {
    case 'EXENTO':          return buildTotalesExento(data);
    case 'TASA_CERO':       return buildTotalesTasaCero(data);
    case 'RETENCION_ITBIS': return buildTotalesRetencionItbis(data);
    case 'RETENCION_ISR':   return buildTotalesRetencionIsr(data);
    default:                return buildTotalesNormal(data);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Construye el XML de un e-CF listo para firmar con DgiiSigner.signXml().
 *
 * @param  data   Campos del comprobante (ver interfaz EcfData)
 * @returns       XML sin firma: `<?xml version="1.0"...><ECF>...</ECF>`
 * @throws        BuildEcfError si faltan campos obligatorios según el tipo
 *
 * Flujo completo después de buildEcfXml():
 *   1. signer.signXml(xml, 'ECF')                         → XML firmado
 *   2a. Tipo 32 < RD$250K:
 *       signer.toRfce(signedXml)                          → rfceXml
 *       signer.signXml(rfceXml, 'RFCE')                   → RFCE firmado
 *       signer.sendSummary(signedRfce)                    → síncrono (sin trackId)
 *   2b. Resto de tipos:
 *       signer.sendDocument(signedXml, encf)              → { trackId } (asíncrono)
 */
export function buildEcfXml(data: EcfData): string {
  const { modoFacturacion } = validarEcf(data);

  const itemsXml      = data.items.map(item => buildItemXml(item, modoFacturacion)).join('');
  const idDocXml      = buildIdDocXml(data);
  const compradorXml  = buildCompradorXml(data);
  const totalesXml    = buildTotalesXml(data, modoFacturacion);
  const referenciaXml = buildReferenciaXml(data);
  const exportXml     = buildExportacionXml(data);
  const monedaXml     = buildOtraMonedaXml(data);

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
    ${exportXml}
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
