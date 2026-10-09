/**
 * Una factura guarda sus líneas, la pida quien la pida.
 *
 * `items` es lo que se factura; `lineas_json` es la copia que la pantalla, el
 * PDF y los reportes leen después. El formulario grande manda las dos cosas,
 * así que el hueco no se veía nunca desde la interfaz.
 *
 * Pero quien llame a la API con solo `items` —una integración, un script, el
 * módulo escolar facturando un cargo— recibía un documento con su total
 * correcto y la tabla de productos VACÍA. Y dependía de la ruta: la de emisión
 * ya caía a `items`, las dos de borrador guardaban `null`. La misma petición
 * daba un resultado u otro según el modo.
 *
 * Salió al montar la demo: 382 facturas del colegio, todas con `lineas_json`
 * en NULL, y la pantalla de la factura sin una sola línea.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ruta = readFileSync(
  join(__dirname, '..', '..', 'app/api/ecf/emitir/route.ts'), 'utf8');

/** Sin comentarios: el de arriba nombra el patrón viejo para contar la historia. */
const codigo = ruta.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('todas las rutas guardan las líneas igual', () => {
  it('ninguna deja lineasJson en null', () => {
    expect(codigo).not.toMatch(/lineasJson:\s*data\.lineasJson \?\? null/);
  });

  it('las cuatro pasan por la misma función', () => {
    const usos = (codigo.match(/lineasParaGuardar\(data\)/g) ?? []).length;
    expect(usos).toBeGreaterThanOrEqual(4);
  });

  it('la lógica está escrita UNA vez, no copiada en cada ruta', () => {
    // Duplicarla es exactamente cómo las cuatro rutas divergieron: tres
    // guardaban null y una caía a items.
    const copias = (codigo.match(/JSON\.stringify\(data\.items\.map/g) ?? []).length;
    expect(copias).toBe(1);
  });
});

describe('la copia deriva de items, no se exige aparte', () => {
  it('cae a items cuando el llamador no manda lineasJson', () => {
    expect(codigo).toMatch(/return data\.lineasJson \?\? JSON\.stringify\(data\.items\.map/);
  });

  it('respeta lineasJson si viene: el formulario manda el suyo', () => {
    expect(codigo).toMatch(/data\.lineasJson \?\?/);
  });

  it('copia lo que la pantalla necesita para pintar la línea', () => {
    for (const campo of ['nombreItem','descripcionItem','cantidadItem','precioUnitarioItem','tasaItbis','subtotalConItbis']) {
      expect(codigo).toContain(campo);
    }
  });

  it('conserva el vínculo al producto y a la variante', () => {
    // Sin esto, la línea se ve pero el inventario no sabe qué se vendió.
    expect(codigo).toMatch(/productoId:\s*item\.productoId \?\? null/);
    expect(codigo).toMatch(/variantId:\s*item\.variantId \?\? null/);
  });
});
