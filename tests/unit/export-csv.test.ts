import { describe, expect, it } from 'vitest';
import { csvDeHoja, nuevaHoja, respuestaCsv } from '@/lib/contabilidad/export-xlsx';
import { protegerFormulaCsv } from '@/lib/export/csv';

describe('CSV de reportes', () => {
  it('neutraliza fórmulas en textos de exportes especializados', () => {
    expect(protegerFormulaCsv('=HYPERLINK("https://example.com")')).toBe('\'=HYPERLINK("https://example.com")');
    expect(protegerFormulaCsv('  +CMD')).toBe("'  +CMD");
    expect(protegerFormulaCsv('-42')).toBe("'-42");
    expect(protegerFormulaCsv('Cliente normal')).toBe('Cliente normal');
  });
  it('conserva columnas, filas vacías y números; escapa texto y fórmulas', async () => {
    const { wb, ws } = nuevaHoja('Prueba');
    ws.columns = [
      { header: 'Nombre', key: 'nombre' },
      { header: 'Monto', key: 'monto' },
    ];
    ws.addRow({ nombre: 'Ana, "S.R.L."', monto: 12.5 });
    ws.addRow({});
    ws.addRow({ nombre: '=SUM(1,2)', monto: -3.25 });

    const csv = csvDeHoja(ws);
    expect(csv).toBe('\uFEFFNombre,Monto\r\n"Ana, ""S.R.L.""",12.5\r\n,\r\n"\'=SUM(1,2)",-3.25\r\n');

    const res = respuestaCsv(wb, 'prueba.csv');
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="prueba.csv"');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe(csv.slice(1));
  });
});
