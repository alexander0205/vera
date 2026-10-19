import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { permisosDeRuta } from '@/lib/export/permiso-listado';

describe('permisosDeRuta', () => {
  it('pide el permiso de ver de la pantalla', () => {
    expect(permisosDeRuta('/escolar/pagos')).toEqual(['administracion-escolar:ver']);
    expect(permisosDeRuta('/nomina/empleados')).toEqual(['empleados:ver']);
    expect(permisosDeRuta('/dashboard/caja/historial')).toEqual(['caja:ver']);
    expect(permisosDeRuta('/dashboard/notas-credito?x=1')).toEqual(['facturas:exportar']);
  });

  it('rechaza lo que no es una pantalla con exporte', () => {
    expect(permisosDeRuta(undefined)).toBeNull();
    expect(permisosDeRuta('https://otro.com/escolar')).toBeNull();
    expect(permisosDeRuta('/dashboard/equipo')).toBeNull();
    expect(permisosDeRuta('/escolarx')).toBeNull();
  });

  it('toda pantalla con exporte genérico tiene su permiso', () => {
    const raiz = join(process.cwd(), 'app');
    const sinPermiso: string[] = [];
    const recorrer = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) { if (n !== 'api') recorrer(p); continue; }
        if (!/\.tsx$/.test(n)) continue;
        const src = readFileSync(p, 'utf8');
        if (!/exportar=\{|<ExportarListado/.test(src)) continue;
        // app/(dashboard)/dashboard/productos/_page-client.tsx → /dashboard/productos
        const ruta = '/' + relative(raiz, dir).split(sep).filter((s) => !s.startsWith('(')).join('/');
        if (!permisosDeRuta(ruta)) sinPermiso.push(ruta);
      }
    };
    recorrer(raiz);
    expect(sinPermiso).toEqual([]);
  });
});
