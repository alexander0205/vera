import { describe, it, expect } from 'vitest';
import {
  pantallaDeRuta, esPantalla, veLaPantalla, PANTALLAS_ESCOLAR, PERMISO_CONFIGURAR,
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
    expect(pantallaDeRuta('/dashboard/clientes')).toBeNull();
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
