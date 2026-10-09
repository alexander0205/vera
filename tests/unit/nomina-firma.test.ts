import { describe, it, expect } from 'vitest';
import {
  generarTokenFirma, hashTokenFirma, formatoTokenValido, selloFirma, firmaValida,
} from '@/lib/nomina/firma';

describe('token de firma', () => {
  it('genera tokens de 43 chars base64url, únicos', () => {
    const a = generarTokenFirma();
    const b = generarTokenFirma();
    expect(formatoTokenValido(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('el hash es determinista y no reversible al token', () => {
    const t = generarTokenFirma();
    expect(hashTokenFirma(t)).toBe(hashTokenFirma(t));
    expect(hashTokenFirma(t)).not.toContain(t);
    expect(hashTokenFirma(t)).toHaveLength(64);
  });

  it('rechaza formatos inválidos', () => {
    expect(formatoTokenValido('corto')).toBe(false);
    expect(formatoTokenValido('a'.repeat(43) + '!')).toBe(false);
    expect(formatoTokenValido(123)).toBe(false);
  });
});

describe('selloFirma', () => {
  it('mismo contenido → mismo sello', () => {
    const s1 = selloFirma('cuerpo del contrato', 'Ana Pérez', '2026-08-25T12:00:00.000Z');
    const s2 = selloFirma('cuerpo del contrato', 'Ana Pérez', '2026-08-25T12:00:00.000Z');
    expect(s1).toBe(s2);
    expect(s1).toHaveLength(64);
  });

  it('cualquier alteración del cuerpo cambia el sello (tamper-evidence)', () => {
    const base = selloFirma('cuerpo', 'Ana', '2026-08-25T12:00:00.000Z');
    expect(selloFirma('cuerpo alterado', 'Ana', '2026-08-25T12:00:00.000Z')).not.toBe(base);
    expect(selloFirma('cuerpo', 'Otro', '2026-08-25T12:00:00.000Z')).not.toBe(base);
    expect(selloFirma('cuerpo', 'Ana', '2026-08-25T12:00:01.000Z')).not.toBe(base);
  });
});

describe('firmaValida', () => {
  const png = 'data:image/png;base64,' + 'A'.repeat(200);
  it('acepta un PNG data URL de tamaño razonable', () => {
    expect(firmaValida(png)).toBe(true);
  });
  it('rechaza vacío, no-PNG y gigantes', () => {
    expect(firmaValida('data:image/png;base64,AAA')).toBe(false); // muy corto (canvas vacío)
    expect(firmaValida('data:image/jpeg;base64,' + 'A'.repeat(200))).toBe(false);
    expect(firmaValida('data:image/png;base64,' + 'A'.repeat(600 * 1024))).toBe(false);
    expect(firmaValida(null)).toBe(false);
  });
});
