import { describe, it, expect } from 'vitest';
import {
  PANTALLAS, MODULOS_PANTALLAS, esPantalla, pantallaDeRuta, veLaPantalla, agruparPantallas, rutaOculta,
} from '@/lib/config/pantallas';

describe('catálogo', () => {
  it('cada pantalla pertenece a un módulo conocido y los ids no se repiten', () => {
    const modulos = new Set(MODULOS_PANTALLAS.map(m => m.id));
    for (const p of PANTALLAS) expect(modulos.has(p.modulo)).toBe(true);
    const ids = PANTALLAS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Gobernanza trae sus 8 pantallas y Facturación las suyas', () => {
    expect(PANTALLAS.filter(p => p.modulo === 'escolar')).toHaveLength(8);
    expect(PANTALLAS.filter(p => p.modulo === 'facturacion').length).toBeGreaterThan(25);
    expect(esPantalla('escolar-panorama')).toBe(true);
    expect(esPantalla('fact-dashboard')).toBe(true);
    expect(esPantalla('facturas:ver')).toBe(false);
    expect(esPantalla(3)).toBe(false);
  });

  it('Equipo, Roles y Usuarios no se pueden ocultar', () => {
    expect(pantallaDeRuta('/dashboard/equipo/permisos')).toBeNull();
    expect(pantallaDeRuta('/cuenta/roles')).toBeNull();
    expect(pantallaDeRuta('/cuenta/usuarios')).toBeNull();
  });
});

describe('pantallaDeRuta · Gobernanza', () => {
  it('reconoce la pantalla y lo que cuelga de ella', () => {
    expect(pantallaDeRuta('/escolar/dashboard')?.id).toBe('escolar-panorama');
    expect(pantallaDeRuta('/escolar/pagos')?.id).toBe('escolar-pagos');
    expect(pantallaDeRuta('/escolar/estudiantes/12/editar')?.id).toBe('escolar-estudiantes');
  });

  it('no confunde rutas que solo comparten el comienzo', () => {
    expect(pantallaDeRuta('/escolar/pagos-extra')).toBeNull();
    expect(pantallaDeRuta('/escolar/cobrar-grupo')).toBeNull();
  });
});

describe('pantallaDeRuta · Facturación', () => {
  it('el Dashboard es solo /dashboard: no se traga el resto de /dashboard/*', () => {
    expect(pantallaDeRuta('/dashboard')?.id).toBe('fact-dashboard');
    expect(pantallaDeRuta('/')?.id).toBe('fact-dashboard');
    expect(pantallaDeRuta('/dashboard/clientes')?.id).toBe('fact-contactos');
  });

  it('cada pantalla del menú tiene la suya, también sus hijas', () => {
    expect(pantallaDeRuta('/dashboard/facturas')?.id).toBe('fact-facturas');
    expect(pantallaDeRuta('/dashboard/facturas/nueva')?.id).toBe('fact-facturas');
    expect(pantallaDeRuta('/dashboard/facturas-recurrentes')?.id).toBe('fact-recurrentes');
    expect(pantallaDeRuta('/dashboard/notas-credito/12')?.id).toBe('fact-notas-credito');
    expect(pantallaDeRuta('/dashboard/gastos/nueva')?.id).toBe('fact-gastos');
  });

  it('«Mi caja» es solo /dashboard/caja; Aprobaciones e Historial son aparte', () => {
    expect(pantallaDeRuta('/dashboard/caja')?.id).toBe('fact-caja');
    expect(pantallaDeRuta('/dashboard/caja/aprobaciones')?.id).toBe('fact-caja-aprobaciones');
    expect(pantallaDeRuta('/dashboard/caja/historial')?.id).toBe('fact-caja-historial');
  });

  it('«Mi empresa» es solo /dashboard/configuracion; las demás de Configuración van aparte', () => {
    expect(pantallaDeRuta('/dashboard/configuracion')?.id).toBe('fact-empresa');
    expect(pantallaDeRuta('/dashboard/maestros')?.id).toBe('fact-maestros');
    expect(pantallaDeRuta('/dashboard/secuencias')?.id).toBe('fact-secuencias');
    expect(pantallaDeRuta('/dashboard/contabilidad/secuencias')?.id).toBe('fact-secuencias-comp');
  });

  it('si dos rutas encajan gana la más específica', () => {
    expect(pantallaDeRuta('/dashboard/pagos')?.id).toBe('fact-reportes');
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

describe('agruparPantallas', () => {
  it('agrupa por sección del menú y deja las sueltas en un grupo sin nombre', () => {
    const grupos = agruparPantallas(PANTALLAS.filter(p => p.modulo === 'facturacion'));
    expect(grupos[0].nombre).toBeNull();
    expect(grupos.map(g => g.nombre)).toEqual([null, 'Ingresos', 'Inventario', 'Compras', 'Caja', 'Comprobantes', 'Configuración']);
  });
});

describe('pantallaDeRuta · POS, Contabilidad, Nómina y Administración', () => {
  it('«Abrir caja» ya no se confunde con Panorama: cada pantalla del POS es la suya', () => {
    expect(pantallaDeRuta('/pos')?.id).toBe('pos-vender');
    expect(pantallaDeRuta('/pos/turnos')?.id).toBe('pos-turnos');
    expect(pantallaDeRuta('/pos/caja')?.id).toBe('pos-caja');
    expect(pantallaDeRuta('/pos/historial/15')?.id).toBe('pos-historial');
  });

  it('Contabilidad, incluidos sus reportes', () => {
    expect(pantallaDeRuta('/contabilidad')?.id).toBe('contabilidad-panorama');
    expect(pantallaDeRuta('/contabilidad/libro-diario')?.id).toBe('contabilidad-libro');
    expect(pantallaDeRuta('/contabilidad/balance-general')?.id).toBe('contabilidad-balance-general');
    expect(pantallaDeRuta('/contabilidad/balance')?.id).toBe('contabilidad-balance');
  });

  it('Nómina y Administración (Usuarios y Roles siguen fuera)', () => {
    expect(pantallaDeRuta('/nomina')?.id).toBe('nomina-panorama');
    expect(pantallaDeRuta('/nomina/empleados/3')?.id).toBe('nomina-empleados');
    expect(pantallaDeRuta('/cuenta/empresa')?.id).toBe('cuenta-empresa');
    expect(pantallaDeRuta('/cuenta/plan')?.id).toBe('cuenta-plan');
    expect(pantallaDeRuta('/cuenta/usuarios')).toBeNull();
    expect(pantallaDeRuta('/cuenta/roles')).toBeNull();
  });

  it('en el subdominio de un módulo la barra dice «/» y se resuelve con su portada', () => {
    expect(pantallaDeRuta('/', '/pos')?.id).toBe('pos-vender');
    expect(pantallaDeRuta('/', '/nomina')?.id).toBe('nomina-panorama');
    expect(pantallaDeRuta('/')?.id).toBe('fact-dashboard');
  });
});

describe('rutaOculta', () => {
  it('es cierto solo si la ruta es de una pantalla oculta', () => {
    expect(rutaOculta('/pos/caja', ['pos-caja'])).toBe(true);
    expect(rutaOculta('/pos/turnos', ['pos-caja'])).toBe(false);
    expect(rutaOculta('/cuenta/usuarios', ['cuenta-empresa'])).toBe(false);
    expect(rutaOculta('/', ['pos-vender'], '/pos')).toBe(true);
    expect(rutaOculta('/pos', [])).toBe(false);
  });
});
