import { describe, expect, it } from 'vitest';
import { FacturaPDF, type FacturaPDFData } from '@/lib/pdf/FacturaPDF';

/** Junta todos los textos del árbol de elementos (sin renderizar el PDF). */
function textos(nodo: unknown, acc: string[] = []): string[] {
  if (nodo == null || typeof nodo === 'boolean') return acc;
  if (typeof nodo === 'string' || typeof nodo === 'number') { acc.push(String(nodo)); return acc; }
  if (Array.isArray(nodo)) { nodo.forEach((n) => textos(n, acc)); return acc; }
  const props = (nodo as { props?: { children?: unknown } }).props;
  if (props) textos(props.children, acc);
  return acc;
}

function datos(tipoEcf: string, extra: Partial<FacturaPDFData> = {}): FacturaPDFData {
  return {
    encf: tipoEcf === '34' ? 'E340000000007' : 'E310000000001',
    tipoEcf, tipoEcfNombre: 'Doc', fechaEmision: '1 de noviembre de 2026',
    tipoPagoNombre: 'Contado', estado: 'ACEPTADO',
    emisor: { razonSocial: 'Colegio', rnc: '131000000' },
    comprador: { razonSocial: 'Cliente' },
    items: [], subtotal: 100, totalItbis: 0, montoTotal: 100, saldo: 100,
    ...extra,
  } as FacturaPDFData;
}

describe('PDF de la nota de crédito', () => {
  it('no trae «Balance pendiente» ni «Saldo», aunque el saldo sea > 0', () => {
    const t = textos(FacturaPDF({ data: datos('34', { ncfModificado: 'E310000000001' }) })).join('|');
    expect(t).not.toMatch(/Balance pendiente/);
    expect(t).not.toMatch(/Saldo:/);
    expect(t).not.toMatch(/PAGADA/);
    expect(t).toMatch(/Factura que modifica: /);
    expect(t).toMatch(/E310000000001/);
    expect(t).toMatch(/Monto acreditado:/);
  });

  it('la factura sigue mostrando su saldo y la nota de débito el de la propia nota', () => {
    const f = textos(FacturaPDF({ data: datos('31') })).join('|');
    expect(f).toMatch(/Balance pendiente:/);
    expect(f).toMatch(/Saldo: /);
    const nd = textos(FacturaPDF({ data: datos('33', { montoTotal: 50, saldo: 20 }) })).join('|');
    expect(nd).toMatch(/Balance pendiente:/);
  });
});
