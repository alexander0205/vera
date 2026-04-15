/**
 * Categorías de documentos ECF para República Dominicana.
 *
 * Sigue el mismo patrón de Alegra RD:
 *   "Tipo de documento" (categoría de negocio) → filtra los tipos e-NCF disponibles
 *
 * Mapping DGII B → e-CF:
 *   B01 → e31  Crédito fiscal       B02 → e32  Consumo
 *   B03 → e33  Nota de débito       B04 → e34  Nota de crédito
 *   B11 → e41  Compras              B13 → e43  Gastos menores
 *   B14 → e44  Régimen especial     B15 → e45  Gubernamental
 *   B16 → e46  Exportaciones        B17 → e47  Pagos al exterior
 */

export interface TipoEcfOpcion {
  codigo:   string;   // '31', '32', etc.
  etiqueta: string;   // 'e31 — Crédito fiscal'
  nombre:   string;   // Descripción completa para el usuario
}

export interface CategoriaEcf {
  id:    string;
  label: string;      // Nombre en la UI (igual que Alegra)
  tipos: TipoEcfOpcion[];
}

export const CATEGORIAS_ECF: CategoriaEcf[] = [
  {
    // Todos los comprobantes que emites al VENDER — B01, B02, B14, B15, B16
    id:    'factura-venta',
    label: 'Factura de venta',
    tipos: [
      { codigo: '31', etiqueta: 'e31 — Crédito fiscal',   nombre: 'Crédito Fiscal (ventas a empresas con RNC)' },
      { codigo: '32', etiqueta: 'e32 — Consumo',           nombre: 'Consumo (ventas a consumidor final)' },
      { codigo: '44', etiqueta: 'e44 — Régimen especial',  nombre: 'Régimen Especial (zonas francas y regímenes aduaneros)' },
      { codigo: '45', etiqueta: 'e45 — Gubernamental',     nombre: 'Gubernamental (ventas a instituciones del Estado)' },
      { codigo: '46', etiqueta: 'e46 — Exportaciones',     nombre: 'Exportaciones (bienes y servicios al exterior)' },
      { codigo: 'sin-ncf', etiqueta: 'Sin NCF',            nombre: 'Sin comprobante fiscal (numeración automática)' },
    ],
  },
  {
    // Reducción o devolución sobre una factura previa — B04
    id:    'nota-credito',
    label: 'Nota de crédito',
    tipos: [
      { codigo: '34', etiqueta: 'e34 — Nota de crédito',  nombre: 'Nota de Crédito (descuentos y devoluciones)' },
    ],
  },
  {
    // Cargo adicional sobre una factura previa — B03
    id:    'nota-debito',
    label: 'Nota de débito',
    tipos: [
      { codigo: '33', etiqueta: 'e33 — Nota de débito',   nombre: 'Nota de Débito (cargos adicionales)' },
    ],
  },
  {
    // Compras a proveedores locales con RNC — B11
    id:    'compras',
    label: 'Compras',
    tipos: [
      { codigo: '41', etiqueta: 'e41 — Compras',           nombre: 'Comprobante de Compras (proveedores locales con RNC)' },
    ],
  },
  {
    // Gastos sin comprobante formal + remesas al exterior — B13, B17
    id:    'gastos',
    label: 'Gastos',
    tipos: [
      { codigo: '43', etiqueta: 'e43 — Gastos menores',    nombre: 'Gastos Menores (caja chica, sin RNC de proveedor)' },
      { codigo: '47', etiqueta: 'e47 — Pagos al exterior', nombre: 'Pagos al Exterior (remesas y servicios del exterior)' },
    ],
  },
];

/** Devuelve la categoría a la que pertenece un código e-CF. */
export function getCategoriaDeEcf(codigo: string): CategoriaEcf {
  return (
    CATEGORIAS_ECF.find(c => c.tipos.some(t => t.codigo === codigo)) ??
    CATEGORIAS_ECF[0]
  );
}
