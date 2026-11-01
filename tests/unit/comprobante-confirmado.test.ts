import { describe, expect, it } from 'vitest';
import {
  montoConfirmado, montoDelAviso, notaDeComprobante, seEnsenaElAviso,
} from '@/lib/administracion-escolar/comprobante-confirmado';

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

/**
 * Un comprobante de RD$15,590 se repartió entre tres facturas y a una le entraron
 * RD$1,110. Su página decía «Pago confirmado · RD$15,590».
 */
describe('el monto del aviso', () => {
  const aprobado = {
    estado: 'aprobado', montoCentavos: 17_623_000, montoAprobadoCentavos: 1_559_000,
    aplicadoEnFacturaCentavos: 111_000,
  };

  it('en la página de una factura, lo que entró a esa factura', () => {
    expect(montoDelAviso(aprobado)).toBe(111_000);
  });
  it('en el enlace general, todo lo confirmado', () => {
    expect(montoDelAviso({ ...aprobado, aplicadoEnFacturaCentavos: null })).toBe(1_559_000);
  });
  it('pendiente o rechazado, lo que se envió', () => {
    expect(montoDelAviso({ ...aprobado, estado: 'pendiente' })).toBe(17_623_000);
    expect(montoDelAviso({ ...aprobado, estado: 'rechazado' })).toBe(17_623_000);
  });
  it('no enseña «Pago confirmado · RD$0.00»', () => {
    expect(seEnsenaElAviso({ estado: 'aprobado', aplicadoEnFacturaCentavos: 0 })).toBe(false);
  });
  it('un rechazado sale aunque no haya entrado nada', () => {
    expect(seEnsenaElAviso({ estado: 'rechazado', aplicadoEnFacturaCentavos: 0 })).toBe(true);
  });
  it('en el enlace general salen todos', () => {
    expect(seEnsenaElAviso({ estado: 'aprobado', aplicadoEnFacturaCentavos: null })).toBe(true);
  });
  it('la nota es la que escribe la aprobación', () => {
    expect(notaDeComprobante(47)).toBe('Comprobante #47 aprobado');
  });
});
