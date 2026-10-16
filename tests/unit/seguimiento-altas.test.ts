/**
 * Seguimiento automático de las altas a medias: a quién se le escribe, cuándo
 * y qué se le dice. Lo que más importa es a quién NO: a los internos, a quien
 * ya recibió uno, a quien terminó, antes de 24 horas, pasados 7 días y a los
 * registros anteriores al arranque (ya se les escribió a mano).
 */

import { describe, it, expect } from 'vitest';
import {
  aQuienEscribir, correoDeSeguimiento, etapaDeAlta, nombreDePila, type Candidato,
} from '@/lib/seguimiento/altas';

const AHORA = new Date('2026-10-20T15:00:00Z');
const horasAntes = (h: number) => new Date(AHORA.getTime() - h * 3_600_000);

const base: Candidato = {
  teamId: 1, userId: 1, email: 'x@y.com', nombre: 'Jorge Bello', empresa: null,
  registro: horasAntes(30), verificado: true, paso: 1, completado: false, interno: false, yaContactado: false,
};

describe('etapa del alta', () => {
  it('sin verificar manda sobre todo lo demás', () => {
    expect(etapaDeAlta({ verificado: false, paso: 4, completado: false })).toBe('sin-verificar');
  });
  it('sin RNC, sin terminar, y nada si terminó', () => {
    expect(etapaDeAlta({ verificado: true, paso: 1, completado: false })).toBe('sin-rnc');
    expect(etapaDeAlta({ verificado: true, paso: 3, completado: false })).toBe('sin-terminar');
    expect(etapaDeAlta({ verificado: true, paso: 4, completado: false })).toBe('sin-terminar');
    expect(etapaDeAlta({ verificado: true, paso: 4, completado: true })).toBeNull();
  });
});

describe('a quién se le escribe', () => {
  const ids = (cs: Candidato[]) => aQuienEscribir(cs, AHORA).map((x) => x.candidato.teamId);

  it('a las 24 horas y dentro de los 7 días', () => {
    expect(ids([
      { ...base, teamId: 1, registro: horasAntes(30) },
      { ...base, teamId: 2, registro: horasAntes(10) },        // aún no
      { ...base, teamId: 3, registro: horasAntes(24 * 8) },    // ya pasó
    ])).toEqual([1]);
  });

  it('nunca a internos, a quien ya recibió uno ni a quien terminó', () => {
    expect(ids([
      { ...base, teamId: 1, interno: true },
      { ...base, teamId: 2, yaContactado: true },
      { ...base, teamId: 3, completado: true, paso: 4 },
      { ...base, teamId: 4 },
    ])).toEqual([4]);
  });

  it('no a los registros de antes del arranque', () => {
    const ahora = new Date('2026-10-17T15:00:00Z');
    const r = aQuienEscribir([
      { ...base, teamId: 1, registro: new Date('2026-10-15T12:00:00Z') },
      { ...base, teamId: 2, registro: new Date('2026-10-16T12:00:00Z') },
    ], ahora).map((x) => x.candidato.teamId);
    expect(r).toEqual([2]);
  });
});

describe('el correo', () => {
  const enlaces = { enlaceEntrar: 'https://app.zero.com.do/sign-in', enlaceVerificar: 'https://app.zero.com.do/api/auth/verify-email?token=abc' };

  it('sin verificar lleva el enlace nuevo', () => {
    const c = correoDeSeguimiento('sin-verificar', { nombre: 'Rogert Frias', empresa: null, ...enlaces });
    expect(c.texto).toContain(enlaces.enlaceVerificar);
    expect(c.texto.startsWith('Hola, Rogert:')).toBe(true);
    expect(c.texto).toContain('Alexander');
  });

  it('sin terminar nombra la empresa y lleva a entrar', () => {
    const c = correoDeSeguimiento('sin-terminar', { nombre: 'Jorge', empresa: 'B R24H ELECTRIC', ...enlaces });
    expect(c.asunto).toContain('B R24H ELECTRIC');
    expect(c.texto).toContain(enlaces.enlaceEntrar);
    expect(c.texto).not.toContain('verify-email');
  });

  it('no trata a nadie por el nombre de su canal', () => {
    expect(nombreDePila('Vídeos sorprendente HD')).toBeNull();
    expect(nombreDePila('ROGERT FRIAS')).toBe('Rogert');
    expect(nombreDePila('')).toBeNull();
    expect(nombreDePila('b.r24helectric')).toBeNull();
    expect(correoDeSeguimiento('sin-rnc', { nombre: null, empresa: null, ...enlaces }).texto.startsWith('Hola:')).toBe(true);
  });
});
