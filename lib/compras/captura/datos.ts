/**
 * Lo que se sabe de una factura fotografiada y cómo llega al registro de
 * compras y gastos. Pura, sin BD: la usan el procesador, la bandeja y las pruebas.
 *
 * Hay dos fuentes y no valen lo mismo:
 *  · el QR del e-CF (`timbre.ts`): RNC del emisor, e-NCF, fecha y total exactos,
 *    pero sin ITBIS ni líneas;
 *  · la lectura con IA de la foto: todo lo impreso, con la duda de cualquier
 *    lectura.
 * Cuando están las dos, el QR manda en lo que trae y la IA completa el resto;
 * si discrepan en el total se avisa en vez de elegir en silencio.
 */

import { z } from 'zod';
import {
  analizarIdentificacion, analizarNcf, METODOS_PAGO_COMPRA, TIPOS_PROVEEDOR,
  type MetodoPagoCompra, type TasaItbis, type TipoProveedor,
} from '../fiscal';
import { CATEGORIAS_COMPRA, categoriaCompra } from '../categorias';
import type { LineaEcfRecibido } from '../ecf-xml';

/** Una línea leída, con la categoría del catálogo si la IA supo clasificarla. */
export interface LineaCaptura extends LineaEcfRecibido {
  categoria: string | null;
  /** El producto del inventario al que corresponde, si se reconoció (compras). */
  productoId?: number | null;
}
import type { TimbreEcf } from './timbre';

export interface DatosCaptura {
  /** compra = mercancía para vender o guardar en inventario; gasto = lo demás. */
  clase: 'gasto' | 'compra' | null;
  proveedorRnc: string | null;
  proveedorNombre: string | null;
  /** juridica | fisica | informal | rst | exterior: decide las retenciones. */
  tipoProveedor: TipoProveedor | null;
  ncf: string | null;
  /** YYYY-MM-DD */
  fecha: string | null;
  formaPago: 'contado' | 'credito' | null;
  /** Con qué se pagó, si la factura lo dice. */
  metodoPago: MetodoPagoCompra | null;
  /** La categoría del catálogo que manda en el comprobante (la del mayor monto). */
  categoria: string | null;
  subtotalCents: number | null;
  itbisCents: number | null;
  propinaCents: number | null;
  iscCents: number | null;
  otrosImpuestosCents: number | null;
  /** Retenciones ya impresas en la factura (las hay que las detallan). */
  itbisRetenidoCents: number | null;
  isrRetenidoCents: number | null;
  totalCents: number | null;
  lineas: LineaCaptura[];
  timbre: TimbreEcf | null;
  /** El mismo e-CF ya llegó por ecf-api: el registro sale de su XML. */
  ecfRecibidoId: string | null;
  /** Lo que el revisor tiene que mirar antes de registrar. */
  avisos: string[];
}

export const DATOS_VACIOS: DatosCaptura = {
  clase: null, proveedorRnc: null, proveedorNombre: null, tipoProveedor: null, ncf: null, fecha: null,
  formaPago: null, metodoPago: null, categoria: null,
  subtotalCents: null, itbisCents: null, propinaCents: null, iscCents: null, otrosImpuestosCents: null,
  itbisRetenidoCents: null, isrRetenidoCents: null, totalCents: null,
  lineas: [], timbre: null, ecfRecibidoId: null, avisos: [],
};

// ── Lectura con IA ──────────────────────────────────────────────────────────

/** Las claves del catálogo, para que el modelo clasifique con las nuestras. */
export const CLAVES_CATEGORIA = CATEGORIAS_COMPRA.map((c) => c.clave) as [string, ...string[]];

/** Lo que se le pide al modelo. Montos en pesos, tal como están impresos. */
export const esquemaLecturaIa = z.object({
  esFactura: z.boolean().describe('true si la imagen es una factura, recibo o comprobante de compra'),
  clase: z.enum(['gasto', 'compra']).nullable()
    .describe('compra si es mercancía o materia prima que la empresa revende o guarda en inventario; gasto si se consume en la operación (servicios, combustible, comida, papelería, reparaciones...)'),
  legible: z.boolean().describe('true si los datos principales se leen con claridad'),
  completa: z.boolean().describe('true si la foto muestra la factura entera, incluido el total; false si está cortada'),
  proveedorNombre: z.string().nullable().describe('Razón social o nombre comercial de quien vende'),
  // Los recibos de caja imprimen junto al RNC, la fecha y el NCF otros números que
  // los modelos toman por ellos. Se piden aparte, y ANTES, para que cada cosa
  // tenga dónde ir: el modelo llena los campos en este orden.
  nif: z.string().nullable()
    .describe('El NIF o número de caja si la factura lo trae (p. ej. «NIF:1508520000060915»). Se pide aparte para no confundirlo con el RNC ni con el NCF'),
  proveedorRnc: z.string().nullable()
    .describe('RNC (9 dígitos) o cédula (11 dígitos) de quien vende, solo dígitos: el número que sigue a «RNC», aunque la foto corte la palabra. Nunca el NIF'),
  tipoProveedor: z.enum(TIPOS_PROVEEDOR).nullable()
    .describe('juridica = empresa con RNC; fisica = persona con cédula; rst = dice Régimen Simplificado; exterior = proveedor de otro país; informal = sin comprobante fiscal'),
  resolucionDgii: z.string().nullable()
    .describe('El número de la resolución o autorización de la DGII, si se imprime (p. ej. «Res DGII: 02-2009»). Se pide aparte: NO es el NCF'),
  fechaResolucionDgii: z.string().nullable()
    .describe('La fecha de esa resolución o autorización (p. ej. «Del: 02/02/2009»), en formato YYYY-MM-DD. Se pide aparte: NO es la fecha de la venta'),
  ncf: z.string().nullable().describe('El NCF o e-NCF, lo que sigue a «NCF:», p. ej. B0100000123 o E310000000045'),
  fecha: z.string().nullable()
    .describe('Fecha de la venta, la que va junto a la hora (p. ej. «09/08/22 10:09:38» es 2022-08-09), en formato YYYY-MM-DD. Nunca la de la resolución DGII'),
  formaPago: z.enum(['contado', 'credito']).nullable().describe('credito si dice crédito o trae fecha de vencimiento'),
  metodoPago: z.enum(METODOS_PAGO_COMPRA).nullable().describe('Con qué se pagó, si la factura lo dice: efectivo, transferencia, cheque, tarjeta o deposito'),
  categoria: z.enum(CLAVES_CATEGORIA).nullable().describe('La categoría del gasto que mejor describe la factura completa'),
  moneda: z.string().nullable().describe('DOP o USD'),
  subtotal: z.number().nullable().describe('Monto antes de impuestos, en pesos'),
  itbis: z.number().nullable().describe('ITBIS facturado, en pesos'),
  isc: z.number().nullable().describe('Impuesto selectivo al consumo, en pesos'),
  otrosImpuestos: z.number().nullable().describe('Otros impuestos o cargos fiscales, en pesos'),
  propina: z.number().nullable().describe('Propina legal (10 %), en pesos'),
  itbisRetenido: z.number().nullable().describe('ITBIS retenido si la factura lo detalla, en pesos'),
  isrRetenido: z.number().nullable().describe('ISR retenido si la factura lo detalla, en pesos'),
  // Se pide copiar el renglón antes que el número: con la foto cortada los modelos
  // pequeños suman las líneas y lo dan por total. Sin renglón, no hay total.
  totalImpreso: z.string().nullable()
    .describe('El renglón del total copiado tal como se lee en la foto (p. ej. «TOTAL A PAGAR 12,570.00»); null si la foto no lo muestra'),
  total: z.number().nullable().describe('Total a pagar, en pesos: el de ese renglón'),
  lineas: z.array(z.object({
    descripcion: z.string(),
    cantidad: z.number(),
    precioUnitario: z.number().describe('Precio unitario sin ITBIS, en pesos'),
    itbisPorcentaje: z.number().nullable().describe('18, 16, 0, o null si es exento'),
    esServicio: z.boolean(),
    categoria: z.enum(CLAVES_CATEGORIA).nullable().describe('La categoría del gasto de esta línea'),
  })).describe('Las líneas de la factura; vacío si no se distinguen'),
});
export type LecturaIa = z.infer<typeof esquemaLecturaIa>;

const aCents = (pesos: number | null | undefined): number | null =>
  pesos == null || !Number.isFinite(pesos) || pesos < 0 ? null : Math.round(pesos * 100);

function tasaDe(porcentaje: number | null): TasaItbis {
  if (porcentaje == null) return 'exento';
  if (Math.abs(porcentaje - 18) < 0.5) return '0.18';
  if (Math.abs(porcentaje - 16) < 0.5) return '0.16';
  return porcentaje === 0 ? '0' : 'exento';
}

function fechaIso(v: string | null): string | null {
  const t = (v ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  let iso = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  if (!iso) {
    m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
    if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/**
 * Lo que el modelo dio por NCF, limpio. Las impresoras fiscales viejas imprimen el
 * NCF de 11 caracteres en el campo de 19 del formato anterior a 2018, relleno de
 * ceros: B023095708000000000 es el B0230957080. Y lo que no empieza por B o E no
 * es un NCF mal leído sino otro número (casi siempre el de la resolución DGII).
 */
export function ncfDesdeLectura(texto: string | null): { ncf: string | null; relleno: boolean } {
  const t = (texto ?? '').toUpperCase().replace(/[\s-]/g, '');
  if (!/^[BE]\d/.test(t)) return { ncf: null, relleno: false };
  // Son ocho ceros, pero el modelo a veces se come alguno al copiarlos.
  const viejo = /^(B\d{10})0+$/.exec(t);
  return viejo ? { ncf: viejo[1], relleno: true } : { ncf: t, relleno: false };
}

/** Normaliza lo que devolvió el modelo: nada sin validar llega al formulario. */
export function datosDesdeIa(l: LecturaIa, hoy: string = new Date().toISOString().slice(0, 10)): DatosCaptura {
  const avisos: string[] = [];
  const total = l.totalImpreso?.trim() ? l.total : null;
  if (!l.esFactura) avisos.push('La foto no parece una factura.');
  if (!l.legible) avisos.push('La foto no se lee bien: compara cada dato con la imagen.');
  if (!l.completa || (l.esFactura && total == null)) {
    avisos.push('La foto no muestra la factura entera (falta el total o una parte): compara con el papel.');
  }
  if (l.moneda && l.moneda.toUpperCase() !== 'DOP') avisos.push(`La factura parece estar en ${l.moneda.toUpperCase()}: conviértela a pesos.`);

  const id = analizarIdentificacion(l.proveedorRnc);
  const leido = ncfDesdeLectura(l.ncf);
  const ncf = analizarNcf(leido.ncf);
  if (leido.ncf && !ncf.valido) avisos.push(`El NCF leído (${leido.ncf}) no es válido: revísalo en la foto.`);
  if (ncf.valido && !ncf.reporta606) {
    avisos.push(`Es una factura de ${ncf.nombre!.toLowerCase()} (${ncf.serie}${ncf.tipo}): no da crédito de ITBIS ni va al 606.`);
  }

  const categoria = categoriaCompra(l.categoria)?.clave ?? null;
  const lineas: LineaCaptura[] = l.lineas
    .filter((x) => x.descripcion.trim() && x.cantidad > 0 && x.precioUnitario >= 0)
    .map((x) => ({
      descripcion: x.descripcion.trim().slice(0, 200),
      // El registro cuenta unidades enteras: una cantidad fraccionada entra
      // como una unidad por el monto de la línea, igual que en el e-CF recibido.
      cantidad: Number.isInteger(x.cantidad) ? x.cantidad : 1,
      costoUnitarioCents: Number.isInteger(x.cantidad)
        ? Math.round(x.precioUnitario * 100)
        : Math.round(x.precioUnitario * x.cantidad * 100),
      itbisTasa: tasaDe(x.itbisPorcentaje),
      esServicio: x.esServicio,
      categoria: categoriaCompra(x.categoria)?.clave ?? categoria,
    }));

  // Las cuentas tienen que cuadrar: los modelos pequeños a veces toman el precio
  // con ITBIS incluido (recibos de supermercado) o se inventan el total cuando la
  // foto está cortada. Se comprueba contra el total leído, no se adivina.
  const cuadre = cuadrarLineas(lineas, aCents(total));
  if (cuadre.incluianItbis) avisos.push('Los precios de la factura ya incluían el ITBIS: se separó en cada línea.');
  if (cuadre.noCuadra) avisos.push('Las líneas no suman el total leído: revísalas con la foto antes de registrar.');

  // Aunque se le pida aparte, a veces el modelo repite la fecha de la resolución
  // DGII como fecha de la venta: entonces lo leído no vale y se escribe a mano.
  let fecha = fechaIso(l.fecha);
  if (fecha && fecha === fechaIso(l.fechaResolucionDgii)) {
    fecha = null;
    avisos.push('La fecha que se leyó es la de la autorización de la DGII, no la de la venta: escríbela mirando la foto.');
  }
  if (fecha && (fecha > hoy || diasEntre(fecha, hoy) > 366)) {
    avisos.push(`La fecha leída (${fecha.split('-').reverse().join('/')}) está lejos de hoy: confírmala en la foto.`);
  }
  if (l.esFactura && !ncf.valido) avisos.push('No se leyó un NCF válido: sin él la factura no va al 606 ni da crédito de ITBIS.');
  if (leido.relleno && ncf.valido) avisos.push(`El NCF venía con los ceros de relleno del formato viejo: se tomó ${ncf.ncf}.`);

  // El tipo de proveedor lo decide la identificación: 9 dígitos es empresa y 11
  // una persona física. Solo se hace caso al modelo en lo que no se deduce del
  // número (RST y exterior), porque de ahí salen las retenciones.
  const tipoPorId: TipoProveedor | null = id.persona === 'fisica' ? 'fisica' : id.persona === 'juridica' ? 'juridica' : null;
  const tipoProveedor = l.tipoProveedor === 'rst' || l.tipoProveedor === 'exterior' || l.tipoProveedor === 'informal'
    ? l.tipoProveedor
    : tipoPorId ?? l.tipoProveedor;
  if (l.esFactura && !id.formatoValido && tipoProveedor !== 'exterior' && tipoProveedor !== 'informal') {
    avisos.push('No se leyó el RNC del proveedor: escríbelo mirando la foto.');
  }

  return {
    clase: l.clase,
    proveedorRnc: id.formatoValido ? id.limpio : null,
    proveedorNombre: l.proveedorNombre?.trim().slice(0, 200) || null,
    tipoProveedor,
    ncf: ncf.valido ? ncf.ncf : null,
    fecha,
    formaPago: l.formaPago,
    metodoPago: l.metodoPago,
    categoria,
    subtotalCents: aCents(l.subtotal),
    itbisCents: aCents(l.itbis),
    propinaCents: aCents(l.propina),
    iscCents: aCents(l.isc),
    otrosImpuestosCents: aCents(l.otrosImpuestos),
    itbisRetenidoCents: aCents(l.itbisRetenido),
    isrRetenidoCents: aCents(l.isrRetenido),
    totalCents: aCents(total),
    lineas: cuadre.lineas,
    timbre: null,
    ecfRecibidoId: null,
    avisos,
  };
}

const diasEntre = (a: string, b: string) => Math.abs(Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000;

const TASA_NUM: Record<TasaItbis, number> = { '0.18': 0.18, '0.16': 0.16, '0': 0, exento: 0 };

/**
 * Compara lo que suman las líneas con el total leído. Si las líneas sumadas
 * TAL CUAL ya dan el total (±1 %), es que el precio impreso incluía el ITBIS y
 * se le quita a cada una. Si ni así ni sumándoles el ITBIS se llega al total,
 * se avisa. Sin total leído no se toca nada.
 */
export function cuadrarLineas(lineas: LineaCaptura[], totalCents: number | null): {
  lineas: LineaCaptura[]; incluianItbis: boolean; noCuadra: boolean;
} {
  if (!lineas.length || !totalCents) return { lineas, incluianItbis: false, noCuadra: false };
  const tal = lineas.reduce((s, x) => s + x.cantidad * x.costoUnitarioCents, 0);
  const conItbis = lineas.reduce((s, x) => s + Math.round(x.cantidad * x.costoUnitarioCents * (1 + TASA_NUM[x.itbisTasa])), 0);
  const cerca = (a: number) => Math.abs(a - totalCents) <= Math.max(100, totalCents * 0.01);
  if (cerca(conItbis)) return { lineas, incluianItbis: false, noCuadra: false };
  const hayItbis = lineas.some((x) => TASA_NUM[x.itbisTasa] > 0);
  if (hayItbis && cerca(tal)) {
    return {
      lineas: lineas.map((x) => ({ ...x, costoUnitarioCents: Math.round(x.costoUnitarioCents / (1 + TASA_NUM[x.itbisTasa])) })),
      incluianItbis: true,
      noCuadra: false,
    };
  }
  return { lineas, incluianItbis: false, noCuadra: true };
}

// ── QR del e-CF ─────────────────────────────────────────────────────────────

export function datosDesdeTimbre(t: TimbreEcf, rncEmpresa: string | null): DatosCaptura {
  const avisos: string[] = [];
  if (t.ambiente !== 'produccion') avisos.push(`El QR es del ambiente de ${t.ambiente} de la DGII, no de producción.`);
  if (t.consumo) avisos.push('Es una factura de consumo (E32): no da crédito de ITBIS ni va al 606.');
  const empresa = (rncEmpresa ?? '').replace(/\D/g, '');
  if (t.rncComprador && empresa && t.rncComprador !== empresa) {
    avisos.push(`La factura no está a nombre de la empresa: el comprador es ${t.rncComprador}.`);
  }
  return {
    ...DATOS_VACIOS,
    proveedorRnc: t.rncEmisor,
    ncf: t.encf,
    fecha: t.fechaEmision,
    totalCents: t.montoTotalCents,
    timbre: t,
    avisos,
  };
}

/** El QR manda en lo que trae; la IA completa lo que falta. */
export function combinarDatos(qr: DatosCaptura | null, ia: DatosCaptura | null): DatosCaptura {
  if (!qr) return ia ?? { ...DATOS_VACIOS };
  if (!ia) return qr;
  const avisos = [...qr.avisos, ...ia.avisos];
  if (qr.totalCents != null && ia.totalCents != null && Math.abs(qr.totalCents - ia.totalCents) > 100) {
    avisos.push('El total leído de la foto no coincide con el del QR: vale el del QR.');
  }
  if (qr.ncf && ia.ncf && qr.ncf !== ia.ncf) {
    avisos.push(`La foto dice ${ia.ncf} y el QR ${qr.ncf}: vale el del QR.`);
  }
  return {
    ...ia,
    proveedorRnc: qr.proveedorRnc ?? ia.proveedorRnc,
    proveedorNombre: ia.proveedorNombre ?? qr.proveedorNombre,
    ncf: qr.ncf ?? ia.ncf,
    fecha: qr.fecha ?? ia.fecha,
    totalCents: qr.totalCents ?? ia.totalCents,
    timbre: qr.timbre,
    ecfRecibidoId: null,
    avisos,
  };
}

// ── Hacia el formulario de registro ─────────────────────────────────────────

export interface InicialRegistro {
  proveedorRnc: string | null;
  proveedorNombre: string | null;
  tipoProveedor: TipoProveedor | null;
  ncf: string | null;
  fecha: string | null;
  formaPago: 'contado' | 'credito';
  metodoPago: MetodoPagoCompra | null;
  fechaVencimiento: string | null;
  montoTotalCents: number | null;
  iscCents: number | null;
  otrosImpuestosCents: number | null;
  propinaCents: number | null;
  itbisRetenidoCents: number | null;
  isrRetenidoCents: number | null;
  lineas: LineaCaptura[];
}

/**
 * Convierte lo leído en el borrador del registro.
 *
 * Sin líneas se arma una sola con el total. Si se conoce el ITBIS, la línea
 * lleva la base y la tasa que le corresponde; si no (el QR solo trae el total),
 * entra como exenta por el total y se avisa: suponer 18 % pediría un crédito de
 * ITBIS que quizá la factura no tiene, y eso es peor que dejarlo sin reclamar
 * hasta que alguien mire la foto.
 */
export function inicialDesdeCaptura(d: DatosCaptura): { inicial: InicialRegistro; avisos: string[] } {
  const avisos = [...d.avisos];
  let lineas = d.lineas;
  if (!lineas.length && d.totalCents != null && d.totalCents > 0) {
    const propina = d.propinaCents ?? 0;
    const itbis = d.itbisCents;
    const descripcion = d.ncf ? `Factura ${d.ncf}` : 'Factura del proveedor';
    if (itbis != null && itbis > 0) {
      const base = d.subtotalCents ?? d.totalCents - itbis - propina;
      const ratio = base > 0 ? itbis / base : 0;
      const tasa: TasaItbis = Math.abs(ratio - 0.18) < 0.01 ? '0.18' : Math.abs(ratio - 0.16) < 0.01 ? '0.16' : '0.18';
      if (tasa === '0.18' && Math.abs(ratio - 0.18) >= 0.01) {
        avisos.push('El ITBIS no es 18 % del subtotal: puede haber líneas exentas. Sepáralas mirando la foto.');
      }
      lineas = [{ descripcion, cantidad: 1, costoUnitarioCents: Math.max(0, base), itbisTasa: tasa, esServicio: false, categoria: d.categoria }];
    } else {
      lineas = [{ descripcion, cantidad: 1, costoUnitarioCents: d.totalCents - propina, itbisTasa: 'exento', esServicio: false, categoria: d.categoria }];
      avisos.push('No se leyó el ITBIS: la línea quedó exenta por el total. Si la factura trae ITBIS, sepáralo mirando la foto.');
    }
  }
  return {
    inicial: {
      proveedorRnc: d.proveedorRnc,
      proveedorNombre: d.proveedorNombre,
      tipoProveedor: d.tipoProveedor,
      ncf: d.ncf,
      fecha: d.fecha,
      formaPago: d.formaPago ?? 'contado',
      metodoPago: d.metodoPago,
      fechaVencimiento: null,
      montoTotalCents: d.totalCents,
      iscCents: d.iscCents,
      otrosImpuestosCents: d.otrosImpuestosCents,
      propinaCents: d.propinaCents,
      itbisRetenidoCents: d.itbisRetenidoCents,
      isrRetenidoCents: d.isrRetenidoCents,
      lineas,
    },
    avisos,
  };
}

// ── Líneas de una compra ↔ productos del inventario ─────────────────────────

/** Minúsculas, sin acentos ni signos: «Tóner HP-85A» y «toner hp 85a» son lo mismo. */
export const normalizarNombre = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Enlaza cada línea leída con un producto del inventario cuando no hay duda:
 * mismo nombre (sin acentos ni mayúsculas) o su referencia/código de barras
 * dentro de la descripción. Si dos productos encajan igual, no se elige ninguno:
 * un producto equivocado mueve el inventario de otro, y eso es peor que dejar
 * la línea para que alguien la asigne.
 */
export function emparejarProductos(
  lineas: LineaCaptura[],
  productos: { id: number; nombre: string; referencia: string | null; codigoBarras: string | null }[],
): LineaCaptura[] {
  const porNombre = new Map<string, number[]>();
  for (const p of productos) {
    const k = normalizarNombre(p.nombre);
    if (k) porNombre.set(k, [...(porNombre.get(k) ?? []), p.id]);
  }
  return lineas.map((l) => {
    const desc = normalizarNombre(l.descripcion);
    const exactos = porNombre.get(desc) ?? [];
    if (exactos.length === 1) return { ...l, productoId: exactos[0] };
    const porCodigo = productos.filter((p) => [p.referencia, p.codigoBarras].some((c) => {
      const n = normalizarNombre(c ?? '');
      return n.length >= 3 && ` ${desc} `.includes(` ${n} `);
    }));
    return porCodigo.length === 1 ? { ...l, productoId: porCodigo[0].id } : l;
  });
}
