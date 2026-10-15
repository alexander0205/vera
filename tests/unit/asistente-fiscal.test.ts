import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { armarLibroFiscal, marcarRevision, type DatosFiscales, type VentaFiscal } from '@/lib/asistente/reporte-fiscal';
import { pedidoFiscal } from '@/lib/asistente/reporte-fiscal-pedido';

const venta = (o: Partial<VentaFiscal>): VentaFiscal => ({
  fecha: '2026-09-05', codigo: 'FA-1', cliente: 'Ana', rnc: null, ncf: null, tipo: 'sin-ncf',
  totalCents: 100_000, itbisCents: 0, cobradoCents: 0, automatica: false, claveRepetida: null, ...o,
});

const DATOS: DatosFiscales = {
  empresa: 'COLEGIO X', rnc: '133716348', anio: 2026, mes: 9, generadoEn: '15-10-2026',
  ventas: [
    venta({ codigo: 'FA-1', totalCents: 100_000, cobradoCents: 100_000 }),
    venta({ codigo: 'FA-2', cliente: 'Luis', totalCents: 250_000, cobradoCents: 100_000 }),
    venta({ codigo: 'FA-3', cliente: 'Eva', totalCents: 80_000, automatica: true, claveRepetida: 'r1|7|2026-09-01' }),
    venta({ codigo: 'FA-4', cliente: 'Eva', totalCents: 80_000, automatica: true, claveRepetida: 'r1|7|2026-09-01' }),
    venta({ codigo: 'FA-5', cliente: 'Omar', totalCents: 50_000, automatica: true, claveRepetida: 'r2|9|2026-09-01' }),
    venta({ codigo: 'FA-6', cliente: null, totalCents: 10_000 }),
  ],
  cobros: [
    { fecha: '2026-09-06', codigo: 'FA-1', cliente: 'Ana', metodo: 'efectivo', montoCents: 100_000, referencia: null },
    { fecha: '2026-09-07', codigo: 'FA-2', cliente: 'Luis', metodo: 'transferencia', montoCents: 100_000, referencia: 'T-9' },
  ],
  compras: [{
    proveedor: 'Surtidora', rncProveedor: '101010101', ncf: 'B0100000001', ncfModificado: null, tipoBienes: '02',
    fechaComprobante: '2026-09-10', fechaPago: null, montoServiciosCents: 100_000, montoBienesCents: 0,
    itbisFacturadoCents: 18_000, itbisRetenidoCents: 0, itbisProporcionalidadCents: 0, itbisAlCostoCents: 0,
    isrTipo: null, isrRetenidoCents: 0, iscCents: 0, otrosImpuestosCents: 500, propinaCents: 0, formaPago: '2',
  }],
  anuladas: { cantidad: 2, totalCents: 12_345 },
};

async function leer(d = DATOS) {
  const wb = armarLibroFiscal(d);
  const r = new ExcelJS.Workbook();
  await r.xlsx.load(await wb.xlsx.writeBuffer());
  return r;
}

describe('reporte fiscal en Excel', () => {
  it('trae las siete hojas en el orden del archivo de referencia', async () => {
    const r = await leer();
    expect(r.worksheets.map((w) => w.name)).toEqual([
      'Ingresos cobrados', 'Facturas parciales', 'Facturas sin pago', 'Resumen', 'Ventas emitidas (607)', 'Gastos (606)', 'Notas',
    ]);
  });

  it('cada hoja de datos tiene título, encabezado en la fila 4 y total con SUM', async () => {
    const r = await leer();
    const c = r.getWorksheet('Ingresos cobrados')!;
    expect(String(c.getCell('A1').value)).toContain('Ingresos cobrados');
    expect(c.getCell('A4').value).toBe('Fecha de pago');
    expect(c.getCell('E5').value).toBe(1000);
    const t = c.getCell('E7').value as { formula: string; result: number };
    expect(t.formula).toBe('SUM(E5:E6)');
    expect(t.result).toBe(2000);
  });

  it('parciales y sin pago salen de las ventas, con el saldo como fórmula', async () => {
    const r = await leer();
    const p = r.getWorksheet('Facturas parciales')!;
    expect(p.getCell('B5').value).toBe('FA-2');
    expect((p.getCell('G5').value as { formula: string; result: number })).toMatchObject({ formula: 'E5-F5', result: 1500 });
    const s = r.getWorksheet('Facturas sin pago')!;
    expect([s.getCell('B5').value, s.getCell('B6').value, s.getCell('B7').value, s.getCell('B8').value]).toEqual(['FA-3', 'FA-4', 'FA-5', 'FA-6']);
    expect([s.getCell('H5').value, s.getCell('H6').value, s.getCell('H7').value]).toEqual(['Posible repetida', 'Posible repetida', 'Por revisar']);
  });

  it('las automáticas sin pago se marcan; las manuales y las pagadas no', () => {
    const m = marcarRevision(DATOS.ventas);
    expect(m.size).toBe(3);
    expect(m.get(DATOS.ventas[0])).toBeUndefined();
    expect(m.get(DATOS.ventas[5])).toBeUndefined();
  });

  it('el Resumen usa fórmulas sobre las otras hojas y su resultado cuadra', async () => {
    const r = await leer();
    const s = r.getWorksheet('Resumen')!;
    const celdas: Record<string, { formula: string; result: number }> = {};
    s.eachRow((row) => row.eachCell((cell) => {
      if (cell.value && typeof cell.value === 'object' && 'formula' in cell.value) celdas[cell.address] = cell.value as { formula: string; result: number };
    }));
    const formulas = Object.values(celdas).map((c) => c.formula);
    expect(formulas.some((f) => f.includes("COUNTIF('Ingresos cobrados'!$D$5:$D$6"))).toBe(true);
    expect(formulas.some((f) => f.includes("SUM('Ventas emitidas (607)'!G5:G10)"))).toBe(true);
    expect(formulas.some((f) => f.includes('SUMIF(\'Facturas sin pago\'!H5:H8,"Posible repetida"'))).toBe(true);
    // Facturado 570,000 centavos = 5,700; cobrado 2,000; saldo 3,700.
    const por = (f: string) => Object.values(celdas).find((c) => c.formula === f)?.result;
    expect(por("SUM('Ventas emitidas (607)'!G5:G10)")).toBe(5700);
    expect(por("SUM('Ventas emitidas (607)'!I5:I10)")).toBe(2000);
    expect(por("SUM('Ventas emitidas (607)'!J5:J10)")).toBe(3700);
  });

  it('gastos 606: total, ITBIS por adelantar y otros impuestos', async () => {
    const r = await leer();
    const g = r.getWorksheet('Gastos (606)')!;
    expect(g.getCell('F5').value).toBe('B0100000001');
    expect((g.getCell('L5').value as { result: number }).result).toBe(1000);
    expect((g.getCell('Q5').value as { result: number }).result).toBe(180);
    expect((g.getCell('W5').value as { result: number }).result).toBe(1185); // 1000 + 180 + 5
    expect(String(g.getCell('X5').value)).toContain('otros impuestos');
    const s = r.getWorksheet('Resumen')!;
    let hallado = false;
    s.eachRow((row) => {
      if (String(row.getCell(1).value).startsWith('02 ·')) {
        hallado = true;
        expect((row.getCell(3).value as { result: number }).result).toBe(1000);
      }
    });
    expect(hallado).toBe(true);
  });

  it('las notas dicen lo que quedó fuera y lo que hay que revisar', async () => {
    const r = await leer();
    const n = r.getWorksheet('Notas')!;
    const texto: string[] = [];
    n.eachRow((row) => texto.push(String(row.getCell(1).value ?? '')));
    const todo = texto.join('\n');
    expect(todo).toContain('2 facturas anuladas');
    expect(todo).toContain('RD$123.45');
    expect(todo).toContain('2 automaticas marcadas «Posible repetida» y 1 «Por revisar»');
    expect(todo).toContain('1 facturas no tienen cliente');
  });

  it('un mes sin movimientos igual produce un libro válido', async () => {
    const r = await leer({ ...DATOS, ventas: [], cobros: [], compras: [], anuladas: { cantidad: 0, totalCents: 0 } });
    expect(r.worksheets).toHaveLength(7);
    expect(r.getWorksheet('Ventas emitidas (607)')!.getCell('A5').value).toBe('Sin movimientos en este período');
  });

  it('un nombre que empieza con = queda como texto, nunca como fórmula', async () => {
    const r = await leer({ ...DATOS, ventas: [venta({ cliente: '=HYPERLINK("http://x")', totalCents: 1000 })] });
    const v = r.getWorksheet('Ventas emitidas (607)')!.getCell('C5').value;
    expect(typeof v).toBe('string');
  });
});

describe('pedido del reporte fiscal', () => {
  const HOY = '2026-10-15';
  it('reconoce el pedido con su mes', () => {
    expect(pedidoFiscal('genera el 606 y 607 de septiembre en excel', HOY)).toEqual({ tipo: 'mes', anio: 2026, mes: 9 });
    expect(pedidoFiscal('dame el reporte fiscal del mes pasado', HOY)).toEqual({ tipo: 'mes', anio: 2026, mes: 9 });
    expect(pedidoFiscal('necesito el 607 en excel', HOY)).toEqual({ tipo: 'mes', anio: 2026, mes: 10 });
    expect(pedidoFiscal('prepárame el paquete fiscal de agosto', HOY)).toEqual({ tipo: 'mes', anio: 2026, mes: 8 });
  });
  it('un rango largo pide escoger un mes', () => {
    expect(pedidoFiscal('genera el 606 de este año en excel', HOY)).toEqual({ tipo: 'sin-mes' });
    expect(pedidoFiscal('genera el 607 de los últimos 3 meses', HOY)).toEqual({ tipo: 'sin-mes' });
  });
  it('las preguntas de ayuda y lo que no es fiscal no disparan la descarga', () => {
    expect(pedidoFiscal('¿cómo genero el 607?', HOY)).toBeNull();
    expect(pedidoFiscal('qué es el 606', HOY)).toBeNull();
    expect(pedidoFiscal('ventas por cliente en excel', HOY)).toBeNull();
    expect(pedidoFiscal('hola', HOY)).toBeNull();
  });
});
