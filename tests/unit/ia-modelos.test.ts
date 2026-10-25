import { describe, it, expect } from 'vitest';
import {
  MODELOS_IA, elegirModelos, explicarErrorIa, idDirecto, usosIa, validarAjusteModelos,
} from '@/lib/ia/modelos';

describe('qué modelo usa cada parte de Zero', () => {
  it('sin nada guardado van los de fábrica, los mismos que había en código', () => {
    expect(elegirModelos(null, 'asistente')).toEqual({ principal: 'google/gemini-2.5-flash', respaldo: 'google/gemini-2.5-flash-lite' });
    expect(elegirModelos(null, 'plantillas')).toEqual({ principal: 'google/gemini-2.5-flash', respaldo: 'google/gemini-2.5-flash-lite' });
    expect(elegirModelos(null, 'captura')).toEqual({ principal: 'google/gemini-2.5-flash-lite', respaldo: 'google/gemini-2.5-flash' });
  });

  it('la variable de entorno de antes sigue mandando mientras nadie escoja otro', () => {
    expect(elegirModelos(null, 'asistente', { ASISTENTE_IA_MODELO: 'anthropic/claude-haiku-5.5' }).principal).toBe('anthropic/claude-haiku-5.5');
  });

  it('lo escogido en /admin/ia gana a la fábrica', () => {
    const g = { asistente: { principal: 'anthropic/claude-sonnet-5.5', respaldo: 'google/gemini-2.5-flash' } };
    expect(elegirModelos(g, 'asistente')).toEqual(g.asistente);
    // Las otras partes no se tocan.
    expect(elegirModelos(g, 'captura').principal).toBe('google/gemini-2.5-flash-lite');
  });

  it('un id que no está en el catálogo no deja a Zero sin IA: vuelve el de fábrica', () => {
    const g = { asistente: { principal: 'openai/gpt-borrado', respaldo: 42 as unknown as string } };
    expect(elegirModelos(g, 'asistente')).toEqual(usosIa().find((u) => u.uso === 'asistente') && {
      principal: 'google/gemini-2.5-flash', respaldo: 'google/gemini-2.5-flash-lite',
    });
  });
});

describe('lo que manda la página de /admin', () => {
  it('acepta modelos del catálogo', () => {
    const r = validarAjusteModelos({ asistente: { principal: 'anthropic/claude-sonnet-5.5', respaldo: 'google/gemini-2.5-flash' } });
    expect(r).toEqual({ ok: true, valor: { asistente: { principal: 'anthropic/claude-sonnet-5.5', respaldo: 'google/gemini-2.5-flash' } } });
  });

  it('rechaza un modelo inventado, una parte que no existe y basura', () => {
    expect(validarAjusteModelos({ asistente: { principal: 'x/y', respaldo: 'google/gemini-2.5-flash' } }).ok).toBe(false);
    expect(validarAjusteModelos({ nomina: { principal: 'google/gemini-2.5-flash', respaldo: 'google/gemini-2.5-flash' } }).ok).toBe(false);
    expect(validarAjusteModelos(null).ok).toBe(false);
    expect(validarAjusteModelos([]).ok).toBe(false);
  });

  it('no deja colar campos de más dentro de lo guardado', () => {
    const r = validarAjusteModelos({ captura: { principal: 'google/gemini-2.5-flash', respaldo: 'google/gemini-2.5-flash-lite', extra: 'x' } });
    expect(r.ok && r.valor.captura).toEqual({ principal: 'google/gemini-2.5-flash', respaldo: 'google/gemini-2.5-flash-lite' });
  });
});

describe('hablarle al proveedor sin el gateway', () => {
  it('Anthropic escribe la versión con guion; Google, igual que el gateway', () => {
    expect(idDirecto('anthropic/claude-sonnet-5.5')).toEqual({ proveedor: 'anthropic', modelo: 'claude-sonnet-5-5' });
    expect(idDirecto('google/gemini-2.5-flash')).toEqual({ proveedor: 'google', modelo: 'gemini-2.5-flash' });
    expect(idDirecto('alibaba/qwen')).toBeNull();
    expect(idDirecto('sinproveedor')).toBeNull();
  });

  it('todo el catálogo es de un proveedor al que se puede llamar directo', () => {
    for (const m of MODELOS_IA) expect(idDirecto(m.id)).not.toBeNull();
  });
});

describe('el error contado para el administrador', () => {
  it('el 403 del plan gratuito dice qué hacer', () => {
    const e = { statusCode: 403, message: 'Free tier users do not have access to this model. Upgrade to paid credits…' };
    expect(explicarErrorIa(e)).toContain('créditos pagados');
  });
  it('cuota agotada y llave mala', () => {
    expect(explicarErrorIa({ statusCode: 429 })).toContain('cuota');
    expect(explicarErrorIa({ statusCode: 401 })).toContain('llave');
  });
});
