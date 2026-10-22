import { describe, it, expect } from 'vitest';
import {
  PANTALLAS, esPantalla, pantallaDeRuta, primeraVisible, rutaOculta, veLaPantalla,
} from '@/lib/config/pantallas';

/**
 * Pantallas por rol (PR #140). Lo que decide si una ruta queda tapada es
 * `pantallaDeRuta`: si se equivoca, ocultar una pantalla tapa otra, o una
 * subruta se salta el aviso.
 */
const id = (ruta: string, inicio?: string) => pantallaDeRuta(ruta, inicio)?.id ?? null;

describe('pantallaDeRuta', () => {
  it('cada pantalla del catálogo se encuentra por su propia ruta', () => {
    for (const p of PANTALLAS) {
      expect(id(p.href)).toBe(p.id);
      for (const r of p.rutas ?? []) expect(id(r)).toBe(p.id);
    }
  });

  it('los ids no se repiten', () => {
    expect(new Set(PANTALLAS.map(p => p.id)).size).toBe(PANTALLAS.length);
  });

  it('las subrutas son de su pantalla', () => {
    expect(id('/dashboard/facturas/nueva')).toBe('fact-facturas');
    expect(id('/dashboard/facturas/4431')).toBe('fact-facturas');
    expect(id('/escolar/estudiantes/12/record')).toBe('escolar-estudiantes');
    expect(id('/dashboard/cotizaciones/7/editar')).toBe('fact-cotizaciones');
  });

  it('una ruta que empieza igual no es la misma pantalla', () => {
    expect(id('/dashboard/facturas-recurrentes')).toBe('fact-recurrentes');
    expect(id('/dashboard/facturas-recurrentes/3')).toBe('fact-recurrentes');
  });

  it('las rutas exactas no se tragan lo que cuelga de ellas', () => {
    expect(id('/dashboard')).toBe('fact-dashboard');
    expect(id('/dashboard/ruta-que-no-existe')).toBeNull();
    expect(id('/dashboard/caja')).toBe('fact-caja');
    expect(id('/dashboard/caja/historial')).toBe('fact-caja-historial');
  });

  it('la dirección codificada o con barra final es la misma pantalla', () => {
    expect(id('/dashboard/%66acturas')).toBe('fact-facturas');
    expect(id('/dashboard/facturas/')).toBe('fact-facturas');
    expect(id('/dashboard/facturas?estado=pagada')).toBe('fact-facturas');
    expect(id('/dashboard/%E0%A4%A')).toBeNull(); // secuencia inválida: no revienta
  });

  it('en la portada de un subdominio «/» es la portada del módulo', () => {
    expect(id('/', '/pos')).toBe('pos-vender');
    expect(id('/', '/escolar')).toBeNull();
    expect(id('/')).toBe('fact-dashboard');
  });

  it('las pantallas que no estaban en el catálogo cuelgan de la suya', () => {
    expect(id('/escolar/sigerd/migrar')).toBe('escolar-configuracion');
    expect(id('/escolar/personal')).toBe('escolar-configuracion');
    expect(id('/escolar/condicion-academica')).toBe('escolar-estudiantes');
    expect(id('/escolar/cobrar-grupo')).toBe('escolar-responsables');
    expect(id('/pos/terminales')).toBe('pos-configuracion');
    expect(id('/dashboard/pos-terminales')).toBe('pos-configuracion');
  });

  it('«Pagos recibidos» es de Reportes', () => {
    expect(id('/dashboard/pagos')).toBe('fact-reportes');
  });

  it('Equipo, Roles y Usuarios no se pueden ocultar', () => {
    expect(id('/cuenta/roles')).toBeNull();
    expect(id('/cuenta/usuarios')).toBeNull();
    expect(id('/dashboard/equipo')).toBeNull();
  });
});

describe('rutaOculta', () => {
  it('sin pantallas ocultas no tapa nada', () => {
    expect(rutaOculta('/dashboard/facturas', [])).toBe(false);
  });
  it('tapa la pantalla y sus subrutas, no la vecina', () => {
    const ocultas = ['fact-facturas'];
    expect(rutaOculta('/dashboard/facturas', ocultas)).toBe(true);
    expect(rutaOculta('/dashboard/facturas/nueva', ocultas)).toBe(true);
    expect(rutaOculta('/dashboard/facturas-recurrentes', ocultas)).toBe(false);
  });
});

describe('primeraVisible', () => {
  it('la preferida si la ve; si no, la primera del módulo que ve', () => {
    expect(primeraVisible('escolar', [], undefined, 'escolar-estudiantes')?.id).toBe('escolar-estudiantes');
    expect(primeraVisible('escolar', ['escolar-estudiantes'], undefined, 'escolar-estudiantes')?.id).toBe('escolar-panorama');
  });
  it('no manda a una pantalla que el permiso no deja abrir', () => {
    const puede = (href: string) => href !== '/dashboard' && href !== '/dashboard/clientes';
    expect(primeraVisible('facturacion', ['fact-dashboard'], puede)?.id).toBe('fact-reportes');
  });
  it('sin ninguna que vea, ninguna', () => {
    const todas = PANTALLAS.filter(p => p.modulo === 'nomina').map(p => p.id);
    expect(primeraVisible('nomina', todas)).toBeNull();
  });
});

describe('validación', () => {
  it('esPantalla solo acepta ids del catálogo', () => {
    expect(esPantalla('fact-facturas')).toBe(true);
    expect(esPantalla('equipo')).toBe(false);
    expect(esPantalla(7)).toBe(false);
  });
  it('el Propietario ve todo aunque tenga filas', () => {
    expect(veLaPantalla({ key: 'owner', ocultas: ['fact-facturas'] }, 'fact-facturas')).toBe(true);
    expect(veLaPantalla({ key: 'user', ocultas: ['fact-facturas'] }, 'fact-facturas')).toBe(false);
  });
});
