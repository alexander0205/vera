import { describe, it, expect } from 'vitest';
import { pantallaDeRuta, esPantalla, PANTALLAS_ESCOLAR } from '@/lib/config/pantallas';

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
