import { describe, expect, it } from 'vitest';
import { construirLibroReporte, mesSiguiente, mesValido, nombreMes, textoSeguro, type ReporteMensual } from '@/lib/administracion-escolar/reporte-mensual';

describe('reporte mensual del colegio', () => {
  it('valida el mes', () => {
    expect(['2026-09', '2026-12'].every(mesValido)).toBe(true);
    for (const m of ['2026-13', '2026-9', '2026-00', '2026-09; DROP', '', null, undefined, 5, '1999-01']) expect(mesValido(m)).toBe(false);
  });
  it('mes siguiente cruza el año', () => {
    expect(mesSiguiente('2026-12')).toBe('2027-01-01');
    expect(mesSiguiente('2026-02')).toBe('2026-03-01');
    expect(nombreMes('2026-09')).toBe('septiembre de 2026');
  });
  it('neutraliza fórmulas y caracteres de control', () => {
    expect(textoSeguro('=1+1')).toBe("'=1+1");
    expect(textoSeguro('@x')).toBe("'@x");
    expect(textoSeguro('a\u0000b')).toBe('ab');
    expect(textoSeguro(null)).toBe('');
  });
  it('arma el libro con cuatro hojas', () => {
    const r: ReporteMensual = {
      periodo: '2026-2027', mes: '2026-09', devengadoCentavos: 100000, cobradoDeEsasCuotasCentavos: 40000, pendienteCentavos: 60000,
      cobros: [{ fecha: '2026-09-02', metodo: 'tarjeta', referencia: '=cmd', factura: 'E310', responsable: 'Ana', alumnos: 'Luis', recibidoCentavos: 40000, aplicadoCentavos: 40000 }],
      porMetodo: [{ metodo: 'tarjeta', recibidoCentavos: 40000, aplicadoCentavos: 40000, cobros: 1 }],
      pendientesDelMes: [{ mes: '2026-09', estudiante: 'Luis', curso: null, responsable: null, concepto: 'Colegiatura', montoCentavos: 100000, pagadoCentavos: 40000, saldoCentavos: 60000, estado: 'pago parcial', vencimiento: '2026-09-05', diasAtraso: 30 }],
      arrastre: [], truncado: false,
    };
    const wb = construirLibroReporte(r);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumen', 'Cobros del mes', 'Pendientes del mes', 'Meses anteriores']);
    expect(wb.getWorksheet('Cobros del mes')!.getRow(2).getCell(3).value).toBe("'=cmd");
    expect(wb.getWorksheet('Pendientes del mes')!.getRow(2).getCell(9).value).toBe('Pago parcial');
  });
});
