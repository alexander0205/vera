/**
 * Qué se puede hacer con un cargo escolar: las trece acciones del menú ⋮.
 *
 * Estas reglas vivían en línea dentro del menú de la ficha del estudiante, una
 * condición por ítem, sin una sola prueba. La ficha de la FAMILIA enseña los
 * mismos cargos y tiene que ofrecer exactamente lo mismo: con las condiciones
 * escritas dos veces, cada pantalla acabaría dejando hacer cosas distintas con
 * el mismo cargo en cuanto una cambiara. Aquí están una sola vez, y el menú
 * solo pregunta qué acciones tocan.
 *
 * TypeScript puro, sin React y sin base de datos; lo único que importa es un
 * tipo, que al compilar desaparece. Lo usa un componente de cliente y lo prueba
 * vitest sin montar nada.
 *
 * Sobre «el mes ya tiene factura» (`mesesConFactura` / `mesYaFacturado`): es la
 * misma regla que `factura = cargosMes.find((c) => c.ecfDocumentId != null)`
 * de la tabla de mensualidades de la ficha del estudiante, contada sobre filas
 * planas en vez de sobre meses ya agrupados. El servidor NO la comprueba: al
 * anular un cargo solo mira si ESE cargo tiene factura, no si la tiene otro
 * del mismo mes. Si aquí se pierde, nadie más la sostiene.
 */

import type { FilaMes } from './periodos-familia';

/** Lo que el menú y sus diálogos leen de verdad de un cargo. */
export interface CargoAccionable {
  id: number;
  concepto: string | null;
  conceptoTipo: string | null;
  mes: number | null;
  anio: number;
  montoCentavos: number;
  saldoCentavos: number;
  estado: string;
  ecfDocumentId: number | null;
  facturaEncf: string | null;
  facturaCodigo: string | null;
  /** Estado ante la DGII (BORRADOR, EN_PROCESO, ACEPTADO…), no el de cobro. */
  facturaEstado: string | null;
}

/** Los cinco permisos de los que depende el menú. */
export interface PermisosDeCargo {
  /** `administracion-escolar:pagos`. */
  pagos: boolean;
  /** Pagos del colegio Y `facturas:crear`: hacen falta los dos para facturar un cargo. */
  facturar: boolean;
  /** `administracion-escolar:gestionar`. */
  gestionar: boolean;
  /** `facturas:anular`. */
  anularFactura: boolean;
  /** `facturas:emitir-dgii`. */
  emitirDgii: boolean;
}

/** Las trece acciones. El orden del array ES el orden en que salen en el menú. */
export const ACCIONES_DE_CARGO = [
  'registrar-pago',
  'reenviar-whatsapp',
  'mora',
  'facturar',
  'vincular',
  'ver-factura',
  'abrir-facturacion',
  'ver-pdf',
  'imprimir',
  'emitir-dgii',
  'enviar-correo',
  'anular-cargo',
  'anular-factura',
] as const;

export type AccionDeCargo = typeof ACCIONES_DE_CARGO[number];

/**
 * Las acciones que tocan para este cargo y estos permisos, en el orden del menú.
 *
 * Lista vacía = no hay nada que ofrecer: el menú pinta «—» en vez de los tres
 * puntos.
 */
export function accionesDeCargo(
  cargo: Pick<CargoAccionable, 'estado' | 'ecfDocumentId' | 'facturaEstado'>,
  p: PermisosDeCargo,
  opts: {
    /** Solo mensualidades: el MES ya tiene una factura en otro de sus cargos.
     *  Bloquea «Anular cargo» aunque este cargo suelto no tenga factura. */
    mesTieneFactura?: boolean;
  } = {},
): AccionDeCargo[] {
  const pendiente = ['pendiente', 'parcial', 'vencido'].includes(cargo.estado);
  const tieneFactura = cargo.ecfDocumentId != null;
  // Falta emitirla: es un borrador, una histórica o una sin NCF. Mismas reglas
  // que /dashboard/facturas/[id], de donde sale el botón de verdad.
  const faltaEmitir = tieneFactura
    && !['EN_PROCESO', 'ACEPTADO', 'ACEPTADO_CONDICIONAL', 'RECHAZADO', 'ANULADO']
      .includes(cargo.facturaEstado ?? '');

  // Un `Record` y no trece `if`: si mañana se añade una acción al array y se
  // olvida aquí su condición, deja de compilar. El porqué de cada ítem está
  // junto a él en CargoActionsMenu.tsx, que es donde se lee el menú.
  const si: Record<AccionDeCargo, boolean> = {
    'registrar-pago': pendiente && tieneFactura && p.pagos,
    'reenviar-whatsapp': pendiente && tieneFactura && p.gestionar,
    'mora': pendiente && tieneFactura && p.facturar,
    'facturar': pendiente && !tieneFactura && p.facturar,
    'vincular': pendiente && !tieneFactura && p.pagos,
    'ver-factura': tieneFactura,
    'abrir-facturacion': tieneFactura,
    'ver-pdf': tieneFactura,
    'imprimir': tieneFactura,
    'emitir-dgii': faltaEmitir && p.emitirDgii,
    'enviar-correo': tieneFactura && p.facturar,
    // Anular solo cargos SIN factura (el backend bloquea el resto): el cobro vive
    // en la factura. También se oculta si el MES ya tiene factura en otro cargo
    // (mensualidad duplicada) — borrar la factura es otro flujo, no "anular cargo".
    'anular-cargo': p.gestionar && cargo.estado !== 'anulado' && !tieneFactura && !opts.mesTieneFactura,
    'anular-factura': tieneFactura && p.anularFactura,
  };

  return ACCIONES_DE_CARGO.filter((a) => si[a]);
}

/**
 * ¿Se le puede corregir el monto a este cargo desde la tabla?
 *
 * Misma regla que el servidor (PATCH de `cargos/[id]`): un cargo ya facturado
 * vale lo que diga su factura —se corrige la factura, no el cargo— y uno
 * anulado ya no es deuda de nadie. Hace falta poder gestionar el colegio.
 */
export function montoCorregible(
  cargo: Pick<CargoAccionable, 'estado' | 'ecfDocumentId'>,
  gestionar: boolean,
): boolean {
  return gestionar && cargo.estado !== 'anulado' && cargo.ecfDocumentId == null;
}

/**
 * Los meses que ya tienen factura en alguna de sus mensualidades.
 *
 * Devuelve las claves `año-mes`. Un cargo anulado no cuenta —la tabla del
 * estudiante lo quita antes de agrupar— y lo que no es mensualidad tampoco: un
 * uniforme facturado en marzo no dice nada de la colegiatura de marzo.
 */
export function mesesConFactura(
  cargos: Pick<CargoAccionable, 'conceptoTipo' | 'mes' | 'anio' | 'estado' | 'ecfDocumentId'>[],
): Set<string> {
  const meses = new Set<string>();
  for (const c of cargos) {
    if (c.conceptoTipo !== 'mensualidad') continue;
    if (c.estado === 'anulado') continue;
    if (c.mes == null || c.ecfDocumentId == null) continue;
    meses.add(`${c.anio}-${c.mes}`);
  }
  return meses;
}

/** El mes de esta mensualidad ya tiene factura, en este cargo o en otro. */
export function mesYaFacturado(
  cargo: Pick<CargoAccionable, 'conceptoTipo' | 'mes' | 'anio'>,
  meses: Set<string>,
): boolean {
  return cargo.conceptoTipo === 'mensualidad'
    && cargo.mes != null
    && meses.has(`${cargo.anio}-${cargo.mes}`);
}

/**
 * La fila de un mes de la ficha de la familia, dicha como la lee el menú.
 *
 * La familia recibe sus cargos con otros nombres —`cargoId`, `encf`, `codigo`—
 * porque su fila sirve también para los previstos. Se traduce aquí, en un solo
 * sitio, para que el menú y sus diálogos reciban lo mismo en las dos pantallas.
 *
 * `null` en un previsto: una cuota que todavía no es cargo no tiene nada que
 * cobrar, anular ni mandar, y su acción —adelantarla— es otra.
 */
export function cargoDeFila(f: FilaMes): CargoAccionable | null {
  if (f.tipo !== 'cargo' || f.cargoId == null) return null;
  return {
    id: f.cargoId,
    concepto: f.concepto,
    conceptoTipo: f.conceptoTipo,
    mes: f.mes,
    anio: f.anio,
    montoCentavos: f.montoCentavos,
    saldoCentavos: f.saldoCentavos,
    estado: f.estado,
    ecfDocumentId: f.ecfDocumentId,
    facturaEncf: f.encf,
    facturaCodigo: f.codigo,
    facturaEstado: f.facturaEstado,
  };
}
