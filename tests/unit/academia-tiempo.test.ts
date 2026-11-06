import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  enlaceVideo, formatearTiempo, lineasATexto, MAX_SEGUNDOS, parsearLineasConTiempo, parsearTiempo, segundosDeParametro,
} from '@/lib/academia/tiempo';

describe('formatearTiempo / parsearTiempo', () => {
  it('formatea minutos y horas', () => {
    assert.equal(formatearTiempo(0), '0:00');
    assert.equal(formatearTiempo(83), '1:23');
    assert.equal(formatearTiempo(3725), '1:02:05');
    assert.equal(formatearTiempo(-5), '0:00');
    assert.equal(formatearTiempo(Number.NaN), '0:00');
  });
  it('lee los mismos formatos de vuelta', () => {
    assert.equal(parsearTiempo('1:23'), 83);
    assert.equal(parsearTiempo('1:02:05'), 3725);
    assert.equal(parsearTiempo('83'), 83);
  });
  it('rechaza lo que no es un tiempo', () => {
    for (const malo of ['', 'abc', '1:75', '1:2:3:4', '-3', '99999:00']) assert.equal(parsearTiempo(malo), null, malo);
  });
});

describe('enlaceVideo y ?t=', () => {
  it('arma el enlace al minuto exacto', () => {
    assert.equal(enlaceVideo('cobrar-una-cuenta', 83), '/academia/cobrar-una-cuenta?t=83');
  });
  it('sin segundos (o con 0) va sin ?t=', () => {
    assert.equal(enlaceVideo('cobrar-una-cuenta'), '/academia/cobrar-una-cuenta');
    assert.equal(enlaceVideo('cobrar-una-cuenta', 0), '/academia/cobrar-una-cuenta');
  });
  it('redondea hacia abajo y descarta valores absurdos', () => {
    assert.equal(enlaceVideo('x', 12.9), '/academia/x?t=12');
    assert.equal(enlaceVideo('x', -4), '/academia/x');
    assert.equal(enlaceVideo('x', MAX_SEGUNDOS + 1), '/academia/x');
    assert.equal(enlaceVideo('x', Number.NaN), '/academia/x');
  });
  it('escapa el slug', () => {
    assert.equal(enlaceVideo('a/b?c', 5), '/academia/a%2Fb%3Fc?t=5');
  });
  it('lee ?t= de la dirección con cuidado', () => {
    assert.equal(segundosDeParametro('83'), 83);
    assert.equal(segundosDeParametro(['40', '90']), 40);
    for (const malo of [undefined, null, '', '-1', '1.5', 'abc', '99999999', String(MAX_SEGUNDOS + 1)]) {
      assert.equal(segundosDeParametro(malo), 0, String(malo));
    }
  });
});

describe('parsearLineasConTiempo', () => {
  it('lee una línea por tramo en varios formatos', () => {
    const r = parsearLineasConTiempo('0:00 Hola\n[0:45] Segunda parte\n(1:05) - Tercera\n2:00: Cuarta');
    assert.deepEqual(r, [
      { t: 0, texto: 'Hola' }, { t: 45, texto: 'Segunda parte' }, { t: 65, texto: 'Tercera' }, { t: 120, texto: 'Cuarta' },
    ]);
  });
  it('una línea sin tiempo continúa la anterior', () => {
    assert.deepEqual(parsearLineasConTiempo('0:10 Primero entras\na la lista\n0:30 Luego'), [
      { t: 10, texto: 'Primero entras a la lista' }, { t: 30, texto: 'Luego' },
    ]);
  });
  it('ordena por tiempo, ignora líneas vacías y texto suelto del principio', () => {
    assert.deepEqual(parsearLineasConTiempo('texto sin tiempo\n\n1:00 B\n0:20 A'), [
      { t: 20, texto: 'A' }, { t: 60, texto: 'B' },
    ]);
  });
  it('va y vuelve con lineasATexto', () => {
    const lineas = [{ t: 5, texto: 'Uno' }, { t: 3725, texto: 'Dos' }];
    assert.deepEqual(parsearLineasConTiempo(lineasATexto(lineas)), lineas);
    assert.equal(lineasATexto([{ t: 65, titulo: 'Capítulo' }]), '1:05 Capítulo');
  });
  it('un tiempo solo en su línea abre un tramo y lo siguiente es su texto', () => {
    assert.deepEqual(parsearLineasConTiempo('0:10\nPrimero entras\na la lista\n0:30\nLuego'), [
      { t: 10, texto: 'Primero entras a la lista' }, { t: 30, texto: 'Luego' },
    ]);
  });
  it('un tiempo solo, sin nada después, no deja un tramo vacío ni pega lo anterior', () => {
    assert.deepEqual(parsearLineasConTiempo('0:10 Uno\n0:20\n0:30 Tres'), [
      { t: 10, texto: 'Uno' }, { t: 30, texto: 'Tres' },
    ]);
  });
  it('«10:30 am …» no es una marca de tiempo', () => {
    assert.deepEqual(parsearLineasConTiempo('0:10 Reunión\n10:30 am llega el cliente\n0:40 Fin'), [
      { t: 10, texto: 'Reunión 10:30 am llega el cliente' }, { t: 40, texto: 'Fin' },
    ]);
    assert.deepEqual(parsearLineasConTiempo('0:05 Hola\n3:15 p. m. se cierra'), [{ t: 5, texto: 'Hola 3:15 p. m. se cierra' }]);
  });
  it('pero «1:05 amigos» sí es una marca con texto', () => {
    assert.deepEqual(parsearLineasConTiempo('1:05 amigos, empecemos'), [{ t: 65, texto: 'amigos, empecemos' }]);
  });
});
