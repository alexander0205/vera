/**
 * Categorías de lo que se compra cuando NO es un producto del inventario.
 *
 * Cada una decide tres cosas que el usuario no tiene por qué saber: el tipo de
 * bienes y servicios del 606, la cuenta del catálogo a la que va el gasto y qué
 * retención le toca si el proveedor es una persona física. Pura, sin BD.
 */

import type { ConceptoRetencion, TipoBienes606 } from './fiscal';

export interface CategoriaCompra {
  clave: string;
  label: string;
  tipo606: TipoBienes606;
  /** Cuenta del catálogo base; si la empresa no la tiene se cae a 6101. */
  cuentaCodigo: string;
  esServicio: boolean;
  concepto: ConceptoRetencion;
  ejemplo: string;
}

export const CATEGORIAS_COMPRA: CategoriaCompra[] = [
  { clave: 'materiales', label: 'Materiales y suministros', tipo606: '02', cuentaCodigo: '6114', esServicio: false, concepto: 'bienes', ejemplo: 'Papelería, artículos de limpieza, consumibles' },
  { clave: 'honorarios', label: 'Honorarios y servicios profesionales', tipo606: '02', cuentaCodigo: '6110', esServicio: true, concepto: 'servicios_profesionales', ejemplo: 'Abogado, contador, consultoría, diseño' },
  { clave: 'tecnicos', label: 'Servicios técnicos y mano de obra', tipo606: '02', cuentaCodigo: '6112', esServicio: true, concepto: 'servicios_tecnicos', ejemplo: 'Plomero, electricista, fumigación, mensajería' },
  { clave: 'servicios_publicos', label: 'Energía, agua, teléfono e internet', tipo606: '02', cuentaCodigo: '6111', esServicio: true, concepto: 'otros_servicios', ejemplo: 'EDESUR, CAASD, Claro, Altice' },
  { clave: 'combustible', label: 'Combustible y transporte', tipo606: '02', cuentaCodigo: '6113', esServicio: false, concepto: 'bienes', ejemplo: 'Gasolina, gasoil, pasajes, peajes' },
  { clave: 'alquiler', label: 'Alquileres', tipo606: '03', cuentaCodigo: '6109', esServicio: true, concepto: 'alquiler', ejemplo: 'Local, oficina, almacén, equipos' },
  { clave: 'mantenimiento', label: 'Reparación y mantenimiento de activos', tipo606: '04', cuentaCodigo: '6112', esServicio: true, concepto: 'servicios_tecnicos', ejemplo: 'Reparar vehículos, aires, maquinaria' },
  { clave: 'seguridad', label: 'Seguridad y vigilancia', tipo606: '02', cuentaCodigo: '6101', esServicio: true, concepto: 'seguridad', ejemplo: 'Compañía de seguridad, monitoreo' },
  { clave: 'publicidad', label: 'Publicidad y mercadeo', tipo606: '02', cuentaCodigo: '6118', esServicio: true, concepto: 'otros_servicios', ejemplo: 'Redes sociales, impresos, anuncios' },
  { clave: 'representacion', label: 'Gastos de representación', tipo606: '05', cuentaCodigo: '6116', esServicio: true, concepto: 'otros_servicios', ejemplo: 'Almuerzos de negocios, atenciones a clientes' },
  { clave: 'seguros', label: 'Seguros', tipo606: '11', cuentaCodigo: '6115', esServicio: true, concepto: 'otros_servicios', ejemplo: 'Pólizas de vehículos, local, responsabilidad civil' },
  { clave: 'financieros', label: 'Comisiones bancarias e intereses', tipo606: '07', cuentaCodigo: '6117', esServicio: true, concepto: 'otros_servicios', ejemplo: 'Cargos del banco, intereses de préstamos' },
  { clave: 'personal', label: 'Gastos de personal', tipo606: '01', cuentaCodigo: '6101', esServicio: true, concepto: 'otros_servicios', ejemplo: 'Uniformes, capacitación, refrigerios del personal' },
  { clave: 'costo_venta', label: 'Insumos del costo de venta', tipo606: '09', cuentaCodigo: '5101', esServicio: false, concepto: 'bienes', ejemplo: 'Materia prima que no llevas en inventario' },
  { clave: 'activo_fijo', label: 'Compra de activo fijo', tipo606: '10', cuentaCodigo: '1201', esServicio: false, concepto: 'bienes', ejemplo: 'Computadoras, mobiliario, vehículos' },
  { clave: 'deducciones', label: 'Membresías y otras deducciones', tipo606: '06', cuentaCodigo: '6101', esServicio: true, concepto: 'otros_servicios', ejemplo: 'Cámara de comercio, asociaciones' },
  { clave: 'extraordinarios', label: 'Gastos extraordinarios', tipo606: '08', cuentaCodigo: '6101', esServicio: true, concepto: 'otros_servicios', ejemplo: 'Pérdidas, multas no fiscales' },
  { clave: 'otros', label: 'Otros gastos', tipo606: '02', cuentaCodigo: '6101', esServicio: true, concepto: 'otros_servicios', ejemplo: 'Lo que no cabe en otra categoría' },
];

export const categoriaCompra = (clave: string | null | undefined): CategoriaCompra | undefined =>
  CATEGORIAS_COMPRA.find((c) => c.clave === clave);

/** Las líneas de productos del inventario van a 1105 y cuentan como costo de venta en el 606. */
export const CUENTA_INVENTARIO = '1105';

/**
 * El tipo 606 de un comprobante con varias líneas: el de la línea de mayor
 * monto. El 606 lleva un solo tipo por NCF.
 */
export function tipo606Dominante(lineas: { tipo606: TipoBienes606; baseCents: number }[]): TipoBienes606 {
  const suma = new Map<TipoBienes606, number>();
  for (const l of lineas) suma.set(l.tipo606, (suma.get(l.tipo606) ?? 0) + l.baseCents);
  let mejor: TipoBienes606 = '09';
  let max = -1;
  for (const [tipo, total] of suma) {
    if (total > max) { mejor = tipo; max = total; }
  }
  return mejor;
}

/**
 * Categorías del formulario viejo de gastos (e43/e47) al tipo del 606. Ese
 * formulario guarda el texto de la categoría, no una clave.
 */
export const TIPO606_CATEGORIA_GASTO_VIEJA: Record<string, TipoBienes606> = {
  'Materiales y suministros': '02',
  'Servicios y mantenimiento': '02',
  'Transporte y combustible': '02',
  'Equipos y herramientas': '10',
  'Alquileres y servicios públicos': '03',
  'Mercancía / inventario': '09',
  'Otro gasto': '02',
};

/** Y a la cuenta del catálogo base, para el asiento de esos gastos. */
export const CUENTA_CATEGORIA_GASTO_VIEJA: Record<string, string> = {
  'Materiales y suministros': '6114',
  'Servicios y mantenimiento': '6112',
  'Transporte y combustible': '6113',
  'Equipos y herramientas': '6114',
  'Alquileres y servicios públicos': '6109',
  'Mercancía / inventario': '1105',
  'Otro gasto': '6101',
};
