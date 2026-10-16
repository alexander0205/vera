import { describe, expect, it, vi } from 'vitest';
import { nuevaHoja } from '@/lib/contabilidad/export-xlsx';

const pdf = vi.hoisted(() => ({ empresa: vi.fn(), respuesta: vi.fn() }));
vi.mock('@/lib/pdf/listado-respuesta', () => ({
  empresaParaPdf: pdf.empresa,
  respuestaListadoPdf: pdf.respuesta,
}));

import { respuestaPdfContable } from '@/lib/contabilidad/export-pdf';

describe('PDF de estados contables', () => {
  it('usa la misma hoja y periodo que Excel/CSV, con montos en pesos', async () => {
    pdf.empresa.mockResolvedValue({ empresa: 'Empresa de prueba', rnc: null });
    pdf.respuesta.mockResolvedValue(null);
    const { wb, ws } = nuevaHoja('Balance');
    ws.columns = [{ header: 'Concepto', key: 'concepto' }, { header: 'Monto', key: 'monto' }];
    ws.addRow({ concepto: 'Utilidad', monto: 123.45 });

    await respuestaPdfContable(wb, {
      teamId: 7, titulo: 'Estado de resultados', filename: 'estado-resultados.pdf',
      desde: '2026-10-01', hasta: '2026-10-15',
      anchos: ['72%', '28%'], columnasMoneda: [1],
    });

    expect(pdf.empresa).toHaveBeenCalledWith(7);
    expect(pdf.respuesta).toHaveBeenCalledWith(expect.objectContaining({
      empresa: 'Empresa de prueba', titulo: 'Estado de resultados',
      filtroTexto: 'Del 01/10/2026 al 15/10/2026',
      columnas: [
        { titulo: 'Concepto', ancho: '72%', alinear: 'left' },
        { titulo: 'Monto', ancho: '28%', alinear: 'right' },
      ],
      grupos: [{ filas: [{ celdas: ['Utilidad', 'RD$123.45'] }] }],
    }), 'estado-resultados.pdf', false);
  });
});
