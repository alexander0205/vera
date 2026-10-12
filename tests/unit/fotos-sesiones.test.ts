import { describe, it, expect } from 'vitest';
import {
  generarToken, hashToken, formatoTokenValido, fechaExpiracion,
  estadoSesion, segundosRestantes, MINUTOS_VIGENCIA,
} from '@/lib/fotos/sesiones';

/**
 * El token del QR es lo único que autoriza al teléfono, que entra sin sesión.
 * Estas pruebas cubren las tres promesas que se le hicieron al dueño: que no se
 * adivina, que caduca en minutos y que sirve una sola vez.
 */

describe('token de captura', () => {
  it('es de 256 bits y no se repite', () => {
    const vistos = new Set(Array.from({ length: 500 }, generarToken));
    expect(vistos.size).toBe(500);
    // 32 bytes en base64url = 43 caracteres sin relleno.
    expect([...vistos][0]).toHaveLength(43);
  });

  it('no lleva nada correlativo: dos seguidos no comparten prefijo', () => {
    const a = generarToken();
    const b = generarToken();
    expect(a.slice(0, 8)).not.toBe(b.slice(0, 8));
  });

  it('solo se guarda el hash, y el hash no deja ver el token', () => {
    const token = generarToken();
    const h = hashToken(token);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(token);
    // Determinista: es lo que permite buscar la sesión por el token recibido.
    expect(hashToken(token)).toBe(h);
    expect(hashToken(generarToken())).not.toBe(h);
  });

  it('rechaza formatos que no son un token antes de tocar la base', () => {
    expect(formatoTokenValido(generarToken())).toBe(true);
    expect(formatoTokenValido('')).toBe(false);
    expect(formatoTokenValido('123')).toBe(false);
    expect(formatoTokenValido('a'.repeat(44))).toBe(false);
    // Nada de rutas ni comodines colándose por la URL.
    expect(formatoTokenValido('../'.padEnd(43, 'a'))).toBe(false);
    expect(formatoTokenValido('a'.repeat(42) + '+')).toBe(false);
    expect(formatoTokenValido(null)).toBe(false);
    expect(formatoTokenValido(12345)).toBe(false);
  });
});

describe('vigencia de la sesión', () => {
  const base = new Date('2026-08-06T10:00:00Z');

  it('caduca a los minutos pactados, no a las horas', () => {
    const exp = fechaExpiracion(base);
    expect(exp.getTime() - base.getTime()).toBe(MINUTOS_VIGENCIA * 60_000);
    expect(MINUTOS_VIGENCIA).toBeLessThanOrEqual(15);
  });

  it('es válida antes de expirar y expirada justo al llegar la hora', () => {
    const sesion = { expiraEn: fechaExpiracion(base), usadaEn: null };
    expect(estadoSesion(sesion, base)).toBe('valida');
    expect(estadoSesion(sesion, new Date(base.getTime() + 9 * 60_000))).toBe('valida');
    expect(estadoSesion(sesion, sesion.expiraEn)).toBe('expirada');
    expect(estadoSesion(sesion, new Date(base.getTime() + 60 * 60_000))).toBe('expirada');
  });

  it('una vez usada ya no vale, aunque le sobre tiempo', () => {
    const sesion = { expiraEn: fechaExpiracion(base), usadaEn: new Date(base.getTime() + 1000) };
    expect(estadoSesion(sesion, base)).toBe('usada');
    // Y usada gana a expirada: al escritorio le importa que la foto llegó.
    expect(estadoSesion(sesion, new Date(base.getTime() + 60 * 60_000))).toBe('usada');
  });

  it('el contador nunca baja de cero', () => {
    const sesion = { expiraEn: fechaExpiracion(base), usadaEn: null };
    expect(segundosRestantes(sesion, base)).toBe(MINUTOS_VIGENCIA * 60);
    expect(segundosRestantes(sesion, new Date(base.getTime() + 99 * 60_000))).toBe(0);
  });
});
