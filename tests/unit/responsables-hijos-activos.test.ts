/**
 * «Hijos matriculados» son los que están en el colegio.
 *
 * La ficha del responsable de pago contaba a TODOS los alumnos que colgaban
 * del contacto, también a los retirados. Una madre con un solo hijo salía con
 * «2 hijos matriculados» porque al niño lo habían registrado dos veces y la
 * ficha repetida, ya retirada, seguía apuntando a ella; al ir a facturarle, la
 * factura ofrecía un beneficiario —el de verdad— y la pantalla decía dos.
 *
 * Y por la misma cuenta la lista decía 149 familias en un colegio donde pagan
 * 118: las demás ya no tienen a nadie dentro.
 *
 * Lo que queda:
 *   · «hijo» = alumno activo. Un no activo solo se enseña si dejó algo
 *     debiendo, porque eso hay que seguir cobrándolo;
 *   · la familia sin hijos activos sale de la lista —salvo que deba— y vive en
 *     su propio filtro;
 *   · la cabecera de la familia y las tarjetas de sus hijos usan EL MISMO
 *     corte, para que no puedan decir números distintos.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(__dirname, '..', '..');
const lee  = (p: string) => readFileSync(join(raiz, p), 'utf8');

const consulta = lee('lib/administracion-escolar/responsables.ts');
const rutaLista = lee('app/api/administracion-escolar/responsables/route.ts');
const rutaPeriodos = lee('app/api/administracion-escolar/responsables/[id]/periodos/route.ts');
const perfil = lee('app/escolar/responsables/[id]/_perfil-client.tsx');
const lista = lee('app/escolar/responsables/_page-client.tsx');
const tarjetas = lee('components/administracion-escolar/PeriodosDeLaFamilia.tsx');

describe('la lista de responsables cuenta solo a los activos', () => {
  it('«alumnos» son los activos; «fichas», todos los que cuelgan del contacto', () => {
    expect(consulta).toMatch(/count\(DISTINCT e\.id\) FILTER \(WHERE e\.estado = 'activo'\) AS alumnos/);
    expect(consulta).toMatch(/count\(DISTINCT e\.id\) AS fichas/);
  });

  it('la deuda no se recorta: lo que dejó debiendo un retirado se sigue debiendo', () => {
    // El LEFT JOIN a los cargos no lleva condición sobre el estado del alumno.
    const lateral = consulta.slice(consulta.indexOf('AS alumnos,'), consulta.indexOf(') a ON true'));
    expect(lateral).toMatch(/SUM\(g\.saldo_centavos\) AS deuda/);
    expect(lateral).not.toMatch(/g\.[^\n]*e\.estado/);
  });

  it('una familia es vigente si tiene un hijo activo, o si sin tenerlo debe algo', () => {
    expect(consulta).toMatch(/const vigente = sql`\(alumnos > 0 OR \(fichas > 0 AND \$\{debe\}\)\)`/);
    expect(consulta).toMatch(/const retirada = sql`\(fichas > 0 AND alumnos = 0 AND NOT \$\{debe\}\)`/);
  });

  it('«falta traerlas» son las que no tienen NINGUNA ficha, no las de fichas retiradas', () => {
    // Con `alumnos = 0` una familia retirada se ofrecía para «traerla» otra vez.
    expect(consulta).toMatch(/const sinFichaEscolar = sql`fichas = 0`/);
    expect(consulta).not.toMatch(/sql`alumnos = 0`/);
  });

  it('las cifras de la cabecera son de las vigentes', () => {
    expect(consulta).toMatch(/count\(\*\) FILTER \(WHERE \$\{vigente\}\)::int\s+familias/);
    expect(consulta).toMatch(/count\(\*\) FILTER \(WHERE \$\{retirada\}\)::int\s+retiradas/);
  });

  it('buscando en «Todas» se encuentra también a la que ya no tiene hijos activos', () => {
    expect(consulta).toMatch(/filtro === 'todos' && q\s*\?\s*conFicha\s*:\s*vigente/);
  });

  it('se puede buscar por cédula o RNC, con guiones o sin ellos', () => {
    expect(consulta).toMatch(/coincideDocumento\(sql`c\.rnc`, q\)/);
    expect(lista).toMatch(/placeholder="Buscar por nombre, cédula o RNC…"/);
  });
});

describe('el paginador cuenta lo que se está mirando', () => {
  it('el total sale del mismo filtro y la misma búsqueda que las filas', () => {
    // Salía del conteo de la cabecera —que no mira filtro ni texto— y «Con
    // deuda» anunciaba las mismas páginas que la lista entera, las últimas vacías.
    expect(consulta).toMatch(/SELECT count\(\*\)::int AS n FROM \(\$\{conFiltro\}\) x/);
    expect(consulta).toMatch(/total: Number\(\(cuantas as unknown as Record<string, unknown>\[\]\)\[0\]\?\.n \?\? 0\)/);
  });

  it('la ruta valida contra la lista de filtros de la consulta, no contra una copia', () => {
    // La copia no tenía «sin-ficha»: la pastilla «Falta traerlas» caía a «todos».
    expect(rutaLista).toMatch(/FILTROS_RESPONSABLES\.includes\(filtro as FiltroResponsables\)/);
    expect(rutaLista).not.toMatch(/const FILTROS:/);
    for (const f of ['todos', 'con-deuda', 'sin-contacto', 'sin-ficha', 'retiradas']) {
      expect(consulta).toContain(`'${f}'`);
    }
  });
});

describe('la ficha de la familia y sus tarjetas enseñan a los mismos hijos', () => {
  it('la cabecera trae a los activos y a los que deben', () => {
    expect(consulta).toMatch(/HAVING e\.estado = 'activo' OR COALESCE\(SUM\(g\.saldo_centavos\), 0\) > 0/);
  });

  it('las tarjetas usan el mismo corte', () => {
    expect(rutaPeriodos).toMatch(/eq\(adminEscolarEstudiantes\.estado, 'activo'\)/);
    expect(rutaPeriodos).toMatch(/\$\{adminEscolarCargos\.saldoCentavos\} > 0/);
    expect(rutaPeriodos).toMatch(/\$\{adminEscolarCargos\.estado\} <> 'anulado'/);
    expect(rutaPeriodos).toMatch(/estado: h\.estado, periodos/);
  });

  it('«N hijos matriculados» cuenta solo a los activos', () => {
    expect(perfil).toMatch(/const matriculados = data\.hijos\.filter\(\(h\) => h\.estado === 'activo'\)\.length/);
    expect(perfil).toMatch(/\{matriculados\} \{matriculados === 1 \? 'hijo matriculado' : 'hijos matriculados'\}/);
    expect(perfil).not.toMatch(/data\.hijos\.length === 1 \? 'hijo matriculado'/);
  });

  it('el que ya no está activo lleva su etiqueta', () => {
    expect(tarjetas).toMatch(/hijo\.estado !== 'activo' && \(/);
    expect(tarjetas).toMatch(/Ya no está en el colegio\. Lo que dejó debiendo está en su ficha\./);
  });

  it('la lista dice «activos» y aparta a los retirados', () => {
    expect(lista).toMatch(/f\.alumnos === 1 \? 'activo' : 'activos'/);
    expect(lista).toMatch(/f\.retirados === 1 \? 'retirado' : 'retirados'/);
    expect(lista).toMatch(/\['retiradas', `Sin hijos activos/);
  });
});
