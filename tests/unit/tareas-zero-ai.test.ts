import { describe, it, expect } from 'vitest';
import {
  hallazgoCargoRepetido, hallazgoFacturaMenor, hallazgoPagoDeMas,
} from '@/lib/administracion-escolar/tareas-reglas';

/**
 * Lo que Zero AI escribe en cada tarea que abre. Son las revisiones que se
 * hacían a mano con el colegio (Mi Casita, octubre 2026): cada una tiene que
 * decir qué encontró, con cifras, y qué hay que decidir.
 */

describe('pago de más sin decidir', () => {
  const h = hallazgoPagoDeMas({ cargoId: 8734, estudianteId: 443, montoCentavos: 300000, factura: 'FA-…-000629', ecfDocumentId: 3636 });
  it('dice cuánto entró de más, en qué factura, y qué hay que decidir', () => {
    expect(h.titulo).toBe('Decidir qué hacer con RD$3,000 de pago de más');
    expect(h.descripcion).toContain('en la factura FA-…-000629');
    expect(h.descripcion).toContain('saldo a favor');
  });
  it('su llave es el cargo: revisar dos veces no abre otra', () => {
    expect(h.clave).toBe('pago-de-mas:8734');
    expect(h.cargoId).toBe(8734);
    expect(h.ecfDocumentId).toBe(3636);
  });
});

describe('un mes cobrado dos veces', () => {
  const h = hallazgoCargoRepetido({
    estudianteId: 437, conceptoId: 25, concepto: 'Sala de tarea', anio: 2026, mes: 9,
    cargos: [
      { id: 8601, montoCentavos: 300000, estado: 'pagado', factura: 'FA-…-000505', ecfDocumentId: 3180 },
      { id: 8726, montoCentavos: 300000, estado: 'pendiente', factura: null, ecfDocumentId: null },
    ],
  });
  it('nombra el concepto y el mes, y lista los dos cargos', () => {
    expect(h.titulo).toBe('Sala de tarea de septiembre 2026 está cobrado dos veces');
    expect(h.descripcion).toContain('RD$3,000 pagado (factura FA-…-000505)');
    expect(h.descripcion).toContain('RD$3,000 pendiente (sin factura)');
  });
  it('señala el cargo sin factura, que es el que suele sobrar', () => {
    expect(h.cargoId).toBe(8726);
    expect(h.ecfDocumentId).toBe(3180);
    expect(h.clave).toBe('cargo-repetido:437:25:2026-9');
  });
});

describe('una factura que no cubre su cargo', () => {
  const h = hallazgoFacturaMenor({
    cargoId: 7251, estudianteId: 441, concepto: 'Colegiatura', anio: 2026, mes: 10,
    cargoCentavos: 280000, facturaCentavos: 260000, factura: 'FA-…-000502', ecfDocumentId: 3332,
  });
  it('dice las dos cifras, lo que falta, y las dos salidas', () => {
    expect(h.titulo).toBe('Colegiatura de octubre 2026: la factura no cubre el cargo');
    expect(h.descripcion).toContain('es de RD$2,600 y el cargo de octubre 2026 es de RD$2,800: faltan RD$200');
    expect(h.descripcion).toContain('bajar el cargo');
    expect(h.descripcion).toContain('facturar la diferencia');
  });
});
