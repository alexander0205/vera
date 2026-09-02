import { describe, it, expect } from 'vitest';
import {
  inferirTipo, formatearMientrasEscribe, validarDocumento, normalizarDocumento,
  tipoSugerido,
} from '@/lib/documento/identidad';

describe('inferirTipo', () => {
  it('deduce cédula con 11 dígitos', () => {
    expect(inferirTipo('00112345678')).toBe('cedula');
    expect(inferirTipo('001-1234567-8')).toBe('cedula');
  });
  it('deduce RNC con 9 dígitos', () => {
    expect(inferirTipo('131793916')).toBe('rnc');
  });
  it('deduce pasaporte cuando hay letras', () => {
    expect(inferirTipo('AB123456')).toBe('pasaporte');
  });
  it('vacío → rnc (caso más común al crear)', () => {
    expect(inferirTipo('')).toBe('rnc');
    expect(inferirTipo(null)).toBe('rnc');
  });
});

describe('formatearMientrasEscribe', () => {
  it('RNC: solo dígitos, hasta 11 (para poder sugerir cédula)', () => {
    expect(formatearMientrasEscribe('rnc', '13-179 3916')).toBe('131793916');
    expect(formatearMientrasEscribe('rnc', '00112345678')).toBe('00112345678');
    expect(formatearMientrasEscribe('rnc', '001123456789')).toBe('00112345678'); // corta en 11
  });
  it('cédula: 000-0000000-0, máx 11 dígitos', () => {
    expect(formatearMientrasEscribe('cedula', '00112345678999')).toBe('001-1234567-8');
    expect(formatearMientrasEscribe('cedula', '001')).toBe('001');
    expect(formatearMientrasEscribe('cedula', '0011234')).toBe('001-1234');
  });
  it('pasaporte: alfanumérico en mayúsculas', () => {
    expect(formatearMientrasEscribe('pasaporte', 'ab-12 34!')).toBe('AB1234');
  });
});

describe('validarDocumento', () => {
  it('vacío es válido (opcionalidad la decide el form)', () => {
    expect(validarDocumento('rnc', '')).toBeNull();
  });
  it('RNC exige 9 dígitos', () => {
    expect(validarDocumento('rnc', '131793916')).toBeNull();
    expect(validarDocumento('rnc', '13179391')).not.toBeNull();
  });
  it('cédula exige 11 dígitos (ignora guiones)', () => {
    expect(validarDocumento('cedula', '001-1234567-8')).toBeNull();
    expect(validarDocumento('cedula', '0011234567')).not.toBeNull();
  });
  it('pasaporte: 5-20 alfanum con letra y número', () => {
    expect(validarDocumento('pasaporte', 'AB12345')).toBeNull();
    expect(validarDocumento('pasaporte', 'ABCDEF')).not.toBeNull(); // sin número
    expect(validarDocumento('pasaporte', '123')).not.toBeNull();    // muy corto
  });
});

describe('tipoSugerido', () => {
  it('con RNC elegido, 11 dígitos → sugiere cédula', () => {
    expect(tipoSugerido('rnc', '00112345678')).toBe('cedula');
    expect(tipoSugerido('rnc', '001-1234567-8')).toBe('cedula');
  });
  it('con RNC/cédula elegido, letras → sugiere pasaporte', () => {
    expect(tipoSugerido('rnc', 'AB12345')).toBe('pasaporte');
    expect(tipoSugerido('cedula', 'AB12345')).toBe('pasaporte');
  });
  it('con pasaporte elegido, 9 dígitos → sugiere RNC', () => {
    expect(tipoSugerido('pasaporte', '131793916')).toBe('rnc');
  });
  it('con Cédula puesta, 9 dígitos (RNC completo) → sugiere RNC', () => {
    expect(tipoSugerido('cedula', '001123456')).toBe('rnc');
  });
  it('a media cédula (8 díg) NO propone RNC; en el 9º exacto sí', () => {
    expect(tipoSugerido('cedula', '00112345')).toBeNull();   // 8 díg
    expect(tipoSugerido('cedula', '0011234567')).toBeNull(); // 10 díg
  });
  it('sin señal confiable → null', () => {
    expect(tipoSugerido('rnc', '131793916')).toBeNull(); // encaja con el tipo
    expect(tipoSugerido('rnc', '12')).toBeNull();        // muy corto
    expect(tipoSugerido('cedula', '00112345678')).toBeNull(); // ya es cédula
  });
});

describe('normalizarDocumento', () => {
  it('quita guiones/espacios y sube a mayúsculas', () => {
    expect(normalizarDocumento('001-1234567-8')).toBe('00112345678');
    expect(normalizarDocumento('ab 12-34')).toBe('AB1234');
  });
});
