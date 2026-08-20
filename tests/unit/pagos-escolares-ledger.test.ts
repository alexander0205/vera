/**
 * La pantalla de Pagos del colegio lee donde están los pagos.
 *
 * Se movió el motor y se dejó el tablero conectado al viejo. El módulo escolar
 * dejó de registrar cobros propios —su POST devuelve 409 y lo dice: «todo cobro
 * va atado a la factura y vive en el ledger `pagos_recibidos`»— pero el GET
 * siguió leyendo `admin_escolar_pagos`, que desde entonces está vacía.
 *
 * Resultado: un colegio con RD$3.5 millones cobrados y 342 pagos registrados
 * abría Pagos y veía una tabla en blanco. No faltaban datos: faltaba mirar
 * donde estaban.
 *
 * El puente es la factura. `pagos_recibidos.ecf_document_id` apunta al
 * comprobante, y los cargos escolares que ese comprobante salda apuntan al
 * mismo id; de ahí salen el alumno, el concepto y el mes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz  = join(__dirname, '..', '..');
const ruta  = readFileSync(join(raiz, 'app/api/administracion-escolar/pagos/route.ts'), 'utf8');

/** Solo lo que se ejecuta: los comentarios nombran la tabla vieja a propósito. */
const codigo = ruta.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('de dónde lee la pantalla de Pagos', () => {
  it('lee del ledger de facturación', () => {
    expect(codigo).toContain('pagos_recibidos');
  });

  it('ya no lee la tabla vacía del módulo escolar', () => {
    expect(codigo).not.toContain('adminEscolarPagos');
    expect(codigo).not.toMatch(/FROM\s+admin_escolar_pagos/i);
  });

  it('cruza por la factura, que es lo único que une cobro y alumno', () => {
    expect(codigo).toContain('ecf_document_id');
    expect(codigo).toContain('admin_escolar_cargos');
  });

  it('solo trae cobros de este colegio', () => {
    // Dos veces: el cobro y los cargos del agregado.
    expect((codigo.match(/team_id = \$\{teamId\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('un cobro es una fila, aunque salde varios cargos', () => {
  it('los conceptos se agregan en vez de partir el pago', () => {
    // Quien paga el año completo hace UN pago; enseñarlo como cinco sería
    // inventar cobros que no ocurrieron.
    expect(codigo).toMatch(/string_agg\(DISTINCT/);
  });

  it('descarta las facturas sin cargo escolar detrás', () => {
    // Una venta del POS no es un pago del colegio.
    expect(codigo).toMatch(/d\.estudiante_id IS NOT NULL/);
  });
});

describe('el contrato con la pantalla no cambia', () => {
  const cliente = readFileSync(join(raiz, 'app/escolar/pagos/_page-client.tsx'), 'utf8');

  it('devuelve la misma forma: { pagos, total, pagina… }', () => {
    expect(codigo).toContain('pagos: pagina.datos');
  });

  it.each(['estudianteId','estudiante','estudianteApellidos','concepto','mes','anio','montoCentavos','fechaPago','metodo','referencia'])(
    'sigue trayendo «%s», que la pantalla pinta', (campo) => {
      expect(cliente).toContain('p.' + campo);
      expect(codigo).toMatch(new RegExp(`"${campo}"|\\b${campo}\\b`));
    });

  it('el filtro por alumno sigue funcionando', () => {
    expect(codigo).toContain('estudianteId');
    expect(codigo).toMatch(/g\.estudiante_id = \$\{estudianteId\}/);
  });
});

describe('el POST sigue cerrado', () => {
  it('no se abre un segundo sistema de cobro por la puerta de atrás', () => {
    expect(ruta).toContain('DEPRECADO');
    expect(ruta).toMatch(/status:\s*409/);
  });
});
