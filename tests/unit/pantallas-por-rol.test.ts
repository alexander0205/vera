import { describe, it, expect } from 'vitest';
import {
  pantallaDeRuta, esPantalla, veLaPantalla, entraAlModulo, moduloDe,
  MODULOS, PANTALLAS, PANTALLAS_ESCOLAR, PERMISO_CONFIGURAR, PERMISOS_GOBERNANZA,
} from '@/lib/config/pantallas';

describe('pantallaDeRuta', () => {
  it('reconoce la pantalla y lo que cuelga de ella', () => {
    expect(pantallaDeRuta('/escolar/pagos')?.id).toBe('escolar-pagos');
    expect(pantallaDeRuta('/escolar/estudiantes/12/editar')?.id).toBe('escolar-estudiantes');
  });

  it('no confunde rutas que solo comparten el comienzo', () => {
    expect(pantallaDeRuta('/escolar/pagos-extra')).toBeNull();
  });

  it('deja fuera lo que no está en el catálogo', () => {
    expect(pantallaDeRuta('/escolar/cobrar-grupo')).toBeNull();
    expect(pantallaDeRuta('/dashboard/equipo/permisos')).toBeNull();
    expect(pantallaDeRuta('/dashboard/suscripcion')).toBeNull();
  });
});

describe('pantallaDeRuta · Facturación', () => {
  it('el Dashboard es solo /dashboard: no se traga el resto de /dashboard/*', () => {
    expect(pantallaDeRuta('/dashboard')?.id).toBe('fact-dashboard');
    expect(pantallaDeRuta('/')?.id).toBe('fact-dashboard');
    expect(pantallaDeRuta('/dashboard/clientes')?.id).toBe('fact-contactos');
  });

  it('una sección con varias rutas las reconoce todas, y sus hijas', () => {
    expect(pantallaDeRuta('/dashboard/facturas/nueva')?.id).toBe('fact-ingresos');
    expect(pantallaDeRuta('/dashboard/notas-credito/12')?.id).toBe('fact-ingresos');
    expect(pantallaDeRuta('/dashboard/gastos/nueva')?.id).toBe('fact-compras');
    expect(pantallaDeRuta('/dashboard/maestros')?.id).toBe('fact-configuracion');
  });

  it('si dos rutas encajan gana la más específica', () => {
    expect(pantallaDeRuta('/dashboard/pagos')?.id).toBe('fact-reportes');
    expect(pantallaDeRuta('/dashboard/pagos/links')?.id).toBe('fact-ingresos');
    expect(pantallaDeRuta('/dashboard/secuencias')?.id).toBe('fact-configuracion');
    expect(pantallaDeRuta('/dashboard/contabilidad/secuencias')?.id).toBe('fact-comprobantes');
  });
});

describe('catálogo de módulos', () => {
  it('cada pantalla pertenece al módulo donde está y los ids no se repiten', () => {
    for (const m of MODULOS) for (const p of m.pantallas) expect(p.modulo).toBe(m.id);
    const ids = PANTALLAS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Panorama (colegio) y Dashboard (facturación) son pantallas gobernables', () => {
    expect(esPantalla('escolar-panorama')).toBe(true);
    expect(esPantalla('fact-dashboard')).toBe(true);
  });

  it('PERMISOS_GOBERNANZA reúne puertas, acciones y permisos de pantalla', () => {
    for (const p of ['modulo:facturacion', 'modulo:escolar', 'facturas:crear', PERMISO_CONFIGURAR]) {
      expect(PERMISOS_GOBERNANZA).toContain(p);
    }
  });
});

describe('entraAlModulo', () => {
  const colegio = moduloDe('escolar');
  it('pide todos los permisos de la puerta', () => {
    expect(entraAlModulo({ key: 'x', permisos: ['modulo:escolar'] }, colegio)).toBe(false);
    expect(entraAlModulo({ key: 'x', permisos: ['modulo:escolar', 'administracion-escolar:ver'] }, colegio)).toBe(true);
  });
  it('el Propietario siempre entra', () => {
    expect(entraAlModulo({ key: 'owner', permisos: [] }, colegio)).toBe(true);
  });
});

describe('esPantalla', () => {
  it('solo acepta ids del catálogo', () => {
    expect(esPantalla('escolar-avisos')).toBe(true);
    expect(esPantalla('facturas:ver')).toBe(false);
    expect(esPantalla(3)).toBe(false);
  });

  it('los ids no se repiten', () => {
    const ids = PANTALLAS_ESCOLAR.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('veLaPantalla', () => {
  const pag = PANTALLAS_ESCOLAR.find(p => p.id === 'escolar-pagos')!;
  const conf = PANTALLAS_ESCOLAR.find(p => p.id === 'escolar-configuracion')!;
  const rol = (extra: Partial<{ key: string; ocultas: string[]; permisos: string[] }> = {}) =>
    ({ key: 'personal-escolar', ocultas: [], permisos: [], ...extra });

  it('una pantalla sin permiso se ve salvo que esté en la lista de apagadas', () => {
    expect(veLaPantalla(rol(), pag)).toBe(true);
    expect(veLaPantalla(rol({ ocultas: ['escolar-pagos'] }), pag)).toBe(false);
  });

  it('Configuración y Documentos las manda el permiso «configurar»', () => {
    expect(veLaPantalla(rol(), conf)).toBe(false);
    expect(veLaPantalla(rol({ permisos: [PERMISO_CONFIGURAR] }), conf)).toBe(true);
    expect(PANTALLAS_ESCOLAR.filter(p => p.permiso === PERMISO_CONFIGURAR).map(p => p.id))
      .toEqual(['escolar-documentos', 'escolar-configuracion']);
  });

  it('el Propietario ve todo', () => {
    expect(veLaPantalla(rol({ key: 'owner' }), conf)).toBe(true);
    expect(veLaPantalla(rol({ key: 'owner', ocultas: ['escolar-pagos'] }), pag)).toBe(true);
  });
});
