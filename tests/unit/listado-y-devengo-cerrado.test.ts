/**
 * Dos huecos que solo aparecen usando la API desde fuera de la pantalla.
 *
 * 1. El listado de estudiantes paginaba con `limit`/`offset` mientras el resto
 *    de la API usa `pagina`/`porPagina`. Pedir `porPagina=200` no fallaba: caía
 *    al defecto de 25 y devolvía 25 de 180 sin decir nada. Quien recorría el
 *    listado creyendo haberlo recorrido entero se dejaba 155 alumnos fuera, y
 *    el bucle terminaba «bien».
 *
 * 2. `devengarPeriodo` solo miraba matrículas 'activa'. Un colegio que cierra
 *    el año —o que sube su histórico— no podía generar los cargos de un período
 *    terminado: había que reabrir las matrículas una a una, devengar, y volver
 *    a cerrarlas. Tres pasos para algo que el sistema ya sabe hacer.
 *
 * Los dos salieron montando la cuenta de prueba por la API en vez de a mano.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(__dirname, '..', '..');
const lee  = (p: string) => readFileSync(join(raiz, p), 'utf8');

const listado  = lee('app/api/administracion-escolar/estudiantes/route.ts');
const devengar = lee('lib/administracion-escolar/devengar.ts');
const rutaDev  = lee('app/api/administracion-escolar/cargos/devengar/route.ts');

describe('el listado de estudiantes acepta la paginación de la casa', () => {
  it('entiende porPagina y pagina', () => {
    expect(listado).toContain("sp.get('porPagina')");
    expect(listado).toContain("sp.get('pagina')");
  });

  it('sigue aceptando limit/offset, que es lo que usa la pantalla', () => {
    expect(listado).toContain("sp.get('limit')");
    expect(listado).toContain("sp.get('offset')");
  });

  it('porPagina manda cuando viene', () => {
    expect(listado).toMatch(/const limit\s*=\s*porPagina \|\|/);
  });

  it('calcula el salto desde la página, no desde offset, cuando se usa porPagina', () => {
    expect(listado).toMatch(/porPagina \? \(pagina - 1\) \* porPagina/);
  });
});

describe('un año cerrado se puede devengar', () => {
  it('devengarPeriodo acepta incluir las finalizadas', () => {
    expect(devengar).toMatch(/incluirFinalizadas\s*=\s*false/);
  });

  it('apagado por defecto: el cron no genera deuda a quien ya terminó', () => {
    // La bandera va con default false justamente por el cron mensual.
    expect(devengar).toMatch(/incluirFinalizadas = false/);
  });

  it('encendida, mira activa Y finalizada', () => {
    expect(devengar).toMatch(/inArray\(adminEscolarMatriculas\.estado, \['activa', 'finalizada'\]\)/);
  });

  it('apagada, sigue mirando solo activa', () => {
    expect(devengar).toMatch(/eq\(adminEscolarMatriculas\.estado, 'activa'\)/);
  });

  it('el endpoint la expone y solo la enciende si se pide explícitamente', () => {
    expect(rutaDev).toMatch(/cuerpo\?\.incluirFinalizadas === true/);
    expect(rutaDev).toMatch(/devengarPeriodo\(teamId, periodo\.id, hasta, incluirFinalizadas\)/);
  });

  it('la respuesta dice si se incluyeron, para que no se adivine', () => {
    expect(rutaDev).toMatch(/incluirFinalizadas,/);
  });
});
