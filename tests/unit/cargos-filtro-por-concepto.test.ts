/**
 * El listado de cargos se puede pedir por concepto.
 *
 * El listado va paginado —50 de más de mil— y un buscador en el cliente solo
 * mira la página que tiene cargada: un concepto poco usado devolvía «Sin
 * resultados» aunque hubiera cargos suyos en otra página.
 *
 * El filtro se resuelve en el servidor, que es el único que ve el listado
 * entero. La pantalla «Cargos y deudas» que lo usaba se quitó; la ruta se
 * queda porque la siguen pidiendo la ficha del alumno y la matrícula.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(__dirname, '..', '..');
const lee  = (p: string) => readFileSync(join(raiz, p), 'utf8');

const ruta = lee('app/api/administracion-escolar/cargos/route.ts');

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
