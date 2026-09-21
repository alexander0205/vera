import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { soporteAplica, vigilaLlamadas } from '@/components/support/rutas-sin-soporte';

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

  it('no en las páginas públicas del empleado (firma y horas), sí en las de nómina', () => {
    assert.equal(soporteAplica('/firmar/token-de-firma'), false);
    assert.equal(soporteAplica('/horas/token-de-horas'), false);
    assert.equal(soporteAplica('/nomina/horas'), true);
  });

  it('no en impresión ni en la consola de agentes', () => {
    for (const p of ['/pos-ticket/9', '/pos-reporte/3', '/caja/imprimir/258', '/zero-tickets', '/dashboard/soporte']) {
      assert.equal(soporteAplica(p), false, p);
    }
  });

  /**
   * La hoja de cuadre (`/caja/imprimir/[id]`) se había quedado fuera de la
   * lista; la pantalla de caja del dashboard, en cambio, sí lleva soporte.
   */
  it('la hoja de cuadre no se lleva por delante la caja del dashboard', () => {
    assert.equal(soporteAplica('/dashboard/caja'), true);
    assert.equal(soporteAplica('/dashboard/caja/historial'), true);
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

describe('vigilaLlamadas', () => {
  /**
   * La página de soporte no lleva ni panel flotante ni botón porque ella misma
   * es el chat — pero es justo donde más sentido tiene ver una llamada.
   */
  it('sí en la página de soporte, aunque ahí no vaya el panel flotante', () => {
    assert.equal(vigilaLlamadas('/dashboard/soporte'), true);
  });

  it('sí donde hay soporte, no en impresión, públicas ni consola de agentes', () => {
    assert.equal(vigilaLlamadas('/dashboard/facturas/nueva'), true);
    assert.equal(vigilaLlamadas(null), true);
    for (const p of ['/caja/imprimir/258', '/pos-ticket/9', '/zero-tickets', '/pagar/abc', '/firmar/tok']) {
      assert.equal(vigilaLlamadas(p), false, p);
    }
  });
});
