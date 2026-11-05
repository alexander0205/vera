import { describe, expect, it } from 'vitest';
import {
  CARGO_MAX, FOTO_MAX_BYTES, normalizarCargo, puedeEditarPerfil, tipoDeFoto, urlFotoEquipo, validarFoto,
} from '@/lib/auth/equipo-zero-perfil-reglas';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);

describe('normalizarCargo', () => {
  it('limpia espacios y corta al máximo', () => {
    expect(normalizarCargo('  Soporte   técnico ')).toBe('Soporte técnico');
    expect(normalizarCargo('x'.repeat(CARGO_MAX + 20))).toHaveLength(CARGO_MAX);
  });
  it('vacío o null quita el cargo; lo que no es texto es inválido', () => {
    expect(normalizarCargo('   ')).toBeNull();
    expect(normalizarCargo(null)).toBeNull();
    expect(normalizarCargo(42)).toBeUndefined();
    expect(normalizarCargo(undefined)).toBeUndefined();
  });
  it('quita caracteres de control', () => {
    expect(normalizarCargo('Ventas\n\tnorte')).toBe('Ventas norte');
  });
});

describe('tipoDeFoto', () => {
  it('reconoce JPEG, PNG y WebP por sus bytes', () => {
    expect(tipoDeFoto(JPEG)).toBe('image/jpeg');
    expect(tipoDeFoto(PNG)).toBe('image/png');
    expect(tipoDeFoto(WEBP)).toBe('image/webp');
  });
  it('rechaza lo demás aunque diga ser imagen', () => {
    expect(tipoDeFoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(tipoDeFoto(Buffer.from('GIF89a'))).toBeNull();
    expect(tipoDeFoto(Buffer.alloc(0))).toBeNull();
  });
});

describe('validarFoto', () => {
  it('acepta base64 con o sin prefijo data:', () => {
    const b64 = JPEG.toString('base64');
    const a = validarFoto(b64);
    const b = validarFoto(`data:image/jpeg;base64,${b64}`);
    expect(a.ok && a.tipo).toBe('image/jpeg');
    expect(b.ok && b.bytes.equals(JPEG)).toBe(true);
  });
  it('el tipo sale de los bytes, no del prefijo', () => {
    const r = validarFoto(`data:image/jpeg;base64,${PNG.toString('base64')}`);
    expect(r.ok && r.tipo).toBe('image/png');
  });
  it('rechaza lo que no es imagen, lo dañado y lo vacío', () => {
    expect(validarFoto(Buffer.from('hola').toString('base64')).ok).toBe(false);
    expect(validarFoto('no es base64 ***').ok).toBe(false);
    expect(validarFoto('').ok).toBe(false);
    expect(validarFoto(123).ok).toBe(false);
  });
  it('rechaza una foto más pesada que el tope', () => {
    const grande = Buffer.concat([JPEG, Buffer.alloc(FOTO_MAX_BYTES)]);
    const r = validarFoto(grande.toString('base64'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toMatch(/pesa demasiado/);
  });
});

describe('puedeEditarPerfil', () => {
  it('la propia persona sí; otro admin no; el dueño a cualquiera', () => {
    expect(puedeEditarPerfil({ id: 5, esDueno: false }, 5)).toBe(true);
    expect(puedeEditarPerfil({ id: 5, esDueno: false }, 6)).toBe(false);
    expect(puedeEditarPerfil({ id: 1, esDueno: true }, 6)).toBe(true);
  });
});

it('la URL de la foto lleva la versión', () => {
  expect(urlFotoEquipo(7, 3)).toBe('/api/admin/equipo/7/foto?v=3');
});
