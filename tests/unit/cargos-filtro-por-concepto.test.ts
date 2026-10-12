/**
 * «Cargos y deudas» no dejaba encontrar los cargos de un concepto.
 *
 * El listado va paginado —50 de más de mil— y el buscador de la pantalla solo
 * mira la página que tiene cargada. Escribir el nombre de un concepto poco
 * usado devolvía «Sin resultados» aunque hubiera cargos suyos: estaban en una
 * página que nadie había abierto. Quien necesitaba verlos todos juntos —los
 * pagos de más que un colegio deja «a revisión», por ejemplo— tenía que entrar
 * ficha por ficha.
 *
 * El filtro se resuelve en el servidor, que es el único que ve el listado
 * entero.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(__dirname, '..', '..');
const lee  = (p: string) => readFileSync(join(raiz, p), 'utf8');

const ruta     = lee('app/api/administracion-escolar/cargos/route.ts');
const pantalla = lee('app/escolar/cargos/_page-client.tsx');

describe('el listado de cargos se puede pedir por concepto', () => {
  it('la ruta lee conceptoId', () => {
    expect(ruta).toContain("sp.get('conceptoId')");
  });

  it('filtra por el concepto del cargo, dentro del mismo colegio', () => {
    expect(ruta).toMatch(/where\.push\(eq\(adminEscolarCargos\.conceptoId, conceptoId\)\)/);
    expect(ruta).toContain('eq(adminEscolarCargos.teamId, teamId)');
  });

  it('un conceptoId vacío o que no es número no filtra nada, en vez de romper la consulta', () => {
    expect(ruta).toMatch(/Number\.isInteger\(conceptoId\) && conceptoId > 0/);
  });
});

describe('la pantalla ofrece el filtro', () => {
  it('manda el concepto elegido al servidor', () => {
    expect(pantalla).toMatch(/params\.set\('conceptoId', filtroConcepto\)/);
  });

  it('vuelve a pedir la lista cuando cambia', () => {
    expect(pantalla).toMatch(/\[filtroConcepto, filtroEstado, filtroPeriodo, pagina\]/);
  });

  it('cambiar de concepto vuelve a la primera página', () => {
    expect(pantalla).toMatch(/setPagina\(1\); setFiltroConcepto\(v\)/);
  });

  it('lista también los conceptos inactivos, que pueden tener cargos vivos', () => {
    expect(pantalla).toMatch(/\{conceptos\.map\(\(c\) => \(\s*<SelectItem key=\{c\.id\}/);
  });

  it('una lista vacía con un filtro puesto no dice que el colegio no tiene cargos', () => {
    expect(pantalla).toMatch(/const sinCargos = cargos\.length === 0 && !hayFiltro/);
    expect(pantalla).toMatch(/sinCargos \? 'Aún no hay cargos generados' : 'Sin resultados'/);
  });
});
