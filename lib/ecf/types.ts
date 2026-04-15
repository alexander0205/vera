/**
 * Tipos TypeScript para el dominio de e-CF (Comprobantes Fiscales Electrónicos)
 * Según Ley 32-23 y normas DGII
 */

export const TIPOS_ECF = {
  '31': 'Factura de Crédito Fiscal Electrónica',
  '32': 'Factura de Consumo Electrónica',
  '33': 'Nota de Débito Electrónica',
  '34': 'Nota de Crédito Electrónica',
  '41': 'Comprobante Electrónico de Compras',
  '43': 'Comprobante para Gastos Menores',
  '44': 'Comprobante para Regímenes Especiales',
  '45': 'Comprobante Electrónico Gubernamental',
  '46': 'Comprobante para Exportaciones',
  '47': 'Comprobante para Pagos al Exterior',
} as const;

export type TipoEcf = keyof typeof TIPOS_ECF;

// ─── Reglas de negocio por tipo ────────────────────────────────────────────────

export interface TipoEcfRegla {
  /** Descripción amigable para el usuario */
  descripcion: string;
  /** Categoría general del comprobante */
  categoria: 'venta' | 'compra' | 'especial';
  /** Si el RNC del comprador/proveedor es obligatorio */
  requiereRncComprador: boolean;
  /** Si la razón social del comprador/proveedor es obligatoria */
  requiereRazonSocial: boolean;
  /** Si debe referenciar un e-NCF previo (notas débito/crédito) */
  requiereNcfModificado: boolean;
  /** Si se puede incluir ITBIS en los ítems */
  permiteItbis: boolean;
  /** Etiqueta para el campo "comprador" según contexto del tipo */
  compradorLabel: string;
  /** Etiqueta para el campo RNC según contexto del tipo */
  rncLabel: string;
  /** Tipos de pago permitidos: 1=Contado, 2=Crédito, 3=Gratuito, 4=Uso/Consumo */
  tiposPagoPermitidos: number[];
  /** Nota informativa para el usuario */
  nota: string;
}

export const TIPO_ECF_REGLAS: Record<string, TipoEcfRegla> = {
  '31': {
    descripcion: 'Para ventas a empresas o contribuyentes con RNC. Permite al comprador deducir ITBIS.',
    categoria: 'venta',
    requiereRncComprador: true,
    requiereRazonSocial: true,
    requiereNcfModificado: false,
    permiteItbis: true,
    compradorLabel: 'Empresa compradora',
    rncLabel: 'RNC o Cédula del comprador',
    tiposPagoPermitidos: [1, 2, 3, 4],
    nota: 'B2B — El comprador puede deducir el ITBIS en su declaración.',
  },
  '32': {
    descripcion: 'Para ventas al consumidor final. Bajo DOP 250,000 el RNC es opcional.',
    categoria: 'venta',
    requiereRncComprador: false,
    requiereRazonSocial: false,
    requiereNcfModificado: false,
    permiteItbis: true,
    compradorLabel: 'Consumidor (opcional)',
    rncLabel: 'Cédula / RNC (opcional)',
    tiposPagoPermitidos: [1, 2, 3, 4],
    nota: 'Si el monto supera DOP 250,000 es obligatorio incluir los datos del comprador.',
  },
  '33': {
    descripcion: 'Para aumentar el valor de una factura ya emitida (cargos adicionales).',
    categoria: 'venta',
    requiereRncComprador: true,
    requiereRazonSocial: true,
    requiereNcfModificado: true,
    permiteItbis: true,
    compradorLabel: 'Empresa compradora (misma del e-NCF original)',
    rncLabel: 'RNC o Cédula del comprador',
    tiposPagoPermitidos: [1, 2],
    nota: 'Debe referenciar el e-NCF original que se está modificando.',
  },
  '34': {
    descripcion: 'Para reducir el valor de una factura o registrar devoluciones/descuentos.',
    categoria: 'venta',
    requiereRncComprador: true,
    requiereRazonSocial: true,
    requiereNcfModificado: true,
    permiteItbis: true,
    compradorLabel: 'Empresa compradora (misma del e-NCF original)',
    rncLabel: 'RNC o Cédula del comprador',
    tiposPagoPermitidos: [1, 2],
    nota: 'Debe referenciar el e-NCF original que se anula o reduce.',
  },
  '41': {
    descripcion: 'Para registrar compras a proveedores locales con RNC activo.',
    categoria: 'compra',
    requiereRncComprador: true,
    requiereRazonSocial: true,
    requiereNcfModificado: false,
    permiteItbis: true,
    compradorLabel: 'Proveedor',
    rncLabel: 'RNC o Cédula del proveedor',
    tiposPagoPermitidos: [1, 2],
    nota: 'Permite reclamar el ITBIS pagado a proveedores locales.',
  },
  '43': {
    descripcion: 'Para gastos menores de caja chica sin comprobante formal del proveedor.',
    categoria: 'compra',
    requiereRncComprador: false,
    requiereRazonSocial: false,
    requiereNcfModificado: false,
    permiteItbis: false,
    compradorLabel: 'Proveedor (opcional)',
    rncLabel: 'RNC o Cédula (opcional)',
    tiposPagoPermitidos: [1],
    nota: 'Para pequeños gastos ocasionales sin RNC del proveedor. No genera crédito ITBIS.',
  },
  '44': {
    descripcion: 'Para transacciones bajo regímenes aduaneros especiales (zonas francas, etc.).',
    categoria: 'especial',
    requiereRncComprador: true,
    requiereRazonSocial: true,
    requiereNcfModificado: false,
    permiteItbis: false,
    compradorLabel: 'Empresa en régimen especial',
    rncLabel: 'RNC o Cédula del comprador',
    tiposPagoPermitidos: [1, 2],
    nota: 'Exclusivo para operaciones dentro de regímenes aduaneros especiales autorizados.',
  },
  '45': {
    descripcion: 'Para ventas o servicios a entidades del gobierno dominicano.',
    categoria: 'venta',
    requiereRncComprador: true,
    requiereRazonSocial: true,
    requiereNcfModificado: false,
    permiteItbis: true,
    compradorLabel: 'Institución gubernamental',
    rncLabel: 'RNC institucional',
    tiposPagoPermitidos: [1, 2],
    nota: 'Solo para instituciones del Estado dominicano (ministerios, ayuntamientos, etc.).',
  },
  '46': {
    descripcion: 'Para exportaciones de bienes o servicios al exterior (exento de ITBIS).',
    categoria: 'especial',
    requiereRncComprador: false,
    requiereRazonSocial: true,
    requiereNcfModificado: false,
    permiteItbis: false,
    compradorLabel: 'Comprador en el exterior',
    rncLabel: 'ID fiscal del cliente (opcional)',
    tiposPagoPermitidos: [1, 2],
    nota: 'Las exportaciones están exentas de ITBIS. Se requiere documentación aduanera.',
  },
  '47': {
    descripcion: 'Para pagos o remesas a proveedores o personas físicas en el exterior.',
    categoria: 'especial',
    requiereRncComprador: false,
    requiereRazonSocial: true,
    requiereNcfModificado: false,
    permiteItbis: false,
    compradorLabel: 'Beneficiario en el exterior',
    rncLabel: 'Pasaporte / ID fiscal (opcional)',
    tiposPagoPermitidos: [1, 2],
    nota: 'Sujeto a retención ISR/ITBIS según el tipo de servicio prestado.',
  },
};

// ─── Helpers de validación ─────────────────────────────────────────────────────

export interface ValidacionEcfError {
  campo: string;
  mensaje: string;
}

/**
 * Valida los datos de un e-CF según las reglas del tipo seleccionado.
 * Retorna lista de errores (vacía si todo está OK).
 */
export function validarDatosEcf(
  tipoEcf: string,
  data: {
    rncComprador?: string;
    razonSocialComprador?: string;
    ncfModificado?: string;
    montoTotal?: number;
    items: Array<{ tasaItbis?: number | null }>;
  }
): ValidacionEcfError[] {
  const regla = TIPO_ECF_REGLAS[tipoEcf];
  if (!regla) return [{ campo: 'tipoEcf', mensaje: `Tipo de e-CF desconocido: ${tipoEcf}` }];

  const errores: ValidacionEcfError[] = [];

  if (regla.requiereRncComprador && !data.rncComprador?.trim()) {
    errores.push({ campo: 'rncComprador', mensaje: `El ${regla.rncLabel} es obligatorio para tipo ${tipoEcf}` });
  }

  if (regla.requiereRazonSocial && !data.razonSocialComprador?.trim()) {
    errores.push({ campo: 'razonSocialComprador', mensaje: `La razón social del ${regla.compradorLabel} es obligatoria` });
  }

  if (regla.requiereNcfModificado && !data.ncfModificado?.trim()) {
    errores.push({ campo: 'ncfModificado', mensaje: 'Debe indicar el e-NCF original que se modifica' });
  }

  // Tipo 32: si monto >= 250,000 DOP requiere datos del comprador
  if (tipoEcf === '32' && (data.montoTotal ?? 0) >= 250000) {
    if (!data.rncComprador?.trim()) {
      errores.push({ campo: 'rncComprador', mensaje: 'Factura de Consumo ≥ DOP 250,000 requiere RNC o cédula del comprador' });
    }
    if (!data.razonSocialComprador?.trim()) {
      errores.push({ campo: 'razonSocialComprador', mensaje: 'Factura de Consumo ≥ DOP 250,000 requiere nombre/razón social del comprador' });
    }
  }

  // Tipos sin ITBIS: verificar que no se incluyó
  if (!regla.permiteItbis) {
    const conItbis = data.items.some((i) => i.tasaItbis && i.tasaItbis > 0);
    if (conItbis) {
      errores.push({ campo: 'items', mensaje: `El tipo ${tipoEcf} no permite ITBIS en los ítems` });
    }
  }

  return errores;
}

/**
 * Formatea un número de secuencia e-NCF
 * Ej: tipo=32, secuencia=5 → "E320000000005"
 */
export function formatearEncf(tipoEcf: string, secuencia: number | bigint): string {
  return `E${tipoEcf}${secuencia.toString().padStart(10, '0')}`;
}

/**
 * Extrae el tipo y número de secuencia de un e-NCF
 * Ej: "E320000000005" → { tipo: "32", secuencia: 5 }
 */
export function parsearEncf(encf: string): { tipo: string; secuencia: number } | null {
  const match = encf.match(/^E(\d{2})(\d{10})$/);
  if (!match) return null;
  return { tipo: match[1], secuencia: parseInt(match[2], 10) };
}

// Planes en DOP (pesos dominicanos)
export const PLANES_LIMITES: Record<string, number> = {
  free: 30,
  base: 300,
  plus: 1500,
  business: 5000,
  enterprise: Infinity,
};

export const PLANES_PRECIOS: Record<string, { mensual: number; label: string }> =
  {
    free: { mensual: 0, label: 'Gratis' },
    base: { mensual: 800, label: 'Básico' },
    plus: { mensual: 2000, label: 'Pro' },
    business: { mensual: 5000, label: 'Business' },
    enterprise: { mensual: 0, label: 'Enterprise' },
  };

export interface EcfItemInput {
  nombreItem: string;
  descripcionItem?: string;
  cantidadItem: number;
  unidadMedidaItem?: string;
  precioUnitarioItem: number;
  descuentoMonto?: number;
  tasaItbis?: number;
  indicadorBienoServicio?: 1 | 2;
}

export interface CrearEcfInput {
  tipoEcf: TipoEcf;
  clientId?: number;
  rncComprador?: string;
  razonSocialComprador?: string;
  emailComprador?: string;
  tipoPago?: 1 | 2 | 3;
  fechaLimitePago?: Date;
  items: EcfItemInput[];
  ncfModificado?: string;  // Para tipos 33 y 34
}

export interface EcfTotales {
  montoGravadoI1: number;  // base 18%
  montoGravadoI2: number;  // base 16%
  montoGravadoI3: number;  // base 0%
  montoExento: number;
  itbis1: number;
  itbis2: number;
  itbis3: number;
  totalItbis: number;
  montoGravadoTotal: number;
  montoTotal: number;
}

/**
 * Calcula los totales de una factura a partir de los items
 */
export function calcularTotales(items: EcfItemInput[]): EcfTotales {
  let montoGravadoI1 = 0;  // 18%
  let montoGravadoI2 = 0;  // 16%
  let montoGravadoI3 = 0;  // 0%
  let montoExento = 0;
  let itbis1 = 0;
  let itbis2 = 0;
  let itbis3 = 0;

  for (const item of items) {
    const base =
      item.precioUnitarioItem * item.cantidadItem - (item.descuentoMonto ?? 0);
    const tasa = item.tasaItbis ?? undefined;

    if (tasa === 0.18) {
      montoGravadoI1 += base;
      itbis1 += base * 0.18;
    } else if (tasa === 0.16) {
      montoGravadoI2 += base;
      itbis2 += base * 0.16;
    } else if (tasa === 0) {
      montoGravadoI3 += base;
    } else {
      montoExento += base;
    }
  }

  const totalItbis = itbis1 + itbis2 + itbis3;
  const montoGravadoTotal = montoGravadoI1 + montoGravadoI2 + montoGravadoI3;
  const montoTotal = montoGravadoTotal + montoExento + totalItbis;

  return {
    montoGravadoI1: round(montoGravadoI1),
    montoGravadoI2: round(montoGravadoI2),
    montoGravadoI3: round(montoGravadoI3),
    montoExento: round(montoExento),
    itbis1: round(itbis1),
    itbis2: round(itbis2),
    itbis3: round(itbis3),
    totalItbis: round(totalItbis),
    montoGravadoTotal: round(montoGravadoTotal),
    montoTotal: round(montoTotal),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
