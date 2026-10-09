/**
 * El lector de PDF tiene que viajar entero a la función de Vercel.
 *
 * pdf.js hace `new DOMMatrix()` nada más cargarse. En Node eso no existe y lo
 * toma de `@napi-rs/canvas`, que pide con un `require` armado en tiempo de
 * ejecución: el trazado de Next no lo ve y la librería se queda fuera del
 * despliegue. En local y en estas pruebas está todo `node_modules` delante,
 * así que nada falla. En producción la ruta que lee las fichas de SIGERD
 * contestaba 500 a cualquier petición —«Failed to load external module
 * pdf-parse: ReferenceError: DOMMatrix is not defined»—, y el PDF de un
 * comprobante se habría quedado en «complétalo a mano» sin pasar siquiera por
 * la lectura con IA.
 *
 * Lo arregla una línea, de las que se borran «porque no hace nada»: importar
 * `pdf-parse/worker` ANTES que `pdf-parse`. Ese módulo importa
 * `@napi-rs/canvas` a la vista —y entonces sí se copia, con su binario—, pone
 * los globales que pdf.js espera y deja cargado el worker.
 *
 * Estas pruebas están para que esa línea no se borre.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const raiz = join(__dirname, '..', '..');
const lee  = (p: string) => readFileSync(join(raiz, p), 'utf8');

const captura = lee('lib/compras/captura/pdf.ts');
const sigerd  = lee('lib/sigerd/ficha-pdf.ts');

/** Todos los .ts/.tsx de una carpeta, sin entrar en node_modules. */
function fuentes(carpeta: string): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(carpeta, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) salida.push(...fuentes(ruta));
    else if (/\.tsx?$/.test(e.name)) salida.push(ruta);
  }
  return salida;
}

/**
 * Carga de verdad. Un `import type` se borra al compilar y no cuenta; tampoco
 * un comentario que nombre el import, y por eso el dinámico se busca con su
 * `await` delante.
 */
const CARGA_PDF_PARSE = /(?:^|\n)import\s+(?!type\b)[^;\n]*from\s+'pdf-parse'|await import\('pdf-parse'\)|require\('pdf-parse'\)/;
const CARGA_WORKER    = /(?:^|\n)import\s+'pdf-parse\/worker'|await import\('pdf-parse\/worker'\)/;

describe('nadie carga pdf-parse sin cargar antes su worker', () => {
  it('en toda la app: quien lo carga, carga primero `pdf-parse/worker`', () => {
    const sinWorker: string[] = [];
    let cargan = 0;
    for (const ruta of [...fuentes(join(raiz, 'app')), ...fuentes(join(raiz, 'lib'))]) {
      const texto = readFileSync(ruta, 'utf8');
      const carga = texto.search(CARGA_PDF_PARSE);
      if (carga < 0) continue;
      cargan++;
      const worker = texto.search(CARGA_WORKER);
      if (worker < 0 || worker > carga) sinWorker.push(relative(raiz, ruta));
    }
    // Si esto da cero es que la expresión dejó de encontrar los imports, no que
    // ya no haya ninguno: los dos de abajo existen.
    expect(cargan).toBeGreaterThanOrEqual(2);
    expect(sinWorker).toEqual([]);
  });

  it('las fichas de SIGERD: el worker va en la línea de antes', () => {
    const worker = sigerd.indexOf("import 'pdf-parse/worker';");
    const lector = sigerd.indexOf("import { PDFParse } from 'pdf-parse';");
    expect(worker).toBeGreaterThan(-1);
    expect(lector).toBeGreaterThan(worker);
  });

  it('los comprobantes: una sola puerta, y en ese orden', () => {
    expect(captura).toMatch(
      /async function cargarPdfParse\(\)[^{]*\{\s*await import\('pdf-parse\/worker'\);\s*return \(await import\('pdf-parse'\)\)\.PDFParse;\s*\}/,
    );
    // Fuera de esa función no se carga por otro lado.
    expect(captura.match(/await import\('pdf-parse'\)/g)).toHaveLength(1);
    expect(captura).not.toMatch(/\nimport \{[^}]*\} from 'pdf-parse'/);
  });
});

describe('si el lector de PDF no carga, la factura sigue hacia la IA', () => {
  // Con el `import` fuera del `try`, el fallo se escapaba de la función, cortaba
  // el proceso entero de la captura y la dejaba «a mano» sin intentar nada más.
  for (const funcion of ['imagenesDePdf', 'pintarPrimeraPagina']) {
    it(`${funcion} carga la librería dentro de su try`, () => {
      const desde = captura.indexOf(`export async function ${funcion}(`);
      expect(desde).toBeGreaterThan(-1);
      const cuerpo = captura.slice(desde, captura.indexOf('} finally {', desde));
      const abre  = cuerpo.indexOf('try {');
      const carga = cuerpo.indexOf('await cargarPdfParse()');
      const cierra = cuerpo.indexOf('} catch (e) {');
      expect(abre).toBeGreaterThan(-1);
      expect(carga).toBeGreaterThan(abre);
      expect(cierra).toBeGreaterThan(carga);
    });
  }
});

describe('el worker da lo que pdf.js pide', () => {
  it('después de importarlo existen DOMMatrix, ImageData y Path2D', async () => {
    // Es el contrato del que depende todo lo de arriba: si una versión nueva de
    // pdf-parse dejara de ponerlos, la línea seguiría ahí y no serviría de nada.
    await import('pdf-parse/worker');
    const g = globalThis as Record<string, unknown>;
    expect(typeof g.DOMMatrix).toBe('function');
    expect(typeof g.ImageData).toBe('function');
    expect(typeof g.Path2D).toBe('function');
  });
});
