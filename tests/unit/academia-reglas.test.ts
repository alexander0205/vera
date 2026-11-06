import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  esChoqueUnico, filtrarVisibles, puedeAdministrarAcademia, puedeVerVideo, slugDe, validarEntradaVideo,
} from '@/lib/academia/reglas';
import { PANTALLAS } from '@/lib/config/pantallas';

describe('permisos de la Academia', () => {
  const admin = { platformRole: 'admin' };
  const miembro = { platformRole: 'member' };

  it('solo el administrador de la plataforma administra', () => {
    assert.equal(puedeAdministrarAcademia(admin), true);
    assert.equal(puedeAdministrarAcademia(miembro), false);
    assert.equal(puedeAdministrarAcademia(null), false);
    assert.equal(puedeAdministrarAcademia({}), false);
  });
  it('sin sesión no se ve nada', () => {
    assert.equal(puedeVerVideo({ publicado: true }, null), false);
  });
  it('cualquier persona con sesión ve los publicados; los borradores, solo el admin', () => {
    assert.equal(puedeVerVideo({ publicado: true }, miembro), true);
    assert.equal(puedeVerVideo({ publicado: false }, miembro), false);
    assert.equal(puedeVerVideo({ publicado: false }, admin), true);
  });
  it('filtrarVisibles quita los borradores a quien no administra', () => {
    const lista = [{ publicado: true, n: 1 }, { publicado: false, n: 2 }];
    assert.deepEqual(filtrarVisibles(lista, miembro).map((x) => x.n), [1]);
    assert.deepEqual(filtrarVisibles(lista, admin).map((x) => x.n), [1, 2]);
  });
});

describe('slugDe', () => {
  it('quita tildes y signos', () => {
    assert.equal(slugDe('¿Cómo cobro una cuenta?'), 'como-cobro-una-cuenta');
    assert.equal(slugDe('  --Hola  Mundo-- '), 'hola-mundo');
  });
  it('un título sin letras da slug vacío', () => {
    assert.equal(slugDe('¿¿??'), '');
  });
});

describe('validarEntradaVideo', () => {
  const buena = { titulo: 'Cobrar una cuenta', modulo: 'facturacion', pantalla: 'fact-cxc', duracionSeg: 185, enlaceVimeo: 'https://vimeo.com/123456789/abcdef1234' };

  it('acepta un video completo y arma el slug del título', () => {
    const r = validarEntradaVideo({ ...buena, capitulos: '0:00 Inicio\n1:00 Abono', transcripcion: '0:05 Hola' });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.valor.slug, 'cobrar-una-cuenta');
      assert.deepEqual(r.valor.capitulos, [{ t: 0, titulo: 'Inicio' }, { t: 60, titulo: 'Abono' }]);
      assert.deepEqual(r.valor.transcripcion, [{ t: 5, texto: 'Hola' }]);
      assert.equal(r.valor.publicado, false);
    }
  });
  it('toda pantalla ofrecida en el selector es válida', () => {
    for (const p of PANTALLAS) assert.ok(validarEntradaVideo({ ...buena, pantalla: p.id }).ok, p.id);
  });
  it('rechaza pantalla o módulo desconocidos', () => {
    assert.equal(validarEntradaVideo({ ...buena, pantalla: 'no-existe' }).ok, false);
    assert.equal(validarEntradaVideo({ ...buena, modulo: 'otro' }).ok, false);
  });
  it('pantalla vacía significa «ninguna»', () => {
    const r = validarEntradaVideo({ ...buena, pantalla: '' });
    assert.ok(r.ok && r.valor.pantalla === null);
  });
  it('pide título', () => {
    assert.equal(validarEntradaVideo({ ...buena, titulo: ' a ' }).ok, false);
    assert.equal(validarEntradaVideo(null).ok, false);
  });
  it('saca el id y el hash del enlace de Vimeo y lo exige', () => {
    const r = validarEntradaVideo(buena);
    assert.ok(r.ok && r.valor.vimeoId === '123456789' && r.valor.vimeoHash === 'abcdef1234');
    const publico = validarEntradaVideo({ ...buena, enlaceVimeo: 'vimeo.com/987654' });
    assert.ok(publico.ok && publico.valor.vimeoId === '987654' && publico.valor.vimeoHash === null);
    assert.equal(validarEntradaVideo({ ...buena, enlaceVimeo: '' }).ok, false);
    assert.equal(validarEntradaVideo({ ...buena, enlaceVimeo: 'https://example.com/123456789' }).ok, false);
    assert.equal(validarEntradaVideo({ ...buena, enlaceVimeo: undefined }).ok, false);
    assert.equal(validarEntradaVideo({ ...buena, publicado: true }).ok, true);
  });
  it('la miniatura propia es opcional y solo https', () => {
    const sin = validarEntradaVideo(buena);
    assert.ok(sin.ok && sin.valor.miniaturaUrl === null);
    const con = validarEntradaVideo({ ...buena, miniaturaUrl: 'https://cdn.example.com/a.png' });
    assert.ok(con.ok && con.valor.miniaturaUrl === 'https://cdn.example.com/a.png');
    assert.equal(validarEntradaVideo({ ...buena, miniaturaUrl: 'http://x.com/a.png' }).ok, false);
    assert.equal(validarEntradaVideo({ ...buena, miniaturaUrl: 'javascript:alert(1)' }).ok, false);
  });
  it('rechaza duración u orden absurdos', () => {
    assert.equal(validarEntradaVideo({ ...buena, duracionSeg: -1 }).ok, false);
    assert.equal(validarEntradaVideo({ ...buena, duracionSeg: 99 * 3600 }).ok, false);
    assert.equal(validarEntradaVideo({ ...buena, orden: 1.5 }).ok, false);
  });
});

describe('errores de unicidad', () => {
  it('esChoqueUnico reconoce el 23505 directo o dentro de `cause`', () => {
    assert.equal(esChoqueUnico({ code: '23505' }), true);
    assert.equal(esChoqueUnico({ cause: { code: '23505' } }), true);
    assert.equal(esChoqueUnico({ code: '23503' }), false);
    assert.equal(esChoqueUnico(new Error('otra cosa')), false);
    assert.equal(esChoqueUnico(null), false);
  });
});
