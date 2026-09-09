import { describe, it, expect } from 'vitest';
import { coberturaVinculo } from '@/lib/administracion-escolar/cobertura-vinculo';

/**
 * Transparencia neutra del vínculo cargo↔factura. Cada aviso debe significar
 * UNA sola cosa: «sin cubrir» = la factura no alcanza el cargo; «pendiente de
 * saldar» = la factura cubre bien pero aún no la pagan. Cargo de RD$3,700
 * (370000 centavos) en los 4 casos base.
 */
const CARGO = 370000;

describe('coberturaVinculo', () => {
  it('caso 1: factura correcta y pagada → nada', () => {
    expect(coberturaVinculo({
      ecfDocumentId: 1, montoCentavos: CARGO, facturaMontoCentavos: CARGO, facturaEstadoPago: 'PAGADA',
    })).toEqual({ tipo: 'ok' });
  });

  it('caso 2: factura correcta pero SIN pagar → pendiente de saldar (no «sin cubrir»)', () => {
    expect(coberturaVinculo({
      ecfDocumentId: 1, montoCentavos: CARGO, facturaMontoCentavos: CARGO, facturaEstadoPago: 'PENDIENTE',
    })).toEqual({ tipo: 'pendiente' });
  });

  it('caso 3: factura MÁS CHICA y pagada → sin cubrir la diferencia', () => {
    expect(coberturaVinculo({
      ecfDocumentId: 1, montoCentavos: CARGO, facturaMontoCentavos: 200000, facturaEstadoPago: 'PAGADA',
    })).toEqual({ tipo: 'sin-cubrir', sinCubrirCentavos: 170000 });
  });

  it('caso 4: factura MÁS CHICA y sin pagar → sin cubrir el hueco estructural (no el total)', () => {
    expect(coberturaVinculo({
      ecfDocumentId: 1, montoCentavos: CARGO, facturaMontoCentavos: 200000, facturaEstadoPago: 'PENDIENTE',
    })).toEqual({ tipo: 'sin-cubrir', sinCubrirCentavos: 170000 });
  });

  it('parcial cuenta como no-saldada cuando la factura cubre', () => {
    expect(coberturaVinculo({
      ecfDocumentId: 1, montoCentavos: CARGO, facturaMontoCentavos: CARGO, facturaEstadoPago: 'PARCIAL',
    })).toEqual({ tipo: 'pendiente' });
  });

  it('sin factura vinculada → nada', () => {
    expect(coberturaVinculo({
      ecfDocumentId: null, montoCentavos: CARGO, facturaMontoCentavos: null, facturaEstadoPago: null,
    })).toEqual({ tipo: 'ok' });
  });

  it('factura de varios cargos (más grande que un cargo suelto) → nunca «sin cubrir» falso', () => {
    // Una factura de RD$10,000 que cubre este cargo y otros; pagada.
    expect(coberturaVinculo({
      ecfDocumentId: 1, montoCentavos: CARGO, facturaMontoCentavos: 1000000, facturaEstadoPago: 'PAGADA',
    })).toEqual({ tipo: 'ok' });
  });

  it('factura exacta al cargo no deja hueco', () => {
    expect(coberturaVinculo({
      ecfDocumentId: 1, montoCentavos: CARGO, facturaMontoCentavos: CARGO, facturaEstadoPago: 'PAGADA',
    })).not.toMatchObject({ tipo: 'sin-cubrir' });
  });
});
