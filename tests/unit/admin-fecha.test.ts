import { describe, expect, it } from 'vitest';
import { fechaCorta, fechaDeDia, fechaHora, fechaRelativa } from '@/lib/admin/fecha';

/**
 * Las fechas del panel se escriben a mano para que servidor y navegador den el
 * MISMO texto (ver lib/admin/fecha.ts). Hora de República Dominicana: UTC-4.
 */

describe('fechas del panel', () => {
  it('fecha corta, en hora dominicana (no UTC)', () => {
    expect(fechaCorta('2026-05-11T20:12:00Z')).toBe('11 may 2026');
    // 02:00 UTC del 1 de noviembre todavía es 31 de octubre en RD.
    expect(fechaCorta('2026-11-01T02:00:00Z')).toBe('31 oct 2026');
  });

  it('con hora de reloj de 12 horas y espacios normales (sin el espacio fino de ICU)', () => {
    const t = fechaHora('2026-05-11T20:12:00Z');
    expect(t).toBe('11 may 2026, 4:12 p. m.');
    expect(t).not.toMatch(/[  ]/);
    expect(fechaHora('2026-05-11T13:05:00Z')).toBe('11 may 2026, 9:05 a. m.');
  });

  it('medianoche y mediodía: 12, no 0', () => {
    expect(fechaHora('2026-05-11T04:00:00Z')).toBe('11 may 2026, 12:00 a. m.');
    expect(fechaHora('2026-05-11T16:30:00Z')).toBe('11 may 2026, 12:30 p. m.');
  });

  it('un día sin hora se queda en su día, sin pasar por zonas horarias', () => {
    expect(fechaDeDia('2026-10-31')).toBe('31 oct 2026');
    expect(fechaDeDia('2026-01-01')).toBe('1 ene 2026');
    expect(fechaDeDia('')).toBe('—');
  });

  it('relativa: hoy, ayer o el día', () => {
    const ahora = new Date('2026-10-31T21:00:00Z'); // 5 p. m. del 31 en RD
    expect(fechaRelativa('2026-10-31T13:40:00Z', ahora)).toBe('hoy 9:40 a. m.');
    expect(fechaRelativa('2026-10-30T20:15:00Z', ahora)).toBe('ayer 4:15 p. m.');
    expect(fechaRelativa('2026-10-28T15:00:00Z', ahora)).toBe('28 oct');
  });

  it('lo ilegible no rompe la pantalla', () => {
    for (const f of [fechaCorta, fechaHora, fechaRelativa]) expect(f('no es una fecha')).toBe('—');
  });
});
