/**
 * El mapeo de host a módulo.
 *
 * Se prueba porque de estas funciones depende a dónde va CADA petición. Un
 * fallo aquí no rompe una pantalla: manda a todo el mundo al sitio equivocado,
 * o peor, deja de reconocer el host de la cuenta y produce un bucle de
 * redirecciones en /sign-in — que es la única avería de la que no se puede
 * salir entrando a arreglarla.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { moduleForHost, esHostApp, hostDeModulo, esRutaDeCuenta } from '@/lib/config/modules';

const ENV = { ...process.env };
afterEach(() => { process.env = { ...ENV }; });
beforeEach(() => {
  delete process.env.APP_HOST;
  delete process.env.POS_HOST;
  delete process.env.FACTURACION_HOST;
  delete process.env.COLEGIO_HOST;
  delete process.env.ESCOLAR_HOST;
});

describe('moduleForHost', () => {
  it('reconoce los subdominios de producción', () => {
    expect(moduleForHost('pos.zero.com.do')).toBe('pos');
    expect(moduleForHost('facturacion.zero.com.do')).toBe('facturacion');
    expect(moduleForHost('colegio.zero.com.do')).toBe('escolar');
  });

  it('acepta «escolar.» además de «colegio.»', () => {
    // El módulo se llama `escolar` en todo el código; `colegio` es el nombre
    // comercial. Aceptar los dos evita tener que renombrar permisos y rutas.
    expect(moduleForHost('escolar.zero.com.do')).toBe('escolar');
  });

  it('funciona en desarrollo, con puerto', () => {
    expect(moduleForHost('pos.localhost:3000')).toBe('pos');
    expect(moduleForHost('colegio.localhost:3002')).toBe('escolar');
  });

  it('no le importan las mayúsculas', () => {
    expect(moduleForHost('POS.Zero.Com.Do')).toBe('pos');
  });

  it('el host de la cuenta y el raíz no son ningún módulo', () => {
    expect(moduleForHost('app.zero.com.do')).toBeNull();
    expect(moduleForHost('zero.com.do')).toBeNull();
    expect(moduleForHost(null)).toBeNull();
    expect(moduleForHost('')).toBeNull();
  });

  it('la variable de entorno manda sobre el prefijo', () => {
    // Para el dominio de pruebas de Vercel, que no lleva prefijo.
    process.env.POS_HOST = 'zero-pos-preview.vercel.app';
    expect(moduleForHost('zero-pos-preview.vercel.app')).toBe('pos');
  });
});

describe('esHostApp', () => {
  it('reconoce app.* por prefijo', () => {
    expect(esHostApp('app.zero.com.do')).toBe(true);
    expect(esHostApp('app.localhost:3000')).toBe(true);
  });

  it('y por variable de entorno', () => {
    process.env.APP_HOST = 'cuenta.zero.com.do';
    expect(esHostApp('cuenta.zero.com.do')).toBe(true);
  });

  it('los hosts de módulo NO son el de la cuenta', () => {
    // Si esto devolviera true, el proxy creería estar ya en el host correcto y
    // no redirigiría; si devolviera false para el propio app.*, redirigiría a
    // sí mismo en bucle. Las dos direcciones importan.
    expect(esHostApp('pos.zero.com.do')).toBe(false);
    expect(esHostApp('facturacion.zero.com.do')).toBe(false);
    expect(esHostApp('colegio.zero.com.do')).toBe(false);
    expect(esHostApp('zero.com.do')).toBe(false);
    expect(esHostApp(null)).toBe(false);
  });
});

describe('hostDeModulo', () => {
  it('sin variables devuelve null — y eso es lo que deja todo como hoy', () => {
    // Es la garantía de que subir este código a producción no mueve nada
    // hasta que se configuren los subdominios a propósito.
    expect(hostDeModulo('pos')).toBeNull();
    expect(hostDeModulo('facturacion')).toBeNull();
    expect(hostDeModulo('escolar')).toBeNull();
  });

  it('con variables, cada módulo a su host', () => {
    process.env.POS_HOST = 'pos.zero.com.do';
    process.env.COLEGIO_HOST = 'colegio.zero.com.do';
    expect(hostDeModulo('pos')).toBe('pos.zero.com.do');
    expect(hostDeModulo('escolar')).toBe('colegio.zero.com.do');
  });

  it('COLEGIO_HOST gana sobre ESCOLAR_HOST', () => {
    process.env.ESCOLAR_HOST = 'escolar.zero.com.do';
    process.env.COLEGIO_HOST = 'colegio.zero.com.do';
    expect(hostDeModulo('escolar')).toBe('colegio.zero.com.do');
  });

  it('administracion no tiene host propio: vive en el de la cuenta', () => {
    expect(hostDeModulo('administracion')).toBeNull();
  });
});

describe('esRutaDeCuenta', () => {
  it('cubre entrar, registrarse y el onboarding', () => {
    for (const r of ['/sign-in', '/sign-up', '/bienvenida', '/verifica-tu-correo', '/cuenta']) {
      expect(esRutaDeCuenta(r)).toBe(true);
    }
  });

  it('cubre las hijas, no solo la raíz de cada una', () => {
    // `/reset-password/<token>` es el caso real: una lista de rutas exactas se
    // queda corta y el enlace del correo acabaría en el host equivocado.
    expect(esRutaDeCuenta('/reset-password/abc123')).toBe(true);
    expect(esRutaDeCuenta('/cuenta/usuarios')).toBe(true);
  });

  it('NO se lleva las rutas de módulo', () => {
    for (const r of ['/dashboard', '/pos', '/escolar', '/dashboard/facturas']) {
      expect(esRutaDeCuenta(r)).toBe(false);
    }
  });

  it('no confunde por prefijo parcial', () => {
    // '/cuentas-por-cobrar' empieza por '/cuenta' pero no es ruta de cuenta.
    expect(esRutaDeCuenta('/cuentas-por-cobrar')).toBe(false);
  });
});
