import { describe, it, expect } from 'vitest';
import { corridasDelDia, esDiaDePago, type ConfigProgramacion } from '@/lib/nomina/programacion';

const base: ConfigProgramacion = {
  activa: true,
  mensualActiva: true,
  mensualDia: 30,
  quincenalActiva: false,
  quincenalDia1: 15,
  quincenalDia2: 30,
};

describe('esDiaDePago', () => {
  it('coincide en el día exacto', () => {
    expect(esDiaDePago('2026-08-30', 30)).toBe(true);
    expect(esDiaDePago('2026-08-29', 30)).toBe(false);
  });

  it('ajusta al último día del mes cuando el día configurado no existe', () => {
    // Febrero 2026 tiene 28 días: "pagar el 30" cae el 28.
    expect(esDiaDePago('2026-02-28', 30)).toBe(true);
    expect(esDiaDePago('2026-02-27', 30)).toBe(false);
    // Abril tiene 30: "pagar el 31" cae el 30.
    expect(esDiaDePago('2026-04-30', 31)).toBe(true);
  });

  it('días inválidos nunca disparan', () => {
    expect(esDiaDePago('2026-08-01', 0)).toBe(false);
    expect(esDiaDePago('2026-08-01', -5)).toBe(false);
  });
});

describe('corridasDelDia', () => {
  it('programación apagada no genera nada', () => {
    expect(corridasDelDia({ ...base, activa: false }, '2026-08-30')).toEqual([]);
  });

  it('genera la mensual el día de pago', () => {
    const r = corridasDelDia(base, '2026-08-30');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: 'mensual', periodo: '2026-08', frecuenciaEmpleado: 'mensual' });
    expect(r[0].descripcion).toContain('Agosto 2026');
  });

  it('no genera la mensual en un día cualquiera', () => {
    expect(corridasDelDia(base, '2026-08-12')).toEqual([]);
  });

  it('genera quincenal-1 y quincenal-2 en sus días', () => {
    const cfg = { ...base, mensualActiva: false, quincenalActiva: true, quincenalDia1: 15, quincenalDia2: 30 };
    expect(corridasDelDia(cfg, '2026-08-15')).toEqual([
      expect.objectContaining({ tipo: 'quincenal-1', frecuenciaEmpleado: 'quincenal' }),
    ]);
    expect(corridasDelDia(cfg, '2026-08-30')).toEqual([
      expect.objectContaining({ tipo: 'quincenal-2', frecuenciaEmpleado: 'quincenal' }),
    ]);
  });

  it('mensual y quincenal el mismo día devuelven ambas', () => {
    const cfg = { ...base, mensualActiva: true, mensualDia: 30, quincenalActiva: true, quincenalDia1: 15, quincenalDia2: 30 };
    const r = corridasDelDia(cfg, '2026-08-30');
    expect(r.map((c) => c.tipo).sort()).toEqual(['mensual', 'quincenal-2']);
  });

  it('no duplica la 2da quincena si ambos días quincenales coinciden', () => {
    const cfg = { ...base, mensualActiva: false, quincenalActiva: true, quincenalDia1: 30, quincenalDia2: 30 };
    const r = corridasDelDia(cfg, '2026-08-30');
    expect(r).toHaveLength(1);
    expect(r[0].tipo).toBe('quincenal-1');
  });
});
