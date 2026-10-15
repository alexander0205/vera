import { describe, it, expect } from 'vitest';
import { validarEnvio, totalesEnvio, anchosPorcentaje, MAX_FILAS } from '@/lib/export/listado';
import { armarEnvioTabla, describirFiltrosTabla, type ExportTabla } from '@/lib/export/tabla';

interface Nota { id: number; cliente: string | null; rnc: string | null; monto: number; estado: string }

const CFG: ExportTabla<Nota> = {
  titulo: 'Notas', archivo: 'notas',
  tachada: n => n.estado === 'ANULADO',
  columnas: [
    { titulo: 'Cliente', valor: n => n.cliente ?? 'Consumidor final', sub: n => n.rnc, ancho: 2 },
    { titulo: 'Estado', valor: n => n.estado },
    { titulo: 'Monto', valor: n => n.monto, tipo: 'moneda', total: true },
  ],
};

const notas: Nota[] = [
  { id: 1, cliente: 'Ana', rnc: '001', monto: 10000, estado: 'ACEPTADO' },
  { id: 2, cliente: null, rnc: null, monto: 5000, estado: 'ANULADO' },
  { id: 3, cliente: 'Ana', rnc: '001', monto: 2500, estado: 'ACEPTADO' },
];

describe('armar el envío desde la tabla', () => {
  it('lleva las filas como se ven, con segunda línea y tachadas', () => {
    const e = armarEnvioTabla(CFG, notas, 'Todas las fechas');
    expect(e.grupos).toHaveLength(1);
    expect(e.grupos[0].filas[0]).toEqual({ tachada: false, celdas: [{ texto: 'Ana', sub: '001' }, 'ACEPTADO', 10000] });
    expect(e.grupos[0].filas[1]).toEqual({ tachada: true, celdas: ['Consumidor final', 'ANULADO', 5000] });
  });

  it('agrupa en el orden de aparición, como la tabla', () => {
    const e = armarEnvioTabla(CFG, notas, '', n => n.cliente ?? 'Consumidor final');
    expect(e.grupos.map(g => [g.titulo, g.filas.length])).toEqual([['Ana', 2], ['Consumidor final', 1]]);
  });

  it('el total no suma las anuladas', () => {
    const e = armarEnvioTabla(CFG, notas, '');
    const v = validarEnvio({ ...e, formato: 'pdf' })!;
    expect(totalesEnvio(v, v.grupos.flatMap(g => g.filas))).toEqual({ 2: 12500 });
  });
});

describe('describir los filtros de la tabla', () => {
  const filters = [
    { type: 'search' as const, id: 'q' },
    { type: 'select' as const, id: 'estado', label: 'Estado', options: [{ value: 'ACEPTADO', label: 'Aceptado' }] },
    { type: 'daterange' as const, id: 'fecha' },
    { type: 'daterange' as const, id: 'proxima', label: 'Próxima emisión' },
  ];

  it('sin nada: todas las fechas', () => {
    expect(describirFiltrosTabla(filters, {})).toBe('Todas las fechas');
  });

  it('con todo, en orden y con etiquetas', () => {
    expect(describirFiltrosTabla(filters, { q: 'ana', estado: 'ACEPTADO', fecha_desde: '2026-10-01', fecha_hasta: '2026-10-15', proxima_desde: '2026-11-01' }))
      .toBe('Búsqueda: «ana» · Estado: Aceptado · Del 01/10/2026 al 15/10/2026 · Próxima emisión: desde el 01/11/2026');
  });
});

describe('validar lo que llega del navegador', () => {
  const base = { formato: 'xlsx', titulo: 'X', archivo: 'mi archivo/../x', filtroTexto: '', columnas: [{ titulo: 'A' }, { titulo: 'B', tipo: 'moneda', total: true }], grupos: [{ filas: [{ celdas: ['a', '12.5', 'sobra'] }] }] };

  it('normaliza celdas y limpia el nombre del archivo', () => {
    const v = validarEnvio(base)!;
    expect(v.archivo).toBe('mi-archivo-x');
    expect(v.grupos[0].filas[0].celdas).toEqual(['a', 12.5]);
  });

  it('acepta CSV con las mismas filas y filtros que Excel', () => {
    const v = validarEnvio({ ...base, formato: 'csv', filtroTexto: 'Desde el 01/10/2026' });
    expect(v?.formato).toBe('csv');
    expect(v?.filtroTexto).toBe('Desde el 01/10/2026');
    expect(v?.grupos[0].filas[0].celdas).toEqual(['a', 12.5]);
  });

  it('rechaza formatos raros, sin columnas o demasiadas filas', () => {
    expect(validarEnvio({ ...base, formato: 'docx' })).toBeNull();
    expect(validarEnvio({ ...base, columnas: [] })).toBeNull();
    expect(validarEnvio({ ...base, grupos: [{ filas: Array.from({ length: MAX_FILAS + 1 }, () => ({ celdas: [] })) }] })).toBeNull();
    expect(validarEnvio(null)).toBeNull();
  });

  it('una columna de texto no se puede marcar para totalizar', () => {
    expect(validarEnvio({ ...base, columnas: [{ titulo: 'A', total: true }] })!.columnas[0].total).toBe(false);
  });

  it('los anchos suman 100 %', () => {
    const a = anchosPorcentaje([{ titulo: 'a', ancho: 2 }, { titulo: 'b' }, { titulo: 'c' }]);
    expect(a).toEqual(['50.00%', '25.00%', '25.00%']);
  });
});
