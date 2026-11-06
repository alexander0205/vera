/**
 * Un borrador (p. ej. nota de débito por mora) no se emite dos veces ante la DGII.
 * Puras: sin DB ni navegador, más una revisión del cableado en las rutas.
 */
import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bloqueoEmitirConBorrador, bloqueoDocumentoYaEmitido, bloqueoMoraYaEmitida,
} from '@/lib/facturas/promover-borrador';

describe('emitir con borradorId', () => {
  test('modo emitir con borradorId se bloquea (409): crearía un duplicado', () => {
    const b = bloqueoEmitirConBorrador({ modo: 'emitir', borradorId: 12 });
    assert.equal(b?.status, 409);
    assert.match(b!.error, /duplicado/);
  });
  test('guardar el borrador o emitir uno nuevo siguen permitidos', () => {
    assert.equal(bloqueoEmitirConBorrador({ modo: 'borrador', borradorId: 12 }), null);
    assert.equal(bloqueoEmitirConBorrador({ modo: 'emitir', borradorId: null }), null);
    assert.equal(bloqueoEmitirConBorrador({ modo: 'emitir' }), null);
  });
});

describe('documento ya emitido', () => {
  test('procesados y anulados dan 409', () => {
    for (const e of ['EN_PROCESO', 'ACEPTADO', 'ACEPTADO_CONDICIONAL', 'RECHAZADO', 'ANULADO']) {
      assert.equal(bloqueoDocumentoYaEmitido(e)?.status, 409, e);
    }
  });
  test('borrador e histórica se pueden emitir', () => {
    assert.equal(bloqueoDocumentoYaEmitido('BORRADOR'), null);
    assert.equal(bloqueoDocumentoYaEmitido('HISTORICA'), null);
  });
});

describe('mora ya emitida', () => {
  const base = { docId: 5, moraOrigenId: 1, moraPeriodo: '2026-11-01' };
  test('otra nota emitida del mismo período bloquea', () => {
    const b = bloqueoMoraYaEmitida({ ...base, hermanas: [
      { id: 5, estado: 'BORRADOR', moraPeriodo: '2026-11-01' },
      { id: 9, estado: 'ACEPTADO', moraPeriodo: '2026-11-01' },
    ] });
    assert.equal(b?.status, 409);
    assert.match(b!.error, /#9/);
  });
  test('otro período, anuladas, borradores o el mismo documento no bloquean', () => {
    assert.equal(bloqueoMoraYaEmitida({ ...base, hermanas: [
      { id: 9, estado: 'ACEPTADO', moraPeriodo: '2026-10-01' },
      { id: 10, estado: 'ANULADO', moraPeriodo: '2026-11-01' },
      { id: 11, estado: 'BORRADOR', moraPeriodo: '2026-11-01' },
      { id: 5, estado: 'ACEPTADO', moraPeriodo: '2026-11-01' },
    ] }), null);
  });
  test('un documento que no es nota de mora no se revisa', () => {
    assert.equal(bloqueoMoraYaEmitida({ docId: 5, moraOrigenId: null, moraPeriodo: null, hermanas: [
      { id: 9, estado: 'ACEPTADO', moraPeriodo: null },
    ] }), null);
  });
});

describe('cableado', () => {
  const leer = (p: string) => readFileSync(p, 'utf8');
  test('/api/ecf/emitir rechaza modo emitir con borradorId', () => {
    assert.match(leer('app/api/ecf/emitir/route.ts'), /bloqueoEmitirConBorrador\(/);
  });
  test('emitir-ecf aplica ambas protecciones', () => {
    const s = leer('app/api/facturas/[id]/emitir-ecf/route.ts');
    assert.match(s, /bloqueoDocumentoYaEmitido\(/);
    assert.match(s, /bloqueoMoraYaEmitida\(/);
  });
  test('el formulario promueve el borrador editado por emitir-ecf, no por /api/ecf/emitir', () => {
    const s = leer('app/(dashboard)/dashboard/facturas/nueva/NuevaFacturaForm.tsx');
    assert.match(s, /modoEfectivo === 'emitir' && initialData\?\.id/);
    assert.match(s, /buildPayload\('borrador'\)/);
  });
});
