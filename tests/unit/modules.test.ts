/**
 * Unit tests — catálogo de módulos (lib/config/modules.ts).
 * Cubre la lógica pura del gate: sanitización de la columna jsonb,
 * resolución de URLs por módulo y el routing por hostname del proxy.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sanitizeModules, moduleUrl, moduleForHost, MODULE_HOME,
} from '@/lib/config/modules';

describe('sanitizeModules', () => {
  it('filtra valores desconocidos y conserva los válidos', () => {
    expect(sanitizeModules(['facturacion', 'pos', 'hack', 42])).toEqual(['facturacion', 'pos']);
  });
  it('no-array → []', () => {
    expect(sanitizeModules(null)).toEqual([]);
    expect(sanitizeModules('facturacion')).toEqual([]);
    expect(sanitizeModules({})).toEqual([]);
  });
  it('orden canónico (según MODULES) sin importar el orden de entrada', () => {
    expect(sanitizeModules(['pos', 'facturacion'])).toEqual(['facturacion', 'pos']);
  });
  it('duplicados colapsan', () => {
    expect(sanitizeModules(['pos', 'pos'])).toEqual(['pos']);
  });
});

describe('moduleUrl', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sin envs cae al path local', () => {
    vi.stubEnv('NEXT_PUBLIC_POS_URL', '');
    vi.stubEnv('NEXT_PUBLIC_FACTURACION_URL', '');
    expect(moduleUrl('pos')).toBe(MODULE_HOME.pos);
    expect(moduleUrl('facturacion')).toBe(MODULE_HOME.facturacion);
  });

  it('con envs usa la URL pública del subdominio', () => {
    vi.stubEnv('NEXT_PUBLIC_POS_URL', 'https://pos.zero.com.do');
    vi.stubEnv('NEXT_PUBLIC_FACTURACION_URL', 'https://facturacion.zero.com.do');
    expect(moduleUrl('pos')).toBe('https://pos.zero.com.do');
    expect(moduleUrl('facturacion')).toBe('https://facturacion.zero.com.do');
  });
});

describe('moduleForHost (routing de subdominios)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('POS_HOST', '');
    vi.stubEnv('FACTURACION_HOST', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefijo pos. → pos (incluye dev con puerto)', () => {
    expect(moduleForHost('pos.zero.com.do')).toBe('pos');
    expect(moduleForHost('pos.localhost:3000')).toBe('pos');
    expect(moduleForHost('POS.ZERO.COM.DO')).toBe('pos');
  });

  it('prefijo facturacion. → facturacion', () => {
    expect(moduleForHost('facturacion.zero.com.do')).toBe('facturacion');
    expect(moduleForHost('facturacion.localhost:3000')).toBe('facturacion');
  });

  it('hosts sin módulo → null', () => {
    expect(moduleForHost('zero.com.do')).toBeNull();
    expect(moduleForHost('localhost:3000')).toBeNull();
    expect(moduleForHost('app.otrodominio.com')).toBeNull();
    expect(moduleForHost(null)).toBeNull();
    expect(moduleForHost(undefined)).toBeNull();
  });

  it('match exacto por env manda (dominios custom sin prefijo)', () => {
    vi.stubEnv('POS_HOST', 'caja.miempresa.do');
    expect(moduleForHost('caja.miempresa.do')).toBe('pos');
    expect(moduleForHost('caja.miempresa.do:443')).toBeNull(); // exacto incluye puerto
  });

  it('no confunde subdominios que contienen pero no empiezan con el prefijo', () => {
    expect(moduleForHost('repos.zero.com.do')).toBeNull();
    expect(moduleForHost('misfacturacion.zero.com.do')).toBeNull();
  });
});
