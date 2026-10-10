/**
 * Registro de compras y gastos con el comprobante del proveedor (servidor).
 *
 * Una sola entrada para las dos pantallas: Compras (inventario y lo que se
 * compra para vender) y Gastos (servicios, alquileres, suministros). Valida el
 * comprobante con las reglas de `./fiscal`, guarda la compra con sus líneas,
 * mueve el inventario de las líneas de productos y genera el asiento en el acto
 * si la contabilidad está encendida (si no, lo recoge el barrido).
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { comprasLocales, comprasLocalesItems, ecfDocuments, products } from '@/lib/db/schema';
import { getConfig, catalogoImputable, cuentasDeSalida } from '@/lib/contabilidad/config';
import { generarAsientoCompra, generarAsientoCompraAnulada, type ResultadoGeneracion } from '@/lib/contabilidad/asientos';
import { registrarEntradas, revertirEntradas } from '@/lib/inventario/entrada';
import { esFechaYMD } from '@/lib/nomina/periodos';
import { hoyRD } from '@/lib/utils/format';
import {
  analizarIdentificacion, analizarNcf, avisoRetencionSinNcf, erroresCompra, esTasaItbis, esTipoBienes606, esTipoRetencionIsr,
  itbisAlCostoPorDefecto, reglasComprobante, resumirCompra, totalizarLineas, METODOS_PAGO_COMPRA, TIPOS_PROVEEDOR,
  type MetodoPagoCompra, type TasaItbis, type TipoProveedor,
} from './fiscal';
import { categoriaCompra, tipo606Dominante } from './categorias';
import { repartir } from './asiento-compra';

export class CompraError extends Error {
  constructor(message: string, public status = 400, public codigo?: string, public compraId?: number) {
    super(message);
    this.name = 'CompraError';
  }
}

export interface LineaRegistro {
  productoId?: number | null;
  almacenId?: number | null;
  descripcion?: string | null;
  categoria?: string | null;
  cantidad: number;
  costoUnitarioCents: number;
  itbisTasa: TasaItbis;
  /** Cuenta del catálogo elegida para esta línea; null = la de su categoría. */
  cuentaId?: number | null;
}

export interface RegistroCompra {
  clase: 'compra' | 'gasto';
  proveedorRnc: string | null;
  proveedorNombre: string | null;
  tipoProveedor: TipoProveedor;
  /** null o vacío: un gasto sin comprobante fiscal (no va al 606 ni da crédito de ITBIS). */
  ncf: string | null;
  ncfModificado?: string | null;
  fecha: string;
  tipoBienes606?: string | null;
  lineas: LineaRegistro[];
  /** null = la regla por defecto (consumo, gastos menores, empresa exenta). */
  itbisAlCostoCents?: number | null;
  itbisRetenidoCents: number;
  isrTipoRetencion?: number | null;
  isrRetenidoCents: number;
  iscCents: number;
  otrosImpuestosCents: number;
  propinaCents: number;
  formaPago: 'contado' | 'credito';
  metodoPago: MetodoPagoCompra;
  /** De qué cuenta salió el dinero; null = la del método de pago. */
  cuentaSalidaId?: number | null;
  fechaPago?: string | null;
  fechaVencimiento?: string | null;
  almacenId?: number | null;
  notas?: string | null;
  /** Registrar aunque ya exista el NCF del mismo proveedor (entregas parciales). */
  permitirNcfRepetido?: boolean;
}

export interface ResultadoRegistro {
  compraId: number;
  asiento: ResultadoGeneracion;
  avisos: string[];
}

const entero = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/**
 * Si el NCF ya está registrado de ese proveedor, o si es un comprobante que la
 * empresa emitió en Zero. Sin NCF no hay nada que buscar.
 */
export async function verificarNcf(teamId: number, ncf: string | null, rnc: string | null) {
  const info = analizarNcf(ncf);
  if (!info.valido) return { info, repetidoId: null as number | null, emitido: false };
  const limpio = analizarIdentificacion(rnc).limpio;
  const [repetido] = await db.execute<{ id: number }>(sql`
    SELECT id FROM compras_locales
    WHERE team_id = ${teamId} AND referencia_encf = ${info.ncf} AND estado = 'registrada'
      AND coalesce(regexp_replace(proveedor_rnc, '\\D', '', 'g'), '') = ${limpio}
    ORDER BY id LIMIT 1
  `);
  let emitido = false;
  if (info.origen === 'autoemitido') {
    const [doc] = await db.select({ id: ecfDocuments.id }).from(ecfDocuments)
      .where(and(eq(ecfDocuments.teamId, teamId), eq(ecfDocuments.encf, info.ncf))).limit(1);
    emitido = !!doc;
  }
  return { info, repetidoId: repetido ? Number(repetido.id) : null, emitido };
}

export async function registrarCompra(teamId: number, userId: number, r: RegistroCompra): Promise<ResultadoRegistro> {
  const avisos: string[] = [];

  // ── Comprobante ──
  const { info, repetidoId, emitido } = await verificarNcf(teamId, r.ncf, r.proveedorRnc);
  const id = analizarIdentificacion(r.proveedorRnc);
  const nombre = r.proveedorNombre?.trim() || null;
  // Las mismas reglas con que el formulario decide si deja pulsar «Registrar».
  // `clase` viene del cuerpo de la petición: lo que decide si hay mercancía son
  // las líneas, no la etiqueta. Un «gasto» con productos del inventario pide NCF
  // como cualquier compra.
  const reglas = reglasComprobante({
    clase: r.clase === 'gasto' ? 'gasto' : 'compra', ncf: info, tipoProveedor: r.tipoProveedor, id, nombre,
    conInventario: Array.isArray(r.lineas) && r.lineas.some((l) => !!l?.productoId),
  });
  if (reglas.errorNcf) throw new CompraError(reglas.errorNcf, 400, 'ncf-invalido');
  if (emitido) {
    throw new CompraError(`El ${info.ncf} lo emitiste en Zero: ya cuenta en el 606 y en la contabilidad`, 409, 'ncf-emitido');
  }
  if (repetidoId && !r.permitirNcfRepetido) {
    throw new CompraError(`Ya registraste el ${info.ncf} de este proveedor (compra #${repetidoId})`, 409, 'ncf-repetido', repetidoId);
  }
  let ncfModificado: string | null = null;
  if (info.esNota) {
    const mod = analizarNcf(r.ncfModificado);
    if (!mod.valido) throw new CompraError('Una nota de crédito o débito necesita el NCF que modifica', 400, 'ncf-modificado');
    ncfModificado = mod.ncf;
  }
  if (!(TIPOS_PROVEEDOR as readonly string[]).includes(r.tipoProveedor)) throw new CompraError('Tipo de proveedor inválido');

  // ── Proveedor ──
  const gastoMenor = info.tipoBase === '13';
  if (reglas.problemaRnc === 'falta') throw new CompraError('Escribe el RNC (9 dígitos) o la cédula (11) del proveedor', 400, 'rnc-invalido');
  if (reglas.problemaRnc === 'incompleto') {
    throw new CompraError('El RNC o la cédula no está completo (9 u 11 dígitos): corrígelo o déjalo vacío', 400, 'rnc-invalido');
  }
  // Sin NCF el RNC puede venir vacío: entonces no hay dígito que revisar.
  if (r.tipoProveedor !== 'exterior' && !gastoMenor && id.formatoValido) {
    if (!id.digitoOk) avisos.push('El dígito verificador del RNC o la cédula no cuadra: confírmalo con el comprobante');
    if (id.persona === 'fisica' && r.tipoProveedor === 'juridica') avisos.push('Es una cédula: si el proveedor es persona física le tocan otras retenciones');
  }
  if (reglas.faltaNombre) throw new CompraError('Escribe el nombre del proveedor', 400, 'proveedor');

  // ── Fechas y pago ──
  const hoy = hoyRD();
  if (!esFechaYMD(r.fecha)) throw new CompraError('Fecha del comprobante inválida');
  if (r.fecha > hoy) throw new CompraError('La fecha del comprobante no puede ser futura');
  if (r.formaPago !== 'contado' && r.formaPago !== 'credito') throw new CompraError('Forma de pago inválida');
  if (!(METODOS_PAGO_COMPRA as readonly string[]).includes(r.metodoPago)) throw new CompraError('Método de pago inválido');
  const fechaPago = r.formaPago === 'contado' ? (r.fechaPago && esFechaYMD(r.fechaPago) ? r.fechaPago : r.fecha) : null;
  if (fechaPago && fechaPago < r.fecha) throw new CompraError('El pago no puede ser anterior al comprobante');
  const fechaVencimiento = r.formaPago === 'credito' && r.fechaVencimiento && esFechaYMD(r.fechaVencimiento) ? r.fechaVencimiento : null;
  if (fechaVencimiento && fechaVencimiento < r.fecha) throw new CompraError('El vencimiento no puede ser anterior al comprobante');
  // A crédito todavía no sale dinero: la cuenta se elige al pagar.
  const cuentaSalidaId = r.formaPago === 'contado' ? (r.cuentaSalidaId ?? null) : null;
  if (cuentaSalidaId) {
    const { cuentas } = await cuentasDeSalida(teamId);
    if (!cuentas.some((c) => c.id === cuentaSalidaId)) {
      throw new CompraError('De esa cuenta no puede salir dinero: elige una de caja o banco', 400, 'cuentaSalida');
    }
  }

  // ── Líneas ──
  if (!Array.isArray(r.lineas) || r.lineas.length === 0) throw new CompraError('Agrega al menos una línea');
  const idsProductos = [...new Set(r.lineas.map((l) => l.productoId).filter((x): x is number => !!x))];
  const prods = idsProductos.length
    ? await db.select({ id: products.id, tipo: products.tipo, nombre: products.nombre }).from(products)
        .where(and(eq(products.teamId, teamId), inArray(products.id, idsProductos)))
    : [];
  const prodMap = new Map(prods.map((p) => [p.id, p]));
  // Solo se consulta el catálogo si alguien eligió cuenta a mano.
  const eligenCuenta = r.lineas.some((l) => l.cuentaId);
  const catalogo = eligenCuenta ? await catalogoImputable(teamId) : null;
  const lineas = r.lineas.map((l, i) => {
    const n = i + 1;
    if (!Number.isSafeInteger(l.cantidad) || l.cantidad <= 0) throw new CompraError(`Línea ${n}: la cantidad debe ser un entero mayor que cero`);
    if (!entero(l.costoUnitarioCents)) throw new CompraError(`Línea ${n}: el costo no es válido`);
    if (!esTasaItbis(l.itbisTasa)) throw new CompraError(`Línea ${n}: tasa de ITBIS inválida`);
    if (l.productoId) {
      const p = prodMap.get(l.productoId);
      if (!p || p.tipo !== 'bien') throw new CompraError(`Línea ${n}: el producto no existe o no es un bien de inventario`);
      // La mercancía va al inventario: su cuenta no se elige por línea.
      return { ...l, productoId: p.id, descripcion: null, categoria: null, esServicio: false, cuentaId: null, tipo606: '09' as const };
    }
    const cat = categoriaCompra(l.categoria);
    const descripcion = l.descripcion?.trim();
    if (!descripcion) throw new CompraError(`Línea ${n}: escribe qué se compró`);
    if (!cat) throw new CompraError(`Línea ${n}: elige la categoría`);
    const cuentaId = l.cuentaId ?? null;
    if (cuentaId && !catalogo?.imputables.has(cuentaId)) {
      throw new CompraError(`Línea ${n}: esa cuenta no existe en el catálogo, no acepta movimientos o está desactivada`);
    }
    return { ...l, productoId: null, almacenId: null, descripcion: descripcion.slice(0, 255), categoria: cat.clave, esServicio: cat.esServicio, cuentaId, tipo606: cat.tipo606 };
  });

  // ── Montos ──
  const t = totalizarLineas(lineas);
  const cfg = await getConfig(teamId);
  const itbisAlCosto = r.itbisAlCostoCents == null
    ? itbisAlCostoPorDefecto({ ncf: info, regimenItbis: cfg.regimenItbis, itbisCents: t.itbisCents })
    : r.itbisAlCostoCents;
  const imp = {
    itbisFacturadoCents: t.itbisCents,
    itbisAlCostoCents: itbisAlCosto,
    itbisRetenidoCents: r.itbisRetenidoCents,
    isrRetenidoCents: r.isrRetenidoCents,
    iscCents: r.iscCents,
    otrosImpuestosCents: r.otrosImpuestosCents,
    propinaCents: r.propinaCents,
  };
  // También sin NCF, y aquí más que en ningún sitio: los reportes cuentan como
  // crédito todo el ITBIS que no se llevó al costo, sin mirar si hay comprobante.
  if (reglas.itbisSinCredito && itbisAlCosto < t.itbisCents) {
    throw new CompraError(reglas.gastoSinNcf
      ? 'Sin NCF el ITBIS no da crédito: va completo al costo'
      : `El ITBIS de un comprobante de ${info.nombre.toLowerCase()} no se puede adelantar: va completo al costo`);
  }
  const errores = erroresCompra({ baseCents: t.baseCents, imp, formaPago: r.formaPago, fechaPago });
  if (errores.length) throw new CompraError(errores[0]);
  const isrTipo = r.isrRetenidoCents > 0 ? r.isrTipoRetencion : null;
  if (r.isrRetenidoCents > 0 && !esTipoRetencionIsr(isrTipo)) throw new CompraError('Elige el tipo de retención de ISR');
  const resumen = resumirCompra(t.baseCents, imp);
  if (!Number.isSafeInteger(resumen.totalCents)) throw new CompraError('Monto fuera de rango');
  if (reglas.gastoSinNcf) {
    avisos.push('Sin NCF: este gasto se guardó, pero no va al 606 ni da crédito de ITBIS');
    // Lo retenido solo sale en los campos 12, 17 y 18 del 606 (y en el 609 si es
    // un e47). Sin NCF queda como deuda con la DGII en el asiento y nada más:
    // hay que decirlo, con las mismas palabras que el formulario.
    if (r.itbisRetenidoCents + r.isrRetenidoCents > 0) avisos.push(avisoRetencionSinNcf(r.tipoProveedor));
  } else if (!info.reporta606) {
    avisos.push(`Un comprobante de ${info.nombre.toLowerCase()} no sustenta gasto deducible ni va al 606`);
  }

  const tipoBienes606 = esTipoBienes606(r.tipoBienes606)
    ? r.tipoBienes606
    : tipo606Dominante(lineas.map((l, i) => ({ tipo606: l.tipo606, baseCents: t.lineas[i].baseCents })));

  // ── Guardar ──
  const compraId = await db.transaction(async (tx) => {
    const [c] = await tx.insert(comprasLocales).values({
      teamId,
      clase: r.clase === 'gasto' ? 'gasto' : 'compra',
      proveedorRnc: id.limpio || null,
      proveedorNombre: nombre,
      tipoProveedor: r.tipoProveedor,
      fecha: r.fecha,
      // NULL y no cadena vacía: el 606 filtra con IS NOT NULL y las pantallas dicen «Sin NCF».
      referenciaEncf: reglas.gastoSinNcf ? null : info.ncf,
      ncfModificado,
      // También sin NCF: sin tipo, el asiento lo tomaría por una compra de antes
      // de la 0180 y adelantaría el ITBIS (lib/contabilidad/asientos.ts).
      tipoBienes606,
      notas: r.notas?.trim() || null,
      itbisCents: t.itbisCents,
      montoTotal: resumen.totalCents,
      montoServiciosCents: t.baseServiciosCents,
      montoBienesCents: t.baseBienesCents,
      itbisAlCostoCents: itbisAlCosto,
      itbisRetenidoCents: r.itbisRetenidoCents,
      isrTipoRetencion: isrTipo ?? null,
      isrRetenidoCents: r.isrRetenidoCents,
      iscCents: r.iscCents,
      otrosImpuestosCents: r.otrosImpuestosCents,
      propinaCents: r.propinaCents,
      formaPago: r.formaPago,
      metodoPago: r.metodoPago,
      cuentaSalidaId,
      fechaPago,
      fechaVencimiento,
      estadoPago: r.formaPago === 'contado' ? 'PAGADA' : 'PENDIENTE',
      createdBy: userId,
    }).returning({ id: comprasLocales.id });

    await tx.insert(comprasLocalesItems).values(lineas.map((l, i) => ({
      compraId: c.id,
      productoId: l.productoId,
      almacenId: l.productoId ? (l.almacenId ?? r.almacenId ?? null) : null,
      cantidad: l.cantidad,
      costoUnitario: l.costoUnitarioCents,
      descripcion: l.descripcion,
      categoria: l.categoria,
      esServicio: l.esServicio,
      itbisTasa: l.itbisTasa,
      itbisCents: t.lineas[i].itbisCents,
      cuentaId: l.cuentaId,
    })));
    return c.id;
  });

  // ── Inventario: lo que no se recupera (ITBIS al costo, ISC, otros, propina) sube el costo ──
  const conProducto = lineas.map((l, i) => ({ l, base: t.lineas[i].baseCents })).filter((x) => x.l.productoId);
  if (conProducto.length) {
    const extra = repartir(itbisAlCosto + r.iscCents + r.otrosImpuestosCents + r.propinaCents, lineas.map((_, i) => t.lineas[i].baseCents));
    // Sin NCF el motivo no deja el guion colgando.
    const motivo = [`Compra #${compraId}`, info.ncf].filter(Boolean).join(' — ');
    await registrarEntradas(teamId, userId, compraId, motivo, lineas.flatMap((l, i) => l.productoId ? [{
      productoId: l.productoId,
      cantidad: l.cantidad,
      almacenId: l.almacenId ?? r.almacenId ?? null,
      costoUnitarioCents: Math.round((t.lineas[i].baseCents + extra[i]) / l.cantidad),
    }] : []));
  }

  const asiento = await generarAsientoCompra(teamId, compraId, userId);
  return { compraId, asiento, avisos };
}

export async function anularCompra(teamId: number, userId: number, compraId: number, motivo: string) {
  const texto = motivo?.trim();
  if (!texto || texto.length < 3) throw new CompraError('Escribe por qué se anula');

  const items = await db.transaction(async (tx) => {
    const [c] = await tx.execute<{ id: number; estado: string }>(sql`
      SELECT id, estado FROM compras_locales WHERE team_id = ${teamId} AND id = ${compraId} FOR UPDATE
    `);
    if (!c) throw new CompraError('Compra no encontrada', 404);
    if (c.estado === 'anulada') throw new CompraError('La compra ya está anulada', 409, 'ya-anulada');
    const [{ pagos }] = await tx.execute<{ pagos: number }>(sql`
      SELECT count(*)::int AS pagos FROM pagos_proveedores WHERE team_id = ${teamId} AND compra_id = ${compraId}
    `);
    if (Number(pagos) > 0) {
      throw new CompraError('Tiene pagos registrados en Cuentas por pagar: no se puede anular una deuda ya pagada', 409, 'con-pagos');
    }
    await tx.update(comprasLocales).set({
      estado: 'anulada', anuladaEn: new Date(), anuladaPor: userId, motivoAnulacion: texto.slice(0, 300),
    }).where(and(eq(comprasLocales.id, compraId), eq(comprasLocales.teamId, teamId)));
    return tx.select({ productoId: comprasLocalesItems.productoId, cantidad: comprasLocalesItems.cantidad, almacenId: comprasLocalesItems.almacenId })
      .from(comprasLocalesItems).where(eq(comprasLocalesItems.compraId, compraId));
  });

  const deInventario = items.filter((i): i is { productoId: number; cantidad: number; almacenId: number | null } => !!i.productoId);
  if (deInventario.length) await revertirEntradas(teamId, userId, `Anulación de compra #${compraId}`, deInventario);
  const asiento = await generarAsientoCompraAnulada(teamId, compraId, userId);
  return { asiento };
}
