import { describe, it, expect } from 'vitest';
import {
  avisosDependientes, contarAdicionalesVigentes, edadEnFecha,
  tipoSegunTSS, validarDependiente, vigenteEnRango, type DependienteBase,
} from '@/lib/nomina/dependientes';
import { esFechaYMD, rangoDelMes } from '@/lib/nomina/periodos';

const dep = (o: Partial<DependienteBase> = {}): DependienteBase => ({
  nombre: 'Luis', parentesco: 'hijo', fechaNacimiento: '2010-05-20', estudiante: false,
  tipo: 'directo', desde: '2026-01-01', hasta: null, ...o,
});

describe('edadEnFecha', () => {
  it('cumple años el día exacto, no antes', () => {
    expect(edadEnFecha('2008-09-13', '2026-09-12')).toBe(17);
    expect(edadEnFecha('2008-09-13', '2026-09-13')).toBe(18);
  });
  it('29 de febrero cumple el 1 de marzo en años no bisiestos', () => {
    expect(edadEnFecha('2008-02-29', '2026-02-28')).toBe(17);
    expect(edadEnFecha('2008-02-29', '2026-03-01')).toBe(18);
  });
});

describe('tipoSegunTSS', () => {
  const hoy = '2026-09-13';
  it('cónyuge siempre directo; padres y suegros siempre adicionales', () => {
    expect(tipoSegunTSS(dep({ parentesco: 'conyuge', fechaNacimiento: null }), hoy)).toBe('directo');
    expect(tipoSegunTSS(dep({ parentesco: 'padre_madre', fechaNacimiento: null }), hoy)).toBe('adicional');
    expect(tipoSegunTSS(dep({ parentesco: 'suegro_suegra', fechaNacimiento: null }), hoy)).toBe('adicional');
  });
  it('hijo menor de 18: directo', () => {
    expect(tipoSegunTSS(dep({ fechaNacimiento: '2009-01-01' }), hoy)).toBe('directo');
  });
  it('hijo de 18 a 20: directo solo si estudia', () => {
    expect(tipoSegunTSS(dep({ fechaNacimiento: '2007-01-01', estudiante: true }), hoy)).toBe('directo');
    expect(tipoSegunTSS(dep({ fechaNacimiento: '2007-01-01', estudiante: false }), hoy)).toBe('adicional');
  });
  it('hijastro de 21 o más: adicional aunque estudie', () => {
    expect(tipoSegunTSS(dep({ parentesco: 'hijastro', fechaNacimiento: '2005-01-01', estudiante: true }), hoy)).toBe('adicional');
  });
  it('hijo sin fecha de nacimiento: no se adivina', () => {
    expect(tipoSegunTSS(dep({ fechaNacimiento: null }), hoy)).toBeNull();
  });
});

describe('vigencia y conteo', () => {
  it('vigenteEnRango es inclusivo en los dos extremos', () => {
    expect(vigenteEnRango({ desde: '2026-09-30', hasta: null }, '2026-09-01', '2026-09-30')).toBe(true);
    expect(vigenteEnRango({ desde: '2026-01-01', hasta: '2026-09-01' }, '2026-09-01', '2026-09-30')).toBe(true);
    expect(vigenteEnRango({ desde: '2026-01-01', hasta: '2026-08-31' }, '2026-09-01', '2026-09-30')).toBe(false);
    expect(vigenteEnRango({ desde: '2026-10-01', hasta: null }, '2026-09-01', '2026-09-30')).toBe(false);
  });

  it('solo cuenta los adicionales vigentes en el mes', () => {
    const deps = [
      dep({ tipo: 'adicional' }),
      dep({ tipo: 'adicional', hasta: '2026-08-15' }),
      dep({ tipo: 'directo' }),
      dep({ tipo: 'adicional', desde: '2026-09-20' }),
    ];
    const { inicio, fin } = rangoDelMes('2026-09');
    expect(contarAdicionalesVigentes(deps, inicio, fin)).toBe(2);
  });

  it('rangoDelMes conoce febrero bisiesto', () => {
    expect(rangoDelMes('2028-02')).toEqual({ inicio: '2028-02-01', fin: '2028-02-29' });
    expect(rangoDelMes('2026-02')).toEqual({ inicio: '2026-02-01', fin: '2026-02-28' });
  });
});

describe('avisosDependientes', () => {
  const hoy = '2026-09-13';
  it('avisa del hijo que cumplió 18 sin estudiar y sigue como directo', () => {
    const avisos = avisosDependientes([dep({ nombre: 'Ana', fechaNacimiento: '2008-01-10' })], hoy);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('Ana');
    expect(avisos[0]).toContain('adicional');
  });
  it('avisa del que paga como adicional pudiendo ser directo', () => {
    const avisos = avisosDependientes([dep({ nombre: 'Beto', tipo: 'adicional', fechaNacimiento: '2015-01-01' })], hoy);
    expect(avisos[0]).toContain('directo');
  });
  it('pide la fecha de nacimiento del hijo que no la tiene', () => {
    expect(avisosDependientes([dep({ fechaNacimiento: null })], hoy)[0]).toContain('fecha de nacimiento');
  });
  it('no avisa de quien ya está de baja ni de un registro correcto', () => {
    expect(avisosDependientes([
      dep({ fechaNacimiento: '2000-01-01', hasta: '2026-01-31' }),
      dep({ parentesco: 'padre_madre', tipo: 'adicional', fechaNacimiento: null }),
    ], hoy)).toEqual([]);
  });
});

describe('validarDependiente', () => {
  const ok = { nombre: ' Rosa Díaz ', parentesco: 'padre_madre', tipo: 'adicional', desde: '2026-09-01' };

  it('limpia y acepta lo mínimo', () => {
    const r = validarDependiente({ ...ok, cedula: '001-1234567-8' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.nombre).toBe('Rosa Díaz');
      expect(r.datos.cedula).toBe('00112345678');
      expect(r.datos.hasta).toBeNull();
      expect(r.datos.fechaNacimiento).toBeNull();
    }
  });

  it('rechaza lo que falta o no existe', () => {
    expect(validarDependiente({ ...ok, nombre: '' })).toMatchObject({ ok: false });
    expect(validarDependiente({ ...ok, parentesco: 'primo' })).toMatchObject({ ok: false });
    expect(validarDependiente({ ...ok, tipo: 'otro' })).toMatchObject({ ok: false });
    expect(validarDependiente({ ...ok, desde: '2026-02-30' })).toMatchObject({ ok: false });
    expect(validarDependiente({ ...ok, cedula: '123' })).toMatchObject({ ok: false });
  });

  it('la baja no puede ser antes del alta', () => {
    expect(validarDependiente({ ...ok, hasta: '2026-08-31' })).toMatchObject({ ok: false, error: 'La baja no puede ser antes del alta' });
    expect(validarDependiente({ ...ok, hasta: '2026-09-01' })).toMatchObject({ ok: true });
  });

  it('esFechaYMD valida el calendario, no solo el formato', () => {
    expect(esFechaYMD('2028-02-29')).toBe(true);
    expect(esFechaYMD('2026-02-29')).toBe(false);
    expect(esFechaYMD('2026-9-1')).toBe(false);
    expect(esFechaYMD(20260901)).toBe(false);
  });
});
