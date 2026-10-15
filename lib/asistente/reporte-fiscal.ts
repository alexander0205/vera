/**
 * Reporte fiscal del mes en Excel: el paquete que un contador revisa antes de
 * declarar (606 compras, 607 ventas, cobros y saldos).
 *
 *   Ingresos cobrados        un renglón por cobro con fecha del mes
 *   Facturas parciales       ventas del mes cobradas en parte
 *   Facturas sin pago        ventas del mes sin ningún cobro (con aviso de repetidas)
 *   Resumen                  fórmulas sobre las otras hojas: cobrado por método,
 *                            facturado vs cobrado, gastos por tipo e ITBIS
 *   Ventas emitidas (607)    todas las ventas del mes no anuladas
 *   Gastos (606)             compras del mes con la misma lógica del 606 del sistema
 *   Notas                    cómo se armó, qué quedó fuera y qué revisar
 *
 * Aquí solo se arma el libro a partir de datos ya leídos (pura, sin base de
 * datos): la lectura está en la ruta. Los totales y el Resumen son FÓRMULAS con
 * su resultado precalculado, así el contador puede cambiar una celda y todo se
 * recalcula; las cadenas nunca se escriben como fórmula.
 */

import ExcelJS from 'exceljs';
import { FORMAS_PAGO_606, TIPOS_BIENES_606, TIPOS_RETENCION_ISR } from '@/lib/compras/fiscal';
import type { Compra606Detallada } from '@/lib/compras/cargar606';
import { nombrePeriodo } from './reporte-fiscal-pedido';

// ── Datos de entrada ────────────────────────────────────────────────────────

export interface VentaFiscal {
  /** AAAA-MM-DD en hora dominicana. */
  fecha: string;
  /** Código interno de la factura (FA-…) o su e-NCF. */
  codigo: string;
  cliente: string | null;
  rnc: string | null;
  ncf: string | null;
  /** '31', '32', '34'… o 'sin-ncf'. */
  tipo: string;
  totalCents: number;
  itbisCents: number;
  /** Todo lo cobrado hasta el corte (incluye cobros de otros meses). */
  cobradoCents: number;
  /** Emitida sola por una factura recurrente. */
  automatica: boolean;
  /** Identifica de qué recurrente/cliente viene, para detectar repetidas. */
  claveRepetida: string | null;
}

export interface CobroFiscal {
  fecha: string;
  codigo: string;
  cliente: string | null;
  metodo: string;
  montoCents: number;
  referencia: string | null;
}

export interface DatosFiscales {
  empresa: string;
  rnc: string | null;
  anio: number;
  mes: number;
  /** «15-10-2026», ya formateado. */
  generadoEn: string;
  ventas: VentaFiscal[];
  cobros: CobroFiscal[];
  compras: Compra606Detallada[];
  anuladas: { cantidad: number; totalCents: number };
}

// ── Estilo (el mismo del archivo de referencia del cliente) ─────────────────

const FUENTE = 'Arial';
const NAVY = 'FF1F3864';
const GRIS_BORDE = 'FFBFBFBF';
const TOTAL_FONDO = 'FFE8EDF5';
const AVISO_FONDO = 'FFFFF4CE';
const PESOS = '"RD$"#,##0.00';
const FECHA = 'dd/mm/yyyy';

const borde: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: GRIS_BORDE } },
  bottom: { style: 'thin', color: { argb: GRIS_BORDE } },
  left: { style: 'thin', color: { argb: GRIS_BORDE } },
  right: { style: 'thin', color: { argb: GRIS_BORDE } },
};


const pesos = (c: number) => Math.round(c) / 100;
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);
const col = (n: number) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

/** Un valor de celda: dato suelto o fórmula con su resultado. */
type V = string | number | Date | null | { f: string; r: number };
type Tipo = 'texto' | 'pesos' | 'fecha' | 'entero';
interface Col { h: string; w: number; t: Tipo; suma?: boolean }

const ETIQUETA_TIPO: Record<string, string> = {
  '31': 'Crédito fiscal (31)', '32': 'Consumo (32)', '33': 'Nota de débito (33)', '34': 'Nota de crédito (34)',
  '44': 'Regímenes especiales (44)', '45': 'Gubernamental (45)', '46': 'Exportación (46)', 'sin-ncf': 'Sin NCF',
};
const etiquetaTipo = (t: string) => ETIQUETA_TIPO[t] ?? t;

const capitalizar = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function titulo(ws: ExcelJS.Worksheet, texto: string, sub: string, tam = 14) {
  const t = ws.getCell('A1');
  t.value = texto;
  t.font = { name: FUENTE, size: tam, bold: true, color: { argb: NAVY } };
  const s = ws.getCell('A2');
  s.value = sub;
  s.font = { name: FUENTE, size: 9, color: { argb: 'FF808080' } };
}

function encabezado(row: ExcelJS.Row, textos: string[]) {
  textos.forEach((h, j) => {
    const c = row.getCell(j + 1);
    c.value = h;
    c.font = { name: FUENTE, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  row.height = 30;
}

function poner(c: ExcelJS.Cell, v: V, t: Tipo) {
  if (v !== null && typeof v === 'object' && !(v instanceof Date)) c.value = { formula: v.f, result: v.r };
  else c.value = v;
  c.font = { name: FUENTE, size: 10 };
  c.border = borde;
  if (t === 'pesos') c.numFmt = PESOS;
  else if (t === 'fecha') { c.numFmt = FECHA; c.alignment = { horizontal: 'center' }; }
  else if (t === 'entero') c.numFmt = '#,##0';
}

/**
 * Hoja de tabla: título, subtítulo, encabezado en la fila 4, datos desde la 5 y
 * una fila de TOTAL con SUM en las columnas marcadas. Devuelve el rango de datos.
 */
function hojaTabla(
  wb: ExcelJS.Workbook, nombre: string, tituloHoja: string, sub: string, cols: Col[], filas: V[][],
  opciones: { color?: string; fondoFila?: (i: number) => string | null } = {},
): { nombre: string; primera: number; ultima: number; total: number } {
  const ws = wb.addWorksheet(nombre, { properties: { tabColor: { argb: opciones.color ?? NAVY } }, views: [{ showGridLines: false }] });
  cols.forEach((c, j) => { ws.getColumn(j + 1).width = c.w; });
  titulo(ws, tituloHoja, sub);
  encabezado(ws.getRow(4), cols.map((c) => c.h));

  filas.forEach((f, i) => {
    const row = ws.getRow(5 + i);
    const fondo = opciones.fondoFila?.(i) ?? null;
    cols.forEach((c, j) => {
      const cell = row.getCell(j + 1);
      poner(cell, f[j] ?? null, c.t);
      if (fondo) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fondo } };
    });
  });

  const primera = 5;
  const ultima = 4 + filas.length;
  const total = ultima + 1;
  if (filas.length > 0) {
    const tr = ws.getRow(total);
    cols.forEach((c, j) => {
      const cell = tr.getCell(j + 1);
      cell.font = { name: FUENTE, size: 10, bold: true };
      if (c.suma) {
        const suma = filas.reduce((a, f) => {
          const v = f[j];
          const n = v !== null && typeof v === 'object' && !(v instanceof Date) ? v.r : typeof v === 'number' ? v : 0;
          return a + n;
        }, 0);
        cell.value = { formula: `SUM(${col(j + 1)}${primera}:${col(j + 1)}${ultima})`, result: Math.round(suma * 100) / 100 };
        cell.numFmt = c.t === 'pesos' ? PESOS : '#,##0';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FONDO } };
      }
    });
    // «TOTAL» va en la columna justo antes de la primera suma, alineado a la derecha.
    const primeraSuma = cols.findIndex((c) => c.suma);
    if (primeraSuma > 0) {
      const l = tr.getCell(primeraSuma);
      l.value = 'TOTAL';
      l.alignment = { horizontal: 'right' };
      l.font = { name: FUENTE, size: 10, bold: true };
    }
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: ultima, column: cols.length } };
  } else {
    const c = ws.getRow(5).getCell(1);
    c.value = 'Sin movimientos en este período';
    c.font = { name: FUENTE, size: 10, italic: true, color: { argb: 'FF808080' } };
  }

  ws.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
  ws.pageSetup = {
    orientation: cols.length > 6 ? 'landscape' : 'portrait', paperSize: 9,
    fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '4:4',
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  return { nombre, primera, ultima: Math.max(ultima, primera), total };
}

// ── Reglas de negocio ───────────────────────────────────────────────────────

const estadoDeCobro = (v: VentaFiscal): 'pagada' | 'parcial' | 'sin-pago' =>
  v.totalCents <= 0 ? 'pagada' : v.cobradoCents <= 0 ? 'sin-pago' : v.cobradoCents >= v.totalCents ? 'pagada' : 'parcial';

/** Marca las ventas automáticas sin pago: repetidas (misma clave dos veces en el mes) o por revisar. */
export function marcarRevision(ventas: VentaFiscal[]): Map<VentaFiscal, 'Posible repetida' | 'Por revisar'> {
  const cuenta = new Map<string, number>();
  for (const v of ventas) {
    if (v.automatica && v.claveRepetida) cuenta.set(v.claveRepetida, (cuenta.get(v.claveRepetida) ?? 0) + 1);
  }
  const salida = new Map<VentaFiscal, 'Posible repetida' | 'Por revisar'>();
  for (const v of ventas) {
    if (!v.automatica || estadoDeCobro(v) !== 'sin-pago') continue;
    salida.set(v, v.claveRepetida && (cuenta.get(v.claveRepetida) ?? 0) > 1 ? 'Posible repetida' : 'Por revisar');
  }
  return salida;
}

const rncValido = (r: string | null) => (r ?? '').replace(/\D/g, '');
function tipoIdProveedor(rnc: string | null): string {
  const d = rncValido(rnc);
  if (!d) return '';
  return d.length === 11 ? '2' : '1';
}

// ── Libro ───────────────────────────────────────────────────────────────────

export function armarLibroFiscal(d: DatosFiscales): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zero';
  wb.created = new Date();
  // Que Excel recalcule al abrir: un resultado en cero no siempre queda guardado.
  wb.calcProperties.fullCalcOnLoad = true;
  const periodo = nombrePeriodo(d.anio, d.mes);
  wb.title = `Reporte fiscal ${periodo} · ${d.empresa}`;
  const sub = `${d.empresa}${d.rnc ? ` · RNC ${d.rnc}` : ''} · datos de Zero al ${d.generadoEn}`;

  const ventas = [...d.ventas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.codigo.localeCompare(b.codigo));
  const revision = marcarRevision(ventas);

  // 1) Ingresos cobrados
  const cobros = [...d.cobros].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.codigo.localeCompare(b.codigo));
  const metodos = [...new Set(cobros.map((c) => capitalizar(c.metodo)))].sort((a, b) => a.localeCompare(b, 'es'));
  const hCobros = hojaTabla(wb, 'Ingresos cobrados', `Ingresos cobrados · ${d.empresa} · ${periodo}`, sub, [
    { h: 'Fecha de pago', w: 14, t: 'fecha' },
    { h: 'Factura', w: 24, t: 'texto' },
    { h: 'Cliente', w: 34, t: 'texto' },
    { h: 'Método de pago', w: 18, t: 'texto' },
    { h: 'Monto', w: 16, t: 'pesos', suma: true },
    { h: 'Referencia', w: 28, t: 'texto' },
  ], cobros.map((c) => [dia(c.fecha), c.codigo, c.cliente ?? '(sin cliente)', capitalizar(c.metodo), pesos(c.montoCents), c.referencia ?? '']));

  // 2) Parciales y 3) sin pago
  const parciales = ventas.filter((v) => estadoDeCobro(v) === 'parcial');
  const sinPago = ventas.filter((v) => estadoDeCobro(v) === 'sin-pago');
  const colsSaldo: Col[] = [
    { h: 'Fecha', w: 13, t: 'fecha' },
    { h: 'Factura', w: 24, t: 'texto' },
    { h: 'Cliente', w: 34, t: 'texto' },
    { h: 'NCF', w: 20, t: 'texto' },
    { h: 'Total', w: 16, t: 'pesos', suma: true },
    { h: 'Cobrado', w: 16, t: 'pesos', suma: true },
    { h: 'Saldo pendiente', w: 17, t: 'pesos', suma: true },
    { h: 'Revisión', w: 20, t: 'texto' },
  ];
  const filaSaldo = (v: VentaFiscal, i: number): V[] => [
    dia(v.fecha), v.codigo, v.cliente ?? '(sin cliente)', v.ncf ?? '', pesos(v.totalCents), pesos(v.cobradoCents),
    { f: `E${5 + i}-F${5 + i}`, r: pesos(v.totalCents - v.cobradoCents) }, revision.get(v) ?? '',
  ];
  const hParciales = hojaTabla(wb, 'Facturas parciales', `Facturas parciales · ${periodo}`, sub, colsSaldo, parciales.map(filaSaldo));
  const hSinPago = hojaTabla(wb, 'Facturas sin pago', `Facturas sin pago · ${periodo}`, sub, colsSaldo, sinPago.map(filaSaldo), {
    fondoFila: (i) => (revision.has(sinPago[i]) ? AVISO_FONDO : null),
  });

  // 5) Ventas (607) — se arma antes que Resumen para conocer sus rangos, pero se ordena al final.
  const hVentas = hojaTabla(wb, 'Ventas emitidas (607)', `Ventas emitidas (607) · ${d.empresa} · ${periodo}`, sub, [
    { h: 'Fecha', w: 13, t: 'fecha' },
    { h: 'Factura', w: 24, t: 'texto' },
    { h: 'Cliente', w: 34, t: 'texto' },
    { h: 'RNC / Cédula', w: 16, t: 'texto' },
    { h: 'NCF', w: 20, t: 'texto' },
    { h: 'Tipo', w: 24, t: 'texto' },
    { h: 'Total', w: 16, t: 'pesos', suma: true },
    { h: 'ITBIS', w: 15, t: 'pesos', suma: true },
    { h: 'Cobrado', w: 16, t: 'pesos', suma: true },
    { h: 'Saldo pendiente', w: 17, t: 'pesos', suma: true },
    { h: 'Estado', w: 12, t: 'texto' },
  ], ventas.map((v, i) => {
    const e = estadoDeCobro(v);
    return [
      dia(v.fecha), v.codigo, v.cliente ?? '(sin cliente)', v.rnc ?? '', v.ncf ?? '', etiquetaTipo(v.tipo),
      pesos(v.totalCents), pesos(v.itbisCents), pesos(v.cobradoCents),
      { f: `G${5 + i}-I${5 + i}`, r: pesos(v.totalCents - v.cobradoCents) },
      e === 'pagada' ? 'Pagada' : e === 'parcial' ? 'Parcial' : 'Sin pago',
    ];
  }));

  // 6) Gastos (606)
  const compras = [...d.compras];
  const hGastos = hojaTabla(wb, 'Gastos (606)', `Gastos (606) · ${d.empresa} · ${periodo}`, sub, [
    { h: 'Fecha comprobante', w: 14, t: 'fecha' },
    { h: 'Proveedor', w: 32, t: 'texto' },
    { h: 'RNC proveedor', w: 15, t: 'texto' },
    { h: 'Tipo bienes y servicios', w: 12, t: 'texto' },
    { h: 'Tipo ID', w: 8, t: 'texto' },
    { h: 'NCF', w: 20, t: 'texto' },
    { h: 'NCF modificado', w: 20, t: 'texto' },
    { h: 'Fecha de pago', w: 13, t: 'fecha' },
    { h: 'Forma de pago', w: 26, t: 'texto' },
    { h: 'Monto servicios', w: 16, t: 'pesos', suma: true },
    { h: 'Monto bienes', w: 16, t: 'pesos', suma: true },
    { h: 'Total facturado', w: 16, t: 'pesos', suma: true },
    { h: 'ITBIS facturado', w: 15, t: 'pesos', suma: true },
    { h: 'ITBIS retenido', w: 15, t: 'pesos', suma: true },
    { h: 'ITBIS proporcionalidad', w: 15, t: 'pesos', suma: true },
    { h: 'ITBIS llevado al costo', w: 15, t: 'pesos', suma: true },
    { h: 'ITBIS por adelantar', w: 15, t: 'pesos', suma: true },
    { h: 'Tipo retención ISR', w: 28, t: 'texto' },
    { h: 'ISR retenido', w: 15, t: 'pesos', suma: true },
    { h: 'ISC', w: 13, t: 'pesos', suma: true },
    { h: 'Otros impuestos', w: 15, t: 'pesos', suma: true },
    { h: 'Propina legal', w: 13, t: 'pesos', suma: true },
    { h: 'Total pagado (con impuestos)', w: 18, t: 'pesos', suma: true },
    { h: 'Observación', w: 44, t: 'texto' },
  ], compras.map((c, i) => {
    const r = 5 + i;
    const L = c.montoServiciosCents + c.montoBienesCents;
    const Q = Math.max(0, c.itbisFacturadoCents - c.itbisProporcionalidadCents - c.itbisAlCostoCents);
    const W = L + c.itbisFacturadoCents + c.iscCents + c.otrosImpuestosCents + c.propinaCents;
    const obs: string[] = [];
    if (c.otrosImpuestosCents > 0) obs.push('Tiene «otros impuestos»: revisar si es ITBIS o ISC.');
    return [
      dia(c.fechaComprobante), c.proveedor ?? '', c.rncProveedor ?? '', c.tipoBienes, tipoIdProveedor(c.rncProveedor),
      c.ncf, c.ncfModificado ?? '', c.fechaPago ? dia(c.fechaPago) : null, FORMAS_PAGO_606[c.formaPago] ?? c.formaPago,
      pesos(c.montoServiciosCents), pesos(c.montoBienesCents),
      { f: `J${r}+K${r}`, r: pesos(L) },
      pesos(c.itbisFacturadoCents), pesos(c.itbisRetenidoCents), pesos(c.itbisProporcionalidadCents), pesos(c.itbisAlCostoCents),
      { f: `MAX(0,M${r}-O${r}-P${r})`, r: pesos(Q) },
      c.isrTipo != null ? (TIPOS_RETENCION_ISR[c.isrTipo as keyof typeof TIPOS_RETENCION_ISR] ?? String(c.isrTipo)) : '',
      pesos(c.isrRetenidoCents), pesos(c.iscCents), pesos(c.otrosImpuestosCents), pesos(c.propinaCents),
      { f: `L${r}+M${r}+T${r}+U${r}+V${r}`, r: pesos(W) },
      obs.join(' '),
    ];
  }));

  // 4) Resumen (fórmulas sobre las otras hojas)
  const rs = wb.addWorksheet('Resumen', { properties: { tabColor: { argb: NAVY } }, views: [{ showGridLines: false }] });
  [46, 14, 20, 20].forEach((w, j) => { rs.getColumn(j + 1).width = w; });
  titulo(rs, `Resumen · ${d.empresa} · ${periodo}`, sub, 13);
  const q = (n: string) => `'${n}'`;
  const rango = (h: { nombre: string; primera: number; ultima: number }, c: string, abs = false) =>
    `${q(h.nombre)}!${abs ? '$' : ''}${c}${abs ? '$' : ''}${h.primera}:${abs ? '$' : ''}${c}${abs ? '$' : ''}${h.ultima}`;

  let fila = 4;
  encabezado(rs.getRow(fila), ['Método de pago', '# Pagos', 'Monto']);
  const filaMetodoIni = fila + 1;
  const sumaCobros = (m: string) => cobros.filter((c) => capitalizar(c.metodo) === m).reduce((a, c) => a + c.montoCents, 0);
  for (const m of metodos.length ? metodos : ['(sin cobros)']) {
    fila++;
    const n = cobros.filter((c) => capitalizar(c.metodo) === m).length;
    poner(rs.getCell(`A${fila}`), m, 'texto');
    poner(rs.getCell(`B${fila}`), { f: `COUNTIF(${rango(hCobros, 'D', true)},A${fila})`, r: n }, 'entero');
    poner(rs.getCell(`C${fila}`), { f: `SUMIF(${rango(hCobros, 'D', true)},A${fila},${rango(hCobros, 'E', true)})`, r: pesos(sumaCobros(m)) }, 'pesos');
  }
  const filaMetodoFin = fila;
  fila++;
  const totalCobrado = cobros.reduce((a, c) => a + c.montoCents, 0);
  const filaTotalCobrado = fila;
  poner(rs.getCell(`A${fila}`), 'TOTAL COBRADO', 'texto');
  poner(rs.getCell(`B${fila}`), { f: `SUM(B${filaMetodoIni}:B${filaMetodoFin})`, r: cobros.length }, 'entero');
  poner(rs.getCell(`C${fila}`), { f: `SUM(C${filaMetodoIni}:C${filaMetodoFin})`, r: pesos(totalCobrado) }, 'pesos');
  for (const c of ['A', 'B', 'C']) { rs.getCell(`${c}${fila}`).font = { name: FUENTE, size: 10, bold: true }; }

  const seccion = (texto: string) => {
    fila += 2;
    const c = rs.getCell(`A${fila}`);
    c.value = texto;
    c.font = { name: FUENTE, size: 11, bold: true, color: { argb: NAVY } };
  };
  const linea = (texto: string, f: string, r: number, negrita = false) => {
    fila++;
    const a = rs.getCell(`A${fila}`);
    a.value = texto;
    a.font = { name: FUENTE, size: 10, bold: negrita };
    const c = rs.getCell(`C${fila}`);
    c.value = { formula: f, result: Math.round(r * 100) / 100 };
    c.numFmt = PESOS;
    c.font = { name: FUENTE, size: 10, bold: negrita };
  };

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  seccion('Panorama facturado vs cobrado');
  linea('Facturado emitido en el periodo', `SUM(${rango(hVentas, 'G')})`, pesos(sum(ventas.map((v) => v.totalCents))));
  linea('  · ya cobrado de esas', `SUM(${rango(hVentas, 'I')})`, pesos(sum(ventas.map((v) => v.cobradoCents))));
  linea('  · saldo pendiente de esas', `SUM(${rango(hVentas, 'J')})`, pesos(sum(ventas.map((v) => v.totalCents - v.cobradoCents))));
  linea('    - en parciales', `SUM(${rango(hParciales, 'G')})`, pesos(sum(parciales.map((v) => v.totalCents - v.cobradoCents))));
  linea('    - en sin pago', `SUM(${rango(hSinPago, 'G')})`, pesos(sum(sinPago.map((v) => v.totalCents - v.cobradoCents))));
  const rep = sinPago.filter((v) => revision.get(v) === 'Posible repetida');
  const rev = sinPago.filter((v) => revision.get(v) === 'Por revisar');
  linea('        de ellas, automaticas posibles repetidas', `SUMIF(${rango(hSinPago, 'H')},"Posible repetida",${rango(hSinPago, 'G')})`, pesos(sum(rep.map((v) => v.totalCents - v.cobradoCents))));
  linea('        de ellas, automaticas por revisar', `SUMIF(${rango(hSinPago, 'H')},"Por revisar",${rango(hSinPago, 'G')})`, pesos(sum(rev.map((v) => v.totalCents - v.cobradoCents))));
  linea('Cobrado EN el periodo (caja del mes)', `C${filaTotalCobrado}`, pesos(totalCobrado));

  seccion(`Gastos del mes (606)`);
  fila++;
  encabezado(rs.getRow(fila), ['Tipo de bienes y servicios', '# Comprob.', 'Total facturado', 'ITBIS facturado']);
  const tipos = [...new Set(compras.map((c) => c.tipoBienes))].sort();
  const g0 = fila + 1;
  for (const t of tipos) {
    fila++;
    const delTipo = compras.filter((c) => c.tipoBienes === t);
    poner(rs.getCell(`A${fila}`), `${t} · ${TIPOS_BIENES_606[t as keyof typeof TIPOS_BIENES_606] ?? 'Otro'}`, 'texto');
    poner(rs.getCell(`B${fila}`), { f: `COUNTIF(${rango(hGastos, 'D', true)},"${t}")`, r: delTipo.length }, 'entero');
    poner(rs.getCell(`C${fila}`), { f: `SUMIF(${rango(hGastos, 'D', true)},"${t}",${rango(hGastos, 'L', true)})`, r: pesos(sum(delTipo.map((c) => c.montoServiciosCents + c.montoBienesCents))) }, 'pesos');
    poner(rs.getCell(`D${fila}`), { f: `SUMIF(${rango(hGastos, 'D', true)},"${t}",${rango(hGastos, 'M', true)})`, r: pesos(sum(delTipo.map((c) => c.itbisFacturadoCents))) }, 'pesos');
  }
  const g1 = fila;
  fila++;
  poner(rs.getCell(`A${fila}`), 'TOTAL GASTOS', 'texto');
  if (tipos.length) {
    poner(rs.getCell(`B${fila}`), { f: `SUM(B${g0}:B${g1})`, r: compras.length }, 'entero');
    poner(rs.getCell(`C${fila}`), { f: `SUM(C${g0}:C${g1})`, r: pesos(sum(compras.map((c) => c.montoServiciosCents + c.montoBienesCents))) }, 'pesos');
    poner(rs.getCell(`D${fila}`), { f: `SUM(D${g0}:D${g1})`, r: pesos(sum(compras.map((c) => c.itbisFacturadoCents))) }, 'pesos');
  } else {
    poner(rs.getCell(`B${fila}`), 0, 'entero'); poner(rs.getCell(`C${fila}`), 0, 'pesos'); poner(rs.getCell(`D${fila}`), 0, 'pesos');
  }
  for (const c of ['A', 'B', 'C', 'D']) rs.getCell(`${c}${fila}`).font = { name: FUENTE, size: 10, bold: true };

  fila++;
  const itbisAdelantar = (c: Compra606Detallada) => Math.max(0, c.itbisFacturadoCents - c.itbisProporcionalidadCents - c.itbisAlCostoCents);
  const totalPagado = (c: Compra606Detallada) => c.montoServiciosCents + c.montoBienesCents + c.itbisFacturadoCents + c.iscCents + c.otrosImpuestosCents + c.propinaCents;
  linea('Total pagado a proveedores (con todos los impuestos)', `SUM(${rango(hGastos, 'W')})`, pesos(sum(compras.map(totalPagado))));
  linea('ITBIS llevado al costo', `SUM(${rango(hGastos, 'P')})`, pesos(sum(compras.map((c) => c.itbisAlCostoCents))));
  linea('ITBIS por adelantar', `SUM(${rango(hGastos, 'Q')})`, pesos(sum(compras.map(itbisAdelantar))));
  linea('Otros impuestos registrados (revisar, ver Observacion)', `SUM(${rango(hGastos, 'U')})`, pesos(sum(compras.map((c) => c.otrosImpuestosCents))));
  rs.views = [{ showGridLines: false }];
  rs.pageSetup = { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  // 7) Notas
  const nt = wb.addWorksheet('Notas', { properties: { tabColor: { argb: 'FF9CA3AF' } }, views: [{ showGridLines: false }] });
  nt.getColumn(1).width = 120;
  const lineas: { t: string; tipo: 'h' | 'p' | 'v' }[] = [];
  const h = (t: string) => lineas.push({ t, tipo: 'h' });
  const p = (t: string) => lineas.push({ t, tipo: 'p' });
  const v = () => lineas.push({ t: '', tipo: 'v' });
  const RD = (c: number) => `RD$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  h('Como se armo este archivo');
  p(`Datos sacados de Zero el ${d.generadoEn}, empresa ${d.empresa}${d.rnc ? `, RNC ${d.rnc}` : ''}, periodo ${periodo}.`);
  p(`Ingresos cobrados: cada pago con fecha de ${periodo}, una fila por pago, de facturas no anuladas.`);
  p(`Ventas emitidas (607): cada factura o nota no anulada con fecha de ${periodo}. Las notas de credito restan.`);
  p('Facturas parciales y sin pago: salen de esas mismas ventas, con los cobros registrados hasta hoy (incluye cobros hechos despues del cierre del mes).');
  p(`Gastos (606): compras y gastos registrados en Zero con fecha de comprobante en ${periodo}, con la misma logica del reporte 606 del sistema (comprobantes de consumo no se reportan).`);
  v();
  h('Lo que NO se incluyo en ventas');
  p(d.anuladas.cantidad > 0
    ? `${d.anuladas.cantidad} facturas anuladas de ${periodo} (${RD(d.anuladas.totalCents)}).`
    : 'No hubo facturas anuladas en el periodo.');
  v();
  h('Puntos a revisar');
  if (rep.length || rev.length) {
    p(`Facturas sin pago: ${rep.length} automaticas marcadas «Posible repetida» y ${rev.length} «Por revisar» siguen esperando decision. Si se anulan, bajan las ventas y el saldo pendiente.`);
  }
  const sinCliente = ventas.filter((x) => !x.cliente);
  if (sinCliente.length) p(`${sinCliente.length} facturas no tienen cliente en el sistema (ver «(sin cliente)» en Ventas).`);
  const conOtros = compras.filter((c) => c.otrosImpuestosCents > 0);
  if (conOtros.length) p(`Gastos: ${conOtros.length} comprobantes con impuestos en «otros impuestos» que podrian ser ITBIS o ISC. Detalle en la columna Observacion de la hoja Gastos (606).`);
  const vistos = new Map<string, number>();
  for (const c of compras) {
    const k = `${c.rncProveedor ?? c.proveedor}|${c.fechaComprobante}|${c.montoServiciosCents + c.montoBienesCents}`;
    vistos.set(k, (vistos.get(k) ?? 0) + 1);
  }
  const dupes = [...vistos.values()].filter((n) => n > 1).length;
  if (dupes) p(`Gastos: ${dupes} grupos de comprobantes del mismo proveedor, el mismo dia y el mismo subtotal (posible doble registro).`);
  if (!rep.length && !rev.length && !sinCliente.length && !conOtros.length && !dupes) p('Nada fuera de lo normal en este periodo.');

  lineas.forEach((l, i) => {
    const c = nt.getCell(`A${i + 1}`);
    c.value = l.t;
    c.alignment = { wrapText: true, vertical: 'top' };
    c.font = l.tipo === 'h'
      ? { name: FUENTE, size: 12, bold: true, color: { argb: NAVY } }
      : { name: FUENTE, size: 10 };
  });

  // Orden como el archivo de referencia: cobros, parciales, sin pago, resumen, 607, 606, notas.
  const orden = ['Ingresos cobrados', 'Facturas parciales', 'Facturas sin pago', 'Resumen', 'Ventas emitidas (607)', 'Gastos (606)', 'Notas'];
  // ExcelJS ordena las hojas por `orderNo` al escribir (no está en sus tipos).
  for (const ws of wb.worksheets) (ws as unknown as { orderNo: number }).orderNo = orden.indexOf(ws.name);
  return wb;
}
