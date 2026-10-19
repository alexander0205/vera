import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `SelectorCurso` es para MATRICULAR: su valor es UNA sección. Tuvo un modo
 * filtro añadido encima que no podía funcionar (un servicio entero no cabe en
 * un id de sección). Estas pruebas vivían en `filtro-curso.test.ts`, que se fue
 * con la pantalla «Cargo a varios alumnos».
 */
const selectorMatricular = readFileSync(
  join(__dirname, '..', '..', 'components/administracion-escolar/SelectorCurso.tsx'), 'utf8');

describe('el selector de matricular vuelve a servir solo para matricular', () => {
  it('ya no tiene el modo filtro que se le añadió encima', () => {
    expect(selectorMatricular).not.toContain('permitirTodos');
    expect(selectorMatricular).not.toContain("'todos'");
  });

  it('sigue pidiendo exactamente una sección', () => {
    expect(selectorMatricular).toContain('<Label>Sección *</Label>');
    expect(selectorMatricular).toContain("onChange={(e) => onChange(e.target.value)}");
  });
});
