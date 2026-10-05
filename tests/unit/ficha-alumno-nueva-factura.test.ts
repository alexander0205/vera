/**
 * En la ficha del alumno no había forma de empezar una factura.
 *
 * El botón que hay al lado del período era «Reinscribir», que se usa una vez
 * al año. Para facturar había que ir fila por fila, a los tres puntos de cada
 * mes, o saber que las casillas de la tabla servían para eso. La ficha del
 * responsable de pago sí tiene «Nueva factura»: abre el cajón con todo lo que
 * la familia debe sin facturar. Aquí hace lo mismo con lo del alumno.
 *
 * El cajón del alumno solo entendía `?factura=c:…` y `?factura=p:…`; con
 * `nueva` no abría nada. Ahora la entiende igual que el de la familia, y
 * recibe al responsable para el caso en que no queda ningún cargo: sin él el
 * formulario abría sin comprador ni beneficiarios.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(__dirname, '..', '..');
const lee  = (p: string) => readFileSync(join(raiz, p), 'utf8');

const ficha   = lee('app/escolar/estudiantes/[id]/_perfil-client.tsx');
const periodo = lee('components/administracion-escolar/PeriodoDetalle.tsx');
const familia = lee('app/escolar/responsables/[id]/_perfil-client.tsx');

describe('la ficha del alumno ofrece «Nueva factura»', () => {
  it('el botón existe y lleva el mismo nombre que en la ficha de la familia', () => {
    expect(ficha).toMatch(/<Receipt className="mr-1\.5 h-4 w-4" \/>Nueva factura/);
    expect(familia).toMatch(/<Receipt className="mr-1\.5 h-4 w-4" \/>Nueva factura/);
  });

  it('«Reinscribir» ya no se ofrece ahí', () => {
    expect(ficha).not.toMatch(/'Reinscribir'/);
    expect(ficha).not.toMatch(/>Reinscribir</);
  });

  it('al que nunca estuvo matriculado se le sigue ofreciendo inscribirlo', () => {
    expect(ficha).toMatch(/matriculas\.length === 0 \? \(/);
    expect(ficha).toMatch(/<Plus className="h-4 w-4 mr-1\.5" \/>Inscribir/);
  });

  it('abre el cajón y vuelve a «Por período» en un solo cambio de URL', () => {
    expect(ficha).toMatch(/setParams\(\{ tab: null, factura: 'nueva' \}\)/);
  });

  it('solo sale a quien puede facturar y con un responsable al que emitirle', () => {
    expect(ficha).toMatch(/puedeFacturar && grupoActivo && responsable && \(/);
  });
});

describe('el cajón del alumno entiende «factura nueva»', () => {
  it('cualquier valor que no sea c: ni p: abre una factura nueva, como en la familia', () => {
    expect(periodo).toMatch(/return \{ cargos: null, previsto: null \};\n  \}, \[enCurso\]\);/);
  });

  it('arranca de lo que el alumno debe sin facturar y con saldo', () => {
    expect(periodo).toMatch(/cajon\?\.cargos \?\? cargosSinFactura\s*\.filter\(\(c\) => c\.saldoCentavos > 0\)/);
  });

  it('un mes adelantado no arrastra los demás cargos', () => {
    expect(periodo).toMatch(/cargosIniciales=\{cajon\?\.previsto \? \[\] : \(/);
  });

  it('recibe al responsable para cuando no queda nada que facturar', () => {
    expect(periodo).toContain('clienteInicial={clienteInicial ?? null}');
    expect(ficha).toMatch(/clienteInicial=\{responsable \? \{/);
  });
});
