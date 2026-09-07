import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { soporteAplica } from '@/components/support/rutas-sin-soporte';

/**
 * El widget de soporte vive en el layout raíz, así que se monta en TODAS las
 * rutas y hay que apagarlo a mano donde no toca. La lista se había duplicado —
 * el chat tenía una y el sondeo de llamadas otra— y por ahí se coló el enlace
 * de pago del padre: una página pública que pedía `/api/zero-tickets/tickets`
 * cada 3 segundos, cobraba un 401 cada vez, y le ofrecía a un padre sin cuenta
 * un chat de soporte que nunca podría abrir.
 */
describe('soporteAplica', () => {
  it('sí en las pantallas normales del colegio', () => {
    for (const p of ['/dashboard', '/dashboard/facturas/nueva', '/escolar/estudiantes/282', '/pos']) {
      assert.equal(soporteAplica(p), true, p);
    }
  });

  it('no en las páginas públicas del padre', () => {
    for (const p of [
      '/pagar/3wliaQYaT-zquwjgdbxnbbiV3oKDku49',
      '/pay/abc123',
      '/d/token-de-documento',
      '/f/formulario/xyz/r',
      '/foto/token',
    ]) {
      assert.equal(soporteAplica(p), false, p);
    }
  });

  it('no en impresión ni en la consola de agentes', () => {
    for (const p of ['/pos-ticket/9', '/pos-reporte/3', '/zero-tickets', '/dashboard/soporte']) {
      assert.equal(soporteAplica(p), false, p);
    }
  });

  /**
   * Los prefijos públicos de una letra llevan barra a propósito. Sin ella,
   * `/dashboard` empezaría por `/d` y el colegio se quedaría sin soporte en su
   * pantalla principal.
   */
  it('un prefijo corto no se come una ruta que solo lo parece', () => {
    assert.equal(soporteAplica('/dashboard'), true);
    assert.equal(soporteAplica('/facturas'), true);
    assert.equal(soporteAplica('/fotos-galeria'), true);
  });

  /** Antes de que Next resuelva la ruta no se esconde nada: se asume que sí. */
  it('sin ruta todavía, el soporte aplica', () => {
    assert.equal(soporteAplica(null), true);
    assert.equal(soporteAplica(undefined), true);
  });
});
