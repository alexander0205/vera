/**
 * El número al que sale un WhatsApp. Un dígito de menos no puede convertirse
 * en otro número: el 23-10 «+1823596602» salía como 11823596602 y la pantalla
 * de prueba decía «Enviado».
 */
import { describe, expect, it } from 'vitest';
import { aE164 } from '@/lib/whatsapp/telefono';

describe('aE164', () => {
  it('acepta los formatos de siempre del mismo número', () => {
    expect(aE164('+1 829 359 6602')).toBe('18293596602');
    expect(aE164('(829) 359-6602')).toBe('18293596602');
    expect(aE164('8293596602')).toBe('18293596602');
    expect(aE164('18293596602')).toBe('18293596602');
  });

  it('rechaza un número NANP al que le falta o le sobra un dígito', () => {
    expect(aE164('+1823596602')).toBeNull();      // se cayó el 9 de 829
    expect(aE164('+1 829 359 66021')).toBeNull(); // uno de más
    expect(aE164('1823596602')).toBeNull();
    expect(aE164('0293596602')).toBeNull();
  });

  it('un número de otro país sigue pasando', () => {
    expect(aE164('+34 612 345 678')).toBe('34612345678');
  });

  it('vacío o basura no es un número', () => {
    expect(aE164('')).toBeNull();
    expect(aE164('ext 12')).toBeNull();
  });
});
