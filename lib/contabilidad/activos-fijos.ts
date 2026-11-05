/**
 * Activos fijos: categorías con sus cuentas, baja (total o de unas pocas
 * unidades) y depreciación cuando hubo bajas. Todo puro, sin base ni red.
 *
 * Una ficha puede ser de varias unidades iguales (30 butacas, 12 computadoras):
 * `cantidad` es cuántas se compraron y `costo` el de todas juntas. Dar de baja
 * una unidad no toca el costo original: queda anotada en `contabilidad_activos_bajas`
 * con su parte del costo y de la depreciación, y la cuota mensual de ahí en
 * adelante baja en proporción a las unidades que quedan (ver `calcularCuotasConBajas`
 * en depreciacion.ts).
 */

// ── Categorías ───────────────────────────────────────────────────────────────

export interface CategoriaActivo {
  clave: string;
  label: string;
  /** Códigos del catálogo base: la cuenta del activo y su depreciación acumulada. */
  cuentaActivo: string;
  cuentaDeprecAcum: string;
  /** Un terreno no pierde valor por el uso: no se deprecia. */
  deprecia: boolean;
  ejemplo: string;
}

export const CATEGORIAS_ACTIVO: readonly CategoriaActivo[] = [
  { clave: 'terrenos', label: 'Terrenos', cuentaActivo: '1203', cuentaDeprecAcum: '1202', deprecia: false, ejemplo: 'Solar, terreno del colegio' },
  { clave: 'edificios', label: 'Edificios', cuentaActivo: '1204', cuentaDeprecAcum: '1208', deprecia: true, ejemplo: 'Edificio principal, aulas, nave' },
  { clave: 'mobiliario', label: 'Mobiliario y equipo de oficina', cuentaActivo: '1205', cuentaDeprecAcum: '1209', deprecia: true, ejemplo: 'Butacas, escritorios, pizarras, archivos' },
  { clave: 'transporte', label: 'Equipo de transporte', cuentaActivo: '1206', cuentaDeprecAcum: '1210', deprecia: true, ejemplo: 'Autobús escolar, camioneta' },
  { clave: 'computo', label: 'Equipo de cómputo', cuentaActivo: '1207', cuentaDeprecAcum: '1211', deprecia: true, ejemplo: 'Computadoras, servidor, proyectores' },
  { clave: 'otros', label: 'Otros activos fijos', cuentaActivo: '1201', cuentaDeprecAcum: '1202', deprecia: true, ejemplo: 'Lo que no encaja en las anteriores' },
];

export function categoriaActivo(clave: string | null | undefined): CategoriaActivo | null {
  return CATEGORIAS_ACTIVO.find((c) => c.clave === clave) ?? null;
}

// ── Baja ─────────────────────────────────────────────────────────────────────

export class BajaActivoError extends Error {
  constructor(message: string, readonly status = 422) { super(message); this.name = 'BajaActivoError'; }
}

export interface EstadoActivoParaBaja {
  /** Costo de lo que queda (el original menos lo ya dado de baja), en centavos. */
  costoVigenteCents: number;
  /** Depreciación acumulada de lo que queda, en centavos. */
  acumuladaVigenteCents: number;
  /** Unidades que quedan. */
  cantidadVigente: number;
}

export interface CalculoBaja {
  unidades: number;
  esTotal: boolean;
  costoBajaCents: number;
  depreciacionBajaCents: number;
  /** Lo que valían en libros esas unidades. */
  valorLibrosBajaCents: number;
  precioVentaCents: number;
  /** Positivo = ganancia; negativo = pérdida. */
  resultadoCents: number;
}

/**
 * Cuánto del costo y de la depreciación se va con las unidades dadas de baja.
 * Es proporcional a las unidades que quedan; si se dan de baja todas, se va todo
 * lo que quede (sin residuos de redondeo).
 */
export function calcularBaja(estado: EstadoActivoParaBaja, unidades: number, precioVentaCents: number): CalculoBaja {
  if (!Number.isSafeInteger(unidades) || unidades <= 0) throw new BajaActivoError('Indica cuántas unidades se dan de baja (al menos una).');
  if (unidades > estado.cantidadVigente) {
    throw new BajaActivoError(`Solo quedan ${estado.cantidadVigente} ${estado.cantidadVigente === 1 ? 'unidad' : 'unidades'} de este activo.`);
  }
  if (!Number.isSafeInteger(precioVentaCents) || precioVentaCents < 0) throw new BajaActivoError('El precio de venta no puede ser negativo.');

  const esTotal = unidades === estado.cantidadVigente;
  const costoBajaCents = esTotal ? estado.costoVigenteCents : Math.round((estado.costoVigenteCents * unidades) / estado.cantidadVigente);
  let depreciacionBajaCents = esTotal ? estado.acumuladaVigenteCents : Math.round((estado.acumuladaVigenteCents * unidades) / estado.cantidadVigente);
  // Nunca se deprecia más que el costo: un asiento con la depreciación mayor al activo no tendría sentido.
  depreciacionBajaCents = Math.min(depreciacionBajaCents, costoBajaCents);
  const valorLibrosBajaCents = costoBajaCents - depreciacionBajaCents;
  return {
    unidades, esTotal, costoBajaCents, depreciacionBajaCents, valorLibrosBajaCents, precioVentaCents,
    resultadoCents: precioVentaCents - valorLibrosBajaCents,
  };
}

export interface CuentasBaja {
  activo: number;
  deprecAcum: number;
  /** Donde entra el dinero de la venta (caja o banco). Solo si hubo precio. */
  cobro: number | null;
  ganancia: number;
  perdida: number;
}

export interface LineaBaja { cuentaId: number; debeCents: number; haberCents: number; descripcion: string }

/**
 * El asiento de la baja:
 *
 *   Debe  Depreciación acumulada     lo ya depreciado de esas unidades
 *   Debe  Caja / banco               el precio, si se vendió
 *   Debe  Pérdida en baja            si valían más en libros que lo cobrado
 *     Haber  Activo (su cuenta)      el costo de esas unidades
 *     Haber  Ganancia en venta       si se cobró más de lo que valían en libros
 *
 * Cuadra siempre: debe = dep + precio + pérdida y haber = costo + ganancia, y
 * precio − (costo − dep) = ganancia − pérdida.
 */
export function lineasAsientoBaja(c: CalculoBaja, cuentas: CuentasBaja, nombre: string): LineaBaja[] {
  if (c.precioVentaCents > 0 && cuentas.cobro == null) {
    throw new BajaActivoError('Indica en qué caja o banco entró el dinero de la venta.');
  }
  const lineas: LineaBaja[] = [];
  if (c.depreciacionBajaCents > 0) lineas.push({ cuentaId: cuentas.deprecAcum, debeCents: c.depreciacionBajaCents, haberCents: 0, descripcion: `Depreciación acumulada · ${nombre}` });
  if (c.precioVentaCents > 0) lineas.push({ cuentaId: cuentas.cobro!, debeCents: c.precioVentaCents, haberCents: 0, descripcion: `Cobro por la venta · ${nombre}` });
  if (c.resultadoCents < 0) lineas.push({ cuentaId: cuentas.perdida, debeCents: -c.resultadoCents, haberCents: 0, descripcion: `Pérdida en la baja · ${nombre}` });
  lineas.push({ cuentaId: cuentas.activo, debeCents: 0, haberCents: c.costoBajaCents, descripcion: `Baja del activo · ${nombre}` });
  if (c.resultadoCents > 0) lineas.push({ cuentaId: cuentas.ganancia, debeCents: 0, haberCents: c.resultadoCents, descripcion: `Ganancia en la venta · ${nombre}` });
  return lineas;
}

// ── Ficha desde una compra ───────────────────────────────────────────────────

export interface LineaDeCompraParaActivo {
  descripcion: string | null;
  categoria: string | null;
  productoId: number | null;
  cantidad: number;
  /** Base de la línea más su parte de lo que no se recupera (ITBIS al costo, ISC, propina), en centavos. */
  costoCents: number;
}

export interface FichaDesdeCompra {
  linea: number;
  nombre: string;
  cantidad: number;
  costoCents: number;
}

/** Las líneas de una compra que son activos fijos y de las que hay que abrir ficha. */
export function fichasDeCompra(lineas: readonly LineaDeCompraParaActivo[]): FichaDesdeCompra[] {
  const fichas: FichaDesdeCompra[] = [];
  lineas.forEach((l, i) => {
    if (l.categoria !== 'activo_fijo' || l.productoId) return;
    if (!Number.isSafeInteger(l.costoCents) || l.costoCents <= 0) return;
    fichas.push({
      linea: i,
      nombre: (l.descripcion?.trim() || 'Activo fijo de una compra').slice(0, 160),
      cantidad: Number.isSafeInteger(l.cantidad) && l.cantidad >= 1 ? l.cantidad : 1,
      costoCents: l.costoCents,
    });
  });
  return fichas;
}
