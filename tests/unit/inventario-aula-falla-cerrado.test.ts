/**
 * Si la base no está lista (migración 0236 o 0225 sin correr) o la lectura falla,
 * el inventario por aula NO se enseña y nada se rompe: la planta queda «cerrada».
 * Y el menú, el layout y el catálogo de pantallas están cableados a eso.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/drizzle', () => ({ db: { execute: async () => [] } }));
vi.mock('@/lib/cache/escolar', () => ({ cachearPorTag: (fn: () => unknown) => fn, tagPlanta: (t: number) => `planta:${t}` }));

import { PLANTA_CERRADA, estadoPlantaSeguro, leerEstadoPlanta } from '@/lib/escolar/planta-estado';
import { inventarioAulaVisible } from '@/lib/escolar/inventario-aula';
import { PANTALLAS, pantallaDeRuta } from '@/lib/config/pantallas';

const leer = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('la planta falla cerrada', () => {
  it('si la lectura revienta (tabla o columna que no existe), no se muestra nada y no se lanza', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const e = await estadoPlantaSeguro(1, async () => { throw new Error('relation "escolar_espacios" does not exist'); });
    expect(e).toEqual(PLANTA_CERRADA);
    expect(inventarioAulaVisible(e)).toBe(false);
    err.mockRestore();
  });

  it('sin las migraciones, la lectura real dice «no disponible» y no consulta la planta', async () => {
    const e = await leerEstadoPlanta(1);
    expect(e).toEqual(PLANTA_CERRADA);
  });

  it('si la lectura sale bien, se devuelve tal cual', async () => {
    const e = await estadoPlantaSeguro(1, async () => ({ disponible: true, espacios: 2, activosConEspacio: 4 }));
    expect(inventarioAulaVisible(e)).toBe(true);
  });
});

describe('cableado de la pantalla', () => {
  it('«Inventario por aula» es una pantalla del catálogo, apagable por rol, con su ruta', () => {
    const p = PANTALLAS.find((x) => x.id === 'escolar-inventario-aula');
    expect(p?.modulo).toBe('escolar');
    expect(p?.href).toBe('/escolar/inventario-aula');
    expect(pantallaDeRuta('/escolar/inventario-aula/12')?.id).toBe('escolar-inventario-aula');
    expect(pantallaDeRuta('/escolar/inventario-aula/sin-aula')?.id).toBe('escolar-inventario-aula');
    // «Planta física» cuelga de Configuración, no de esta pantalla.
    expect(pantallaDeRuta('/escolar/configuracion/planta-fisica')?.id).toBe('escolar-configuracion');
  });

  it('el menú tiene la entrada y el layout la oculta mientras la planta no esté configurada', () => {
    const rail = leer('components/escolar-nav-rail.tsx');
    expect(rail).toContain("id: 'escolar-inventario-aula'");
    const layout = leer('app/escolar/layout.tsx');
    expect(layout).toContain("inventarioAulaVisible(planta)");
    expect(layout).toContain("'escolar-inventario-aula'");
    expect(layout).toContain('estadoPlantaDe');
  });

  it('«Planta física» es una pestaña de configuración que solo sale si la base está lista', () => {
    const nav = leer('app/escolar/configuracion/_nav.tsx');
    expect(nav).toContain('/escolar/configuracion/planta-fisica');
    expect(nav).toContain('soloConPlanta');
    const layout = leer('app/escolar/configuracion/layout.tsx');
    expect(layout).toContain('plantaFisicaDisponible');
  });

  it('las páginas del inventario son 404 si la planta no está configurada', () => {
    for (const ruta of ['app/escolar/inventario-aula/page.tsx', 'app/escolar/inventario-aula/[id]/page.tsx']) {
      const src = leer(ruta);
      expect(src, ruta).toContain('inventarioAulaVisible(await estadoPlantaDe(teamId))');
      expect(src, ruta).toContain('notFound()');
    }
  });

  it('todas las rutas nuevas llevan módulo escolar, permiso y filtran por el team de la sesión; las que escriben, con { escritura: true }', () => {
    const rutas: [string, boolean][] = [
      ['app/api/escolar/espacios/route.ts', true],
      ['app/api/escolar/espacios/[id]/route.ts', true],
      ['app/api/escolar/espacios/[id]/secciones/route.ts', true],
      ['app/api/escolar/espacios/arranque/route.ts', true],
      ['app/api/escolar/inventario-aula/route.ts', false],
      ['app/api/escolar/inventario-aula/activos/route.ts', true],
      ['app/api/escolar/inventario-aula/activos/[id]/route.ts', true],
      ['app/api/escolar/inventario-aula/trasladar/route.ts', true],
    ];
    for (const [ruta, escribe] of rutas) {
      const src = leer(ruta);
      expect(src, ruta).toContain("requireModuleAndPermission('escolar', 'administracion-escolar:");
      expect(src, ruta).toContain('auth.teamId');
      if (escribe) expect(src, ruta).toContain('{ escritura: true }');
    }
  });
});
