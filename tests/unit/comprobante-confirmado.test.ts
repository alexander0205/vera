import { describe, expect, it } from 'vitest';
import { montoConfirmado } from '@/lib/administracion-escolar/comprobante-confirmado';

/**
 * Tarea 9 de Mi Casita: la familia declaró RD$6,000, el papel decía RD$3,000 y
 * el colegio aprobó RD$3,000. El padre debe ver lo que se confirmó.
 */
describe('lo que confirmó el colegio', () => {
  it('manda lo aprobado aunque lo declarado sea otra cosa', () => {
    expect(montoConfirmado({ montoCentavos: 600_000, montoAprobadoCentavos: 300_000 })).toBe(300_000);
  });
  it('sin dato, lo declarado', () => {
    expect(montoConfirmado({ montoCentavos: 600_000, montoAprobadoCentavos: null })).toBe(600_000);
  });
});
