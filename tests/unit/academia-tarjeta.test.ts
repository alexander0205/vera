import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  debeMostrarTarjeta, ESTADO_NUEVO, sinFiltros, esAccionTarjeta, MAX_VECES, proximaMedianocheRd, siguienteEstado,
  type EstadoTarjeta,
} from '@/lib/academia/tarjeta';

// 10:00 en República Dominicana (UTC-4) del 5 de noviembre.
const AHORA = new Date('2026-11-05T14:00:00Z');
const base = { hayVideo: true, todoVisto: false, ahora: AHORA };

describe('proximaMedianocheRd', () => {
  it('es la medianoche de RD, no la de UTC', () => {
    assert.equal(proximaMedianocheRd(AHORA).toISOString(), '2026-11-06T04:00:00.000Z');
  });
  it('a las 23:30 de RD (03:30Z del día siguiente en UTC) sigue siendo esa misma medianoche', () => {
    assert.equal(proximaMedianocheRd(new Date('2026-11-06T03:30:00Z')).toISOString(), '2026-11-06T04:00:00.000Z');
  });
  it('justo en la medianoche pasa al día siguiente', () => {
    assert.equal(proximaMedianocheRd(new Date('2026-11-06T04:00:00Z')).toISOString(), '2026-11-07T04:00:00.000Z');
  });
});

describe('debeMostrarTarjeta', () => {
  it('una persona nueva ve la tarjeta si hay video', () => {
    assert.equal(debeMostrarTarjeta({ ...base, estado: null }), true);
  });
  it('sin video publicado no sale nada', () => {
    assert.equal(debeMostrarTarjeta({ ...base, estado: null, hayVideo: false }), false);
  });
  it('si ya vio todos los videos, no sale', () => {
    assert.equal(debeMostrarTarjeta({ ...base, estado: null, todoVisto: true }), false);
  });
  it('«No mostrar más» la quita para siempre', () => {
    assert.equal(debeMostrarTarjeta({ ...base, estado: { ...ESTADO_NUEVO, nunca: true } }), false);
  });
  it('«Ahora no» la esconde hasta la fecha y después vuelve', () => {
    const e: EstadoTarjeta = { ...ESTADO_NUEVO, ocultaHasta: new Date('2026-11-06T04:00:00Z') };
    assert.equal(debeMostrarTarjeta({ ...base, estado: e }), false);
    assert.equal(debeMostrarTarjeta({ ...base, estado: e, ahora: new Date('2026-11-06T04:00:01Z') }), true);
  });
  it('sale en pocos días distintos, no para siempre', () => {
    assert.equal(debeMostrarTarjeta({ ...base, estado: { ...ESTADO_NUEVO, vecesMostrada: MAX_VECES - 1 } }), true);
    assert.equal(debeMostrarTarjeta({ ...base, estado: { ...ESTADO_NUEVO, vecesMostrada: MAX_VECES } }), false);
  });
  it('como mucho una vez por día: si ya salió hoy, no vuelve a salir en otra carga', () => {
    const salioHoy: EstadoTarjeta = { ...ESTADO_NUEVO, vecesMostrada: 1, mostradaEn: new Date('2026-11-05T12:00:00Z') };
    assert.equal(debeMostrarTarjeta({ ...base, estado: salioHoy }), false);
    // Al día siguiente (RD) sí.
    assert.equal(debeMostrarTarjeta({ ...base, estado: salioHoy, ahora: new Date('2026-11-06T14:00:00Z') }), true);
  });
  it('el «hoy» es el de RD: salió a las 23:00 de RD y a las 00:30 ya es otro día', () => {
    const salio: EstadoTarjeta = { ...ESTADO_NUEVO, vecesMostrada: 1, mostradaEn: new Date('2026-11-06T03:00:00Z') };
    assert.equal(debeMostrarTarjeta({ ...base, estado: salio, ahora: new Date('2026-11-06T03:59:00Z') }), false);
    assert.equal(debeMostrarTarjeta({ ...base, estado: salio, ahora: new Date('2026-11-06T04:30:00Z') }), true);
  });
});

describe('sinFiltros (la tarjeta del estado vacío de Facturas)', () => {
  it('vacíos todos: es la primera vez', () => {
    assert.equal(sinFiltros({}), true);
    assert.equal(sinFiltros({ q: '', estado: '', fecha_desde: '', conNcs: '', m_3: '' }), true);
    assert.equal(sinFiltros({ q: '   ' }), true);
  });
  it('cualquier filtro puesto la apaga, no solo la búsqueda', () => {
    for (const k of ['q', 'estado', 'fecha_desde', 'fecha_hasta', 'conNcs', 'm_7']) {
      assert.equal(sinFiltros({ q: '', [k]: 'x' }), false, k);
    }
  });
});

describe('siguienteEstado', () => {
  it('«ahora no» fija la medianoche de RD', () => {
    const e = siguienteEstado(null, 'ahora_no', AHORA);
    assert.equal(e.ocultaHasta?.toISOString(), '2026-11-06T04:00:00.000Z');
    assert.equal(e.nunca, false);
  });
  it('«nunca» y «deshacer» se anulan', () => {
    const n = siguienteEstado(siguienteEstado(null, 'ahora_no', AHORA), 'nunca', AHORA);
    assert.equal(n.nunca, true);
    const d = siguienteEstado(n, 'deshacer', AHORA);
    assert.deepEqual([d.nunca, d.ocultaHasta], [false, null]);
  });
  it('«mostrada» cuenta una sola vez por día', () => {
    const a = siguienteEstado(null, 'mostrada', AHORA);
    assert.equal(a.vecesMostrada, 1);
    assert.equal(a.mostradaEn?.toISOString(), AHORA.toISOString());
    const mismoDia = siguienteEstado(a, 'mostrada', new Date('2026-11-05T20:00:00Z'));
    assert.equal(mismoDia.vecesMostrada, 1);
    const otroDia = siguienteEstado(a, 'mostrada', new Date('2026-11-06T14:00:00Z'));
    assert.equal(otroDia.vecesMostrada, 2);
  });
  it('descartar y «Deshacer» no rompen el conteo ni la hora en que salió', () => {
    const a = siguienteEstado(null, 'mostrada', AHORA);
    const d = siguienteEstado(siguienteEstado(a, 'ahora_no', AHORA), 'deshacer', AHORA);
    assert.equal(d.vecesMostrada, 1);
    assert.equal(d.mostradaEn?.toISOString(), AHORA.toISOString());
    assert.equal(siguienteEstado(d, 'mostrada', new Date('2026-11-05T22:00:00Z')).vecesMostrada, 1);
  });
  it('no modifica el estado que recibe', () => {
    const antes: EstadoTarjeta = { ...ESTADO_NUEVO };
    siguienteEstado(antes, 'nunca', AHORA);
    assert.equal(antes.nunca, false);
  });
  it('esAccionTarjeta solo acepta las acciones conocidas', () => {
    assert.equal(esAccionTarjeta('nunca'), true);
    assert.equal(esAccionTarjeta('borrar'), false);
    assert.equal(esAccionTarjeta(undefined), false);
  });
});
