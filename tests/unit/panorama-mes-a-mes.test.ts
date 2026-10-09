/**
 * El panorama financiero: el año mes a mes, y los filtros.
 *
 * Lo que no funcionaba:
 *
 * 1. La gráfica «Mes a mes» no pintaba ninguna barra. El alto de cada una iba
 *    en porcentaje de una columna que no tenía alto propio, y eso da cero: se
 *    veían doce etiquetas de mes y nada encima.
 *
 * 2. Los meses salían corridos. Se agrupaba por la fecha de vencimiento, y con
 *    cinco días para pagar la cuota de febrero vence el 2 de marzo: febrero
 *    aparecía vacío y marzo con el doble.
 *
 * 3. Faltaba el mes en que más se cobra. La serie recorría solo de la fecha de
 *    inicio a la de fin del año, y la inscripción —que se paga en agosto para
 *    un año que empieza en septiembre— se quedaba fuera.
 *
 * 4. No se podía mirar un mes. Todo era del año completo: en un colegio que
 *    carga las diez cuotas al matricular, «cartera pendiente» eran nueve meses
 *    que nadie debía todavía, y se leía como lo que tenía que entrar ya.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  armarSerie, mesCorto, mesesEntre, nombreDeMes, normalizarMes,
} from '@/lib/administracion-escolar/serie-mensual';

const raiz = join(__dirname, '..', '..');
const lee  = (p: string) => readFileSync(join(raiz, p), 'utf8');

const HOY = '2026-10-05';
const INICIO = '2026-09-01';
const FIN = '2027-06-30';

describe('qué meses salen en la serie', () => {
  it('todos los del año escolar, tengan cargos o no', () => {
    const { puntos } = armarSerie([], [], INICIO, FIN, HOY);
    expect(puntos.map((p) => p.key)).toEqual([
      '2026-09', '2026-10', '2026-11', '2026-12',
      '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
    ]);
    expect(puntos.every((p) => p.devengadoCentavos === 0 && !p.fueraDelAnio)).toBe(true);
  });

  it('el mes con cargos que cae fuera del año NO se tira', () => {
    // La inscripción de agosto, para un año que empieza en septiembre.
    const { puntos } = armarSerie(
      [{ key: '2026-08', devengado: '70500000', cobrado: '70000000' }], [], INICIO, FIN, HOY,
    );
    expect(puntos[0]).toMatchObject({
      key: '2026-08', mes: 8, anio: 2026, fueraDelAnio: true,
      devengadoCentavos: 70_500_000, cobradoCentavos: 70_000_000, pendienteCentavos: 500_000,
    });
    expect(puntos).toHaveLength(11);
  });

  it('el mes en que solo entró caja también abre fila, para que la columna sume', () => {
    const { puntos } = armarSerie([], [{ key: '2026-07', centavos: '7100000' }], INICIO, FIN, HOY);
    expect(puntos[0]).toMatchObject({
      key: '2026-07', fueraDelAnio: true, devengadoCentavos: 0, cajaCentavos: 7_100_000,
    });
  });

  it('salen en orden, crucen o no de año', () => {
    const { puntos } = armarSerie(
      [{ key: '2027-01', devengado: 1, cobrado: 0 }, { key: '2026-08', devengado: 1, cobrado: 0 }],
      [], INICIO, FIN, HOY,
    );
    const claves = puntos.map((p) => p.key);
    expect(claves).toEqual([...claves].sort());
    expect(claves[0]).toBe('2026-08');
  });

  it('sin fechas de año escolar se enseña lo que haya, y nada es «fuera»', () => {
    const { puntos } = armarSerie(
      [{ key: '2026-10', devengado: 100, cobrado: 40 }, { key: '2026-09', devengado: 100, cobrado: 100 }],
      [], null, null, HOY,
    );
    expect(puntos.map((p) => p.key)).toEqual(['2026-09', '2026-10']);
    expect(puntos.some((p) => p.fueraDelAnio)).toBe(false);
  });
});

describe('qué dice cada mes', () => {
  const { puntos, sinMes } = armarSerie(
    [
      { key: '2026-09', devengado: '51130000', cobrado: '38821000' },
      { key: '2026-10', devengado: '50410000', cobrado: '5125000' },
      { key: '2027-02', devengado: '50410000', cobrado: '1650000' },
      // Cargos sin mes y sin vencimiento.
      { key: null, devengado: '300000', cobrado: '100000' },
    ],
    [{ key: '2026-09', centavos: '38045100' }, { key: '2026-10', centavos: '15702000' }],
    INICIO, FIN, HOY,
  );
  const mes = (k: string) => puntos.find((p) => p.key === k)!;

  it('lo pendiente es lo que falta de ESE mes', () => {
    expect(mes('2026-09').pendienteCentavos).toBe(51_130_000 - 38_821_000);
    expect(mes('2026-10').pendienteCentavos).toBe(50_410_000 - 5_125_000);
  });

  it('la caja es aparte de lo cobrado: es lo que entró durante el mes', () => {
    expect(mes('2026-09').cajaCentavos).toBe(38_045_100);
    expect(mes('2026-11').cajaCentavos).toBe(0);
  });

  it('marca el mes de hoy, los que ya pasaron y los que no han llegado', () => {
    expect(mes('2026-09')).toMatchObject({ transcurrido: true, enCurso: false });
    expect(mes('2026-10')).toMatchObject({ transcurrido: true, enCurso: true });
    expect(mes('2026-11')).toMatchObject({ transcurrido: false, enCurso: false });
  });

  it('un mes que no ha llegado conserva su monto y sus pagos adelantados', () => {
    // Se aplanaba a una rayita: en un colegio que carga el año al matricular,
    // febrero ya tiene sus RD$504,100 y lo que algunos pagaron por adelantado.
    expect(mes('2027-02')).toMatchObject({
      transcurrido: false, devengadoCentavos: 50_410_000, cobradoCentavos: 1_650_000,
    });
  });

  it('lo que no tiene mes va aparte, para que la tabla siga sumando el total', () => {
    expect(sinMes).toEqual({ devengadoCentavos: 300_000, cobradoCentavos: 100_000, pendienteCentavos: 200_000 });
    expect(puntos.some((p) => p.key == null)).toBe(false);
  });

  it('dos filas del mismo mes se suman en vez de pisarse', () => {
    const r = armarSerie(
      [{ key: '2026-09', devengado: 100, cobrado: 10 }, { key: '2026-09', devengado: 50, cobrado: 5 }],
      [{ key: '2026-09', centavos: 7 }, { key: '2026-09', centavos: 3 }], INICIO, FIN, HOY,
    );
    expect(r.puntos[0]).toMatchObject({ devengadoCentavos: 150, cobradoCentavos: 15, cajaCentavos: 10 });
  });
});

describe('el mes que llega por la URL', () => {
  it('solo se acepta un `YYYY-MM` de verdad', () => {
    expect(normalizarMes('2026-10')).toBe('2026-10');
    expect(normalizarMes(' 2027-02 ')).toBe('2027-02');
    for (const malo of ['2026-13', '2026-00', '2026-1', '26-10', 'octubre', '2026-10-05', '', null, undefined]) {
      expect(normalizarMes(malo)).toBeNull();
    }
  });

  it('los nombres de mes', () => {
    expect(nombreDeMes('2026-10')).toBe('octubre 2026');
    expect(nombreDeMes('2027-02')).toBe('febrero 2027');
    expect(mesCorto(9)).toBe('sep');
    expect(mesesEntre('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(mesesEntre('2027-02', '2026-11')).toEqual([]);
  });
});

describe('las consultas del panorama', () => {
  const servidor = lee('lib/administracion-escolar/dashboard.ts');
  const ruta = lee('app/api/administracion-escolar/dashboard/route.ts');

  it('el mes de un cargo es el SUYO, y solo sin él, el del vencimiento', () => {
    expect(servidor).toMatch(/CASE WHEN c\.mes BETWEEN 1 AND 12\s+THEN c\.anio::text \|\| '-' \|\| lpad\(c\.mes::text, 2, '0'\)\s+ELSE to_char\(c\.fecha_vencimiento, 'YYYY-MM'\) END/);
    // La serie ya no se agrupa por el vencimiento a secas.
    expect(servidor).not.toMatch(/SELECT to_char\(c\.fecha_vencimiento, 'YYYY-MM'\)\s+AS key/);
    expect(servidor).toMatch(/SELECT \$\{mesDelCargo\}\s+AS key/);
  });

  it('los tres filtros entran en el predicado común, que es el que usan las cifras', () => {
    expect(servidor).toMatch(/const cargoDelAnio = sql`c\.team_id = \$\{teamId\} AND c\.periodo_id = \$\{periodoId\} AND c\.\$\{NO_ANULADO\}\$\{deConcepto\}\$\{deGrado\}`/);
    expect(servidor).toMatch(/const cargoVivo = sql`\$\{cargoDelAnio\}\$\{deMes\}`/);
    expect(servidor).toMatch(/sql` AND c\.concepto_id = \$\{filtros\.conceptoId\}`/);
    expect(servidor).toMatch(/fc\.grado_id = \$\{filtros\.gradoId\}/);
    expect(servidor).toMatch(/sql` AND \$\{mesDelCargo\} = \$\{filtros\.mes\}`/);
  });

  it('la serie y la caja NO se recortan por el mes elegido', () => {
    // La serie es de donde se elige el mes; y lo que entra en octubre puede
    // ser de la cuota de septiembre.
    const serie = servidor.slice(servidor.indexOf('── 4. Serie mensual'), servidor.indexOf('── 5. Lo que entró en caja cada mes'));
    expect(serie).toMatch(/WHERE \$\{cargoDelAnio\}/);
    expect(serie).not.toMatch(/\$\{cargoVivo\}/);
    const caja = servidor.slice(servidor.indexOf('── 3. Lo que entró en caja'), servidor.indexOf('── 4. Serie mensual'));
    expect(caja).toMatch(/WHERE \$\{cargoDelAnio\} AND c\.ecf_document_id IS NOT NULL/);
    expect(caja).toMatch(/p\.fecha_pago >= \$\{cajaInicio\}::date AND p\.fecha_pago < \$\{cajaSiguiente\}::date/);
  });

  it('la caja se mira del mes elegido; sin mes elegido, del que corre', () => {
    expect(servidor).toMatch(/const mesCaja = filtros\.mes \?\? mesActual/);
  });

  it('lo pendiente se parte en vencido, en plazo y de meses que no han llegado', () => {
    expect(servidor).toMatch(/WHERE NOT \$\{yaVencio\} AND \$\{mesDelCargo\} > \$\{mesActual\}/);
    expect(servidor).toMatch(/corrienteCentavos: Math\.max\(0, pendiente - vencido - futuro\)/);
  });

  it('un filtro que no es de este año escolar se ignora en vez de dar ceros', () => {
    expect(servidor).toMatch(/mes: normalizarMes\(pedidos\.mes\)/);
    expect(servidor).toMatch(/opciones\.conceptos\.some\(\(c\) => c\.id === pedidos\.conceptoId\)/);
    expect(servidor).toMatch(/opciones\.grados\.some\(\(g\) => g\.id === pedidos\.gradoId\)/);
  });

  it('por grado, el concepto y el mes van en el ON: el grado sin cargos sale en cero', () => {
    expect(servidor).toMatch(/AND c\.\$\{NO_ANULADO\}\$\{deConcepto\}\$\{deMes\}\s+WHERE g\.team_id/);
  });

  it('la ruta pasa los tres filtros', () => {
    expect(ruta).toMatch(/mes: sp\.get\('mes'\)/);
    expect(ruta).toMatch(/conceptoId: entero\(sp\.get\('conceptoId'\)\)/);
    expect(ruta).toMatch(/gradoId: entero\(sp\.get\('gradoId'\)\)/);
  });
});

describe('la pantalla del panorama', () => {
  const pantalla = lee('app/escolar/dashboard/_dashboard-client.tsx');
  const grafica = pantalla.slice(pantalla.indexOf('function SerieMensual'), pantalla.indexOf('function Donut'));

  it('las barras miden su alto en píxeles, no en porcentaje', () => {
    expect(pantalla).toMatch(/const ALTO_BARRAS = \d+;/);
    expect(grafica).toMatch(/Math\.round\(\(p\.devengadoCentavos \/ tope\) \* ALTO_BARRAS\)/);
    expect(grafica).toMatch(/style=\{\{ height: alto, backgroundColor/);
    // Ni rastro del alto en porcentaje que dejaba las barras en cero.
    expect(grafica).not.toMatch(/height: `\$\{[^}]+\}%`/);
  });

  it('un mes se elige desde la gráfica, desde la tabla y desde las pastillas', () => {
    expect(grafica.match(/onElegir\(activo \? null : p\.key\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(pantalla).toMatch(/<Pastilla activa=\{filtros\.mes == null\} onClick=\{\(\) => elegirMes\(null\)\}>Año completo<\/Pastilla>/);
  });

  it('la tabla trae el total del año y el pie que explica las dos columnas de dinero', () => {
    expect(grafica).toMatch(/<td className="px-3 py-2">Año completo<\/td>/);
    expect(grafica).toMatch(/«Entró en caja» es el dinero recibido DURANTE ese mes/);
  });

  it('los filtros viven en la URL', () => {
    expect(pantalla).toMatch(/useUrlParams\(\)/);
    expect(pantalla).toMatch(/setParams\(\{ concepto: e\.target\.value \|\| null \}\)/);
    expect(pantalla).toMatch(/setParams\(\{ grado: e\.target\.value \|\| null \}\)/);
    // Cambiar de año borra los otros: son del año que se deja.
    expect(pantalla).toMatch(/setParams\(\{ periodo: e\.target\.value, mes: null, concepto: null, grado: null \}\)/);
  });

  it('lo pendiente se enseña partido, no en una sola cifra', () => {
    expect(pantalla).toMatch(/cartera\.vencidoCentavos > 0 &&/);
    expect(pantalla).toMatch(/cartera\.corrienteCentavos > 0 &&/);
    expect(pantalla).toMatch(/cartera\.futuroCentavos > 0 &&/);
  });
});
