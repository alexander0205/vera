/**
 * Una beca se puede poner después de matricular.
 *
 * Antes solo se admitía al crear la matrícula. El PATCH ignoraba los tres
 * campos, y borrar la matrícula para rehacerla devuelve 409 en cuanto tiene un
 * cargo — que es siempre, porque el alta genera la deuda en la misma
 * transacción.
 *
 * O sea que un colegio que aprueba una beca en octubre no tenía dónde
 * anotarla. Y en octubre es cuando se aprueban: cuando una familia deja de
 * pagar y viene a hablar, no en agosto al inscribir.
 *
 * Salió al rehacer los datos de la demo por la API en vez de por SQL. Escribir
 * la columna a mano lo había tapado.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz  = join(__dirname, '..', '..');
const patch = readFileSync(join(raiz, 'app/api/administracion-escolar/matriculas/[id]/route.ts'), 'utf8');
const post  = readFileSync(join(raiz, 'app/api/administracion-escolar/matriculas/route.ts'), 'utf8');

describe('el PATCH acepta la beca', () => {
  it('lee los tres campos del cuerpo', () => {
    for (const c of ['becaTipo', 'becaValor', 'becaMotivo']) expect(patch).toContain(c);
  });

  it('los escribe en la matrícula', () => {
    expect(patch).toMatch(/becaTipo:\s*becaTipoOk/);
    expect(patch).toMatch(/becaValor:\s*becaValorOk/);
  });

  it('no toca la beca si no viene ninguno de los tres', () => {
    // Sin esto, editar el curso borraría la beca del alumno.
    expect(patch).toMatch(/const tocaBeca =/);
    expect(patch).toMatch(/\.\.\.\(tocaBeca \?/);
  });
});

describe('valida igual que el alta: una sola verdad', () => {
  it('solo admite los dos tipos que admite el POST', () => {
    const tiposEnPost  = post.match(/becaTipo === 'porcentaje' \|\| becaTipo === 'monto'/);
    const tiposEnPatch = patch.match(/becaTipo === 'porcentaje' \|\| becaTipo === 'monto'/);
    expect(tiposEnPost).not.toBeNull();
    expect(tiposEnPatch).not.toBeNull();
  });

  it('un tipo inventado se rechaza en vez de guardarse como null', () => {
    expect(patch).toMatch(/solo puede ser «porcentaje» o «monto»/);
    expect(patch).toMatch(/status:\s*400/);
  });

  it('una beca sin valor se rechaza', () => {
    expect(patch).toMatch(/necesita su valor/);
  });

  it('el porcentaje se acota entre 1 y 100', () => {
    expect(patch).toMatch(/becaValorOk! <= 0 \|\| becaValorOk! > 100/);
  });

  it('el monto tiene que ser positivo', () => {
    expect(patch).toMatch(/'monto' && becaValorOk! <= 0/);
  });
});

describe('quitar la beca la quita entera', () => {
  it('sin tipo no queda ni valor ni motivo suelto', () => {
    // Un motivo huérfano deja en la ficha el porqué de algo que ya no está.
    expect(patch).toMatch(/becaMotivo: becaTipoOk \?/);
    expect(patch).toMatch(/becaValor:\s*becaValorOk/);
  });
});
