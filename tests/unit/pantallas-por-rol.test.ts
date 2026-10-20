import { describe, it, expect } from 'vitest';
import { PANTALLAS, esPantalla, pantallaDeRuta, veLaPantalla } from '@/lib/config/pantallas';

describe('catálogo', () => {
  it('son dos: Panorama (Gobernanza) y Dashboard (Facturación)', () => {
    expect(PANTALLAS.map(p => p.id)).toEqual(['escolar-panorama', 'fact-dashboard']);
    expect(esPantalla('escolar-panorama')).toBe(true);
    expect(esPantalla('fact-dashboard')).toBe(true);
    expect(esPantalla('facturas:ver')).toBe(false);
    expect(esPantalla(3)).toBe(false);
  });
});

describe('pantallaDeRuta', () => {
  it('Panorama es /escolar/dashboard', () => {
    expect(pantallaDeRuta('/escolar/dashboard')?.id).toBe('escolar-panorama');
  });

  it('el Dashboard es solo /dashboard: no se traga el resto de /dashboard/*', () => {
    expect(pantallaDeRuta('/dashboard')?.id).toBe('fact-dashboard');
    expect(pantallaDeRuta('/')?.id).toBe('fact-dashboard');
    expect(pantallaDeRuta('/dashboard/clientes')).toBeNull();
    expect(pantallaDeRuta('/dashboard/facturas/nueva')).toBeNull();
  });

  it('no confunde rutas que solo comparten el comienzo', () => {
    expect(pantallaDeRuta('/escolar/dashboard-extra')).toBeNull();
    expect(pantallaDeRuta('/escolar/pagos')).toBeNull();
  });
});

describe('veLaPantalla', () => {
  const rol = (extra: Partial<{ key: string; ocultas: string[] }> = {}) => ({ key: 'user', ocultas: [], ...extra });

  it('se ve salvo que esté en la lista de apagadas', () => {
    expect(veLaPantalla(rol(), 'fact-dashboard')).toBe(true);
    expect(veLaPantalla(rol({ ocultas: ['fact-dashboard'] }), 'fact-dashboard')).toBe(false);
    expect(veLaPantalla(rol({ ocultas: ['fact-dashboard'] }), 'escolar-panorama')).toBe(true);
  });

  it('el Propietario siempre la ve', () => {
    expect(veLaPantalla(rol({ key: 'owner', ocultas: ['fact-dashboard'] }), 'fact-dashboard')).toBe(true);
  });
});
