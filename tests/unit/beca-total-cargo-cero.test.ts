/**
 * Un becado del 100% también tiene cargo, y vale cero.
 *
 * La validación era `montoFinal <= 0` → 400. Y la tarifa de un exonerado
 * resuelve exactamente en cero, así que el alta se caía con «El monto resuelto
 * no es válido».
 *
 * El efecto no era un error visible sino una ausencia: el hijo de empleado
 * exonerado no tenía cargo, y sin cargo no sale en el estado de cuenta, ni en
 * la matrícula, ni en los avisos. Desaparecía como si no estuviera inscrito.
 *
 * Comprobado en la cuenta de prueba: de 280 cargos de becados, 80 rechazados —
 * los 8 alumnos con beca total, sus diez meses cada uno.
 *
 * Un cargo de cero es la forma de decir «esto se cobra, y cuesta nada»: queda
 * el registro, y el día que se le quite la beca hay dónde ponerle el precio.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ruta = readFileSync(
  join(__dirname, '..', '..', 'app/api/administracion-escolar/cargos/route.ts'), 'utf8');
const codigo = ruta.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('cero deja de ser un error por sí solo', () => {
  it('ya no rechaza todo lo que sea <= 0', () => {
    expect(codigo).not.toMatch(/montoFinal <= 0/);
  });

  it('lo negativo sigue prohibido', () => {
    expect(codigo).toMatch(/montoFinal < 0/);
  });

  it('un entero sigue siendo obligatorio', () => {
    expect(codigo).toMatch(/!Number\.isInteger\(montoFinal\)/);
  });
});

describe('cero solo se acepta si lo produjo una beca', () => {
  it('el permiso depende de que el monto NO viniera del llamador', () => {
    // Si alguien manda montoCentavos: 0 a mano, no hay beca detrás: se rechaza.
    expect(codigo).toMatch(/const exonerado = montoCentavos == null && montoFinal === 0/);
  });

  it('un cero escrito a mano se rechaza', () => {
    expect(codigo).toMatch(/montoFinal === 0 && !exonerado/);
  });

  it('el error dice cuál es la única forma de llegar a cero', () => {
    expect(ruta).toMatch(/Solo una beca puede dejarlo en cero/);
  });
});
