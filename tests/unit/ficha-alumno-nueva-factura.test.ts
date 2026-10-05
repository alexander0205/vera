/**
 * «Nueva factura» desde la ficha del alumno y desde la del responsable de pago.
 *
 * Tres cosas que no estaban:
 *
 * 1. En la ficha del alumno no había forma de empezar una factura. El botón que
 *    acompaña al período era «Reinscribir», que se usa una vez al año; para
 *    facturar había que ir a los tres puntos de cada mes. Ahora tiene el mismo
 *    «Nueva factura» que la ficha de la familia, y su cajón entiende
 *    `?factura=nueva`.
 *
 * 2. «Nueva factura» abría con TODO lo que se debía sin facturar ya metido en
 *    líneas: en un colegio que carga el año entero al matricular, nueve meses
 *    de colegiatura para quien venía a cobrar uno. Ahora abre vacía, con el
 *    comprador puesto, y lo que se debe se OFRECE en el buscador de productos.
 *
 * 3. Ese buscador no ofrecía ningún mes. Filtraba las cuotas comparando el id
 *    del alumno de Gobernanza con el id del beneficiario de la línea, que son
 *    números distintos: solo salían los productos genéricos del catálogo, sin
 *    el precio del alumno y sin atar la factura a su cargo.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(__dirname, '..', '..');
const lee  = (p: string) => readFileSync(join(raiz, p), 'utf8');

const ficha      = lee('app/escolar/estudiantes/[id]/_perfil-client.tsx');
const periodo    = lee('components/administracion-escolar/PeriodoDetalle.tsx');
const familia    = lee('app/escolar/responsables/[id]/_perfil-client.tsx');
const cajon      = lee('components/administracion-escolar/FacturaDrawer.tsx');
const envoltorio = lee('app/(dashboard)/dashboard/facturas/nueva/_nueva-factura-client.tsx');
const formulario = lee('app/(dashboard)/dashboard/facturas/nueva/NuevaFacturaForm.tsx');

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

  it('su cajón entiende «factura nueva», como el de la familia', () => {
    expect(periodo).toMatch(/return \{ cargos: null, previsto: null \};\n  \}, \[enCurso\]\);/);
  });

  it('recibe al responsable para cuando no queda nada que facturar', () => {
    expect(periodo).toContain('clienteInicial={clienteInicial ?? null}');
    expect(ficha).toMatch(/clienteInicial=\{responsable \? \{/);
  });
});

describe('«Nueva factura» abre vacía en las dos fichas', () => {
  it('ninguna de las dos mete en líneas lo que se debe', () => {
    expect(periodo).toContain('cargosIniciales={cajon?.cargos ?? []}');
    expect(familia).toContain('cargosIniciales={cajon?.cargos ?? []}');
    expect(familia).not.toMatch(/cargosIniciales=\{[^}]*sinFacturar/);
    expect(periodo).not.toMatch(/cargosIniciales=\{[^}]*cargosSinFactura/);
  });

  it('lo que se debe se pasa aparte, solo en la factura nueva a secas', () => {
    // Con cargos elegidos o con un mes adelantado no se ofrece nada más: esos
    // caminos ya traen su propia lista.
    const condicion = /cargosOfrecidos=\{cajon && !cajon\.cargos && !cajon\.previsto/;
    expect(periodo).toMatch(condicion);
    expect(familia).toMatch(condicion);
  });

  it('solo se ofrece lo que no tiene factura y aún tiene saldo', () => {
    expect(periodo).toMatch(/\? cargosSinFactura\.filter\(\(c\) => c\.saldoCentavos > 0\)\.map\(\(c\) => c\.id\)/);
    expect(familia).toMatch(/\? sinFacturar\.map\(\(g\) => g\.id\)/);
    expect(familia).toMatch(/g\.ecfDocumentId == null && g\.saldoCentavos > 0 && COBRABLES\.includes\(g\.estado\)/);
  });

  it('la lista llega hasta el formulario', () => {
    expect(cajon).toContain('cargosOfrecidos={cargosOfrecidos}');
    expect(envoltorio).toContain('cargosOfrecidos={cargosOfrecidos}');
  });
});

describe('el formulario ofrece los cargos sin ponerlos en la factura', () => {
  it('pone al comprador sin esperar a la lista y la pide por detrás', () => {
    expect(formulario).toMatch(
      /if \(cargosOfrecidos\?\.length\) \{\s*if \(clienteInicial\) seleccionarCliente\(clienteInicial\);\s*cargarPrefillEscolar\(cargosOfrecidos, null, true\);/,
    );
  });

  it('en ese modo no añade líneas ni apunta cargos de origen', () => {
    // El `return` va después de alimentar el buscador y antes de leer las marcadas.
    const alimenta = formulario.indexOf('setOpcionesEscolares(\n');
    const corta    = formulario.indexOf('if (soloOfrecer) return;');
    const marcadas = formulario.indexOf('const elegidas = (datos.opciones ?? []).filter((o) => o.seleccionado);');
    expect(alimenta).toBeGreaterThan(0);
    expect(corta).toBeGreaterThan(alimenta);
    expect(marcadas).toBeGreaterThan(corta);
  });

  it('con cargos elegidos sigue precargándolos: ese camino manda sobre el otro', () => {
    const elegidos  = formulario.indexOf('if (previsto || cargosIniciales?.length) {');
    const ofrecidos = formulario.indexOf('if (cargosOfrecidos?.length) {');
    expect(elegidos).toBeGreaterThan(0);
    expect(ofrecidos).toBeGreaterThan(elegidos);
  });

  it('si la lista no carga lo avisa sin tumbar la factura', () => {
    expect(formulario).toMatch(/if \(soloOfrecer\) \{\s*toast\.warning\(/);
  });
});

describe('el buscador de productos ofrece los meses del alumno', () => {
  it('los empareja por el beneficiario de la línea, no por el id del alumno', () => {
    expect(formulario).toContain('.filter((o) => o.linea?.dependienteId === dependienteId)');
    expect(formulario).not.toContain('.filter((o) => o.estudianteId === dependienteId)');
  });

  it('el precio es el del cargo de ese alumno, no el de la lista', () => {
    expect(formulario).toMatch(/precioDOP: Number\(o\.linea!\.precioUnitarioItem\) \|\| 0/);
  });

  it('elegir un mes deja la factura atada a su cargo', () => {
    expect(formulario).toMatch(/cuotaClave: `\$\{c\.estudianteId\}:\$\{c\.cargoId\}:\$\{c\.mes \?\? 0\}:\$\{c\.anio\}`/);
    expect(formulario).toMatch(/\[\.\.\.prev, \{ id: c\.cargoId, saldoCentavos: c\.saldoCentavos \}\]/);
  });
});
