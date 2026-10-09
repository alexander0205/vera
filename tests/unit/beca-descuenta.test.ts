/**
 * Una beca aprobada tiene que rebajar algo.
 *
 * La cadena estaba entera menos un eslabón: el motor de tarifas aplica la beca,
 * la matrícula la guarda, el listado de conceptos devuelve `admiteBeca`… y
 * `admiteBeca` no se podía escribir por ninguna parte. Ni el POST ni el PATCH
 * lo aceptaban, así que todos los conceptos nacían en `false` y ahí se
 * quedaban.
 *
 * Resultado: se aprueba una beca del 100% y el alumno sigue debiendo la
 * colegiatura completa. Comprobado en la cuenta de prueba — ocho becados al
 * 100% con colegiatura media de RD$5,270, la misma que los demás.
 *
 * Salió al aplicar las becas por la API. Escribiendo la columna a mano no se
 * veía: la beca quedaba guardada y parecía funcionar.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz  = join(__dirname, '..', '..');
const post  = readFileSync(join(raiz, 'app/api/administracion-escolar/conceptos/route.ts'), 'utf8');
const patch = readFileSync(join(raiz, 'app/api/administracion-escolar/conceptos/[id]/route.ts'), 'utf8');

describe('admiteBeca se puede escribir', () => {
  it('el alta lo acepta', () => {
    expect(post).toMatch(/const \{[^}]*admiteBeca[^}]*\} = body/);
    expect(post).toMatch(/admiteBeca: admiteBeca === true/);
  });

  it('la edición lo acepta', () => {
    expect(patch).toMatch(/const \{[^}]*admiteBeca[^}]*\} = body/);
    expect(patch).toMatch(/admiteBeca !== undefined \? \{ admiteBeca: admiteBeca === true \}/);
  });

  it('editar otra cosa no lo pisa', () => {
    // Sin el `!== undefined`, renombrar un concepto apagaría su beca.
    expect(patch).toMatch(/\.\.\.\(admiteBeca !== undefined \?/);
  });
});

describe('el valor por defecto es prudente', () => {
  it('un concepto nuevo NO admite beca salvo que se pida', () => {
    // Una beca cubre la mensualidad, no la inscripción ni el uniforme.
    // Encenderlo por defecto rebajaría cobros que nadie quiso rebajar.
    expect(post).toMatch(/admiteBeca: admiteBeca === true/);
    expect(post).not.toMatch(/admiteBeca: admiteBeca \?\? true/);
  });

  it('solo `true` cuenta como sí: una cadena no enciende una rebaja', () => {
    expect(post).toContain('admiteBeca === true');
    expect(patch).toContain('admiteBeca === true');
  });
});
