import { describe, expect, it } from 'vitest';
import {
  armarCsv, celdaCsv, esFechaValida, LARGO_MAXIMO_CELDA, leerConsulta, paramsDeConsulta, patronBusqueda,
  TAMANO_POR_DEFECTO, type DefTabla,
} from '@/lib/admin/consulta-tabla';

/**
 * Lo único que deja entrar texto de la barra de direcciones a una consulta del
 * panel. Estas pruebas son el contrato: el campo de orden sale de una lista, los
 * filtros se validan por tipo y lo raro se descarta en silencio.
 */

const def: DefTabla = {
  ordenables: ['nombre', 'creada'],
  porDefecto: { campo: 'creada', dir: 'desc' },
  filtros: {
    rol: { tipo: 'opciones', opciones: ['admin', 'member'] },
    plan: { tipo: 'clave' },
    colegio: { tipo: 'entero' },
    desde: { tipo: 'fecha' },
  },
  filtrosPorDefecto: { rol: 'member' },
};

describe('leerConsulta', () => {
  it('sin nada en la URL: primera página, tamaño y orden por defecto', () => {
    expect(leerConsulta({}, def)).toEqual({
      pagina: 1, tamano: TAMANO_POR_DEFECTO, orden: def.porDefecto, q: '', filtros: { rol: 'member' },
    });
  });

  it('la página es un entero positivo y tiene tope', () => {
    expect(leerConsulta({ pagina: '3' }, def).pagina).toBe(3);
    for (const malo of ['0', '-4', 'abc', '', '1e9', '9.5x']) {
      expect(leerConsulta({ pagina: malo }, def).pagina, malo).toBeGreaterThanOrEqual(1);
    }
    expect(leerConsulta({ pagina: '999999999' }, def).pagina).toBeLessThanOrEqual(100_000);
  });

  it('el tamaño solo puede ser uno de los permitidos', () => {
    expect(leerConsulta({ tamano: '50' }, def).tamano).toBe(50);
    for (const malo of ['7', '100000', '-1', 'x', '0']) expect(leerConsulta({ tamano: malo }, def).tamano, malo).toBe(TAMANO_POR_DEFECTO);
  });

  it('el orden: solo campos de la lista, con su dirección', () => {
    expect(leerConsulta({ orden: 'nombre:asc' }, def).orden).toEqual({ campo: 'nombre', dir: 'asc' });
    expect(leerConsulta({ orden: 'nombre:desc' }, def).orden).toEqual({ campo: 'nombre', dir: 'desc' });
    expect(leerConsulta({ orden: 'nombre:raro' }, def).orden).toEqual({ campo: 'nombre', dir: 'desc' });
  });

  it('un campo de orden que no está en la lista se ignora (nada de ORDER BY armado a mano)', () => {
    for (const ataque of ['password_hash:asc', 'id; drop table users:asc', '(select 1):desc', 'creada,nombre:asc', '__proto__:asc', 'constructor:asc']) {
      expect(leerConsulta({ orden: ataque }, def).orden, ataque).toEqual(def.porDefecto);
    }
  });

  it('la búsqueda se aplana y se recorta a 100', () => {
    expect(leerConsulta({ q: '  hola   mundo ' }, def).q).toBe('hola mundo');
    expect(leerConsulta({ q: 'x'.repeat(500) }, def).q).toHaveLength(100);
  });

  it('los filtros se validan por tipo y lo que no cumple se descarta', () => {
    const c = leerConsulta({ rol: 'admin', plan: 'zero-erp', colegio: '45', desde: '2026-10-31' }, def);
    expect(c.filtros).toEqual({ rol: 'admin', plan: 'zero-erp', colegio: '45', desde: '2026-10-31' });

    const malo = leerConsulta({ rol: 'superadmin', plan: "x'; drop table--", colegio: '4 5', desde: '2026-02-31' }, def);
    // `rol` inválido cae en su valor por defecto; los demás se descartan.
    expect(malo.filtros).toEqual({ rol: 'member' });
  });

  it('un filtro con valor por defecto se puede cambiar, pero no vaciar', () => {
    expect(leerConsulta({ rol: 'admin' }, def).filtros.rol).toBe('admin');
    expect(leerConsulta({ rol: '' }, def).filtros.rol).toBe('member');
  });

  it('acepta el valor repetido de la URL (?q=a&q=b) tomando el primero', () => {
    expect(leerConsulta({ q: ['a', 'b'], pagina: ['2', '5'] }, def)).toMatchObject({ q: 'a', pagina: 2 });
  });

  it('claves que no son de la tabla no pasan a los filtros', () => {
    expect(Object.keys(leerConsulta({ usuario: 'x', password: 'y' }, def).filtros)).toEqual(['rol']);
  });
});

describe('fechas', () => {
  it('solo días reales del calendario', () => {
    expect(esFechaValida('2026-10-31')).toBe(true);
    expect(esFechaValida('2028-02-29')).toBe(true);
    for (const mala of ['2026-02-29', '2026-13-01', '2026-00-10', '2026-1-1', '31/10/2026', '', '2026-10-31T00:00']) {
      expect(esFechaValida(mala), mala).toBe(false);
    }
  });
});

describe('búsqueda', () => {
  it('lo escrito va literal: los comodines se escapan', () => {
    expect(patronBusqueda('50%')).toBe('%50\\%%');
    expect(patronBusqueda('a_b')).toBe('%a\\_b%');
    expect(patronBusqueda('c:\\x')).toBe('%c:\\\\x%');
    expect(patronBusqueda('normal')).toBe('%normal%');
  });
});

describe('enlace de exportación', () => {
  it('lleva los filtros puestos y el orden solo si no es el de por defecto', () => {
    const c = leerConsulta({ q: 'ana', plan: 'pro', orden: 'nombre:asc' }, def);
    const p = paramsDeConsulta(c, def);
    expect(p.get('q')).toBe('ana');
    expect(p.get('plan')).toBe('pro');
    expect(p.get('orden')).toBe('nombre:asc');
    expect(paramsDeConsulta(leerConsulta({}, def), def).has('orden')).toBe(false);
  });
});

describe('CSV', () => {
  it('neutraliza las fórmulas de hoja de cálculo', () => {
    for (const f of ['=1+1', '+cmd|calc', '-2+3', '@SUM(A1)', '\tx', '\rx']) {
      expect(celdaCsv(f).replace(/^"/, '').startsWith("'"), JSON.stringify(f)).toBe(true);
    }
    expect(celdaCsv('Colegio Ana')).toBe('Colegio Ana');
    expect(celdaCsv('1-2')).toBe('1-2');
  });

  it('también las que empiezan por un salto de línea o con símbolos de ancho completo', () => {
    for (const f of ['\n=1+1', '＝1+1', '＋1', '－1', '＠x']) {
      expect(celdaCsv(f).replace(/^"/, '').startsWith("'"), JSON.stringify(f)).toBe(true);
    }
  });

  it('recorta las celdas enormes y lo deja ver', () => {
    const c = celdaCsv('a'.repeat(5000));
    expect(c.length).toBe(LARGO_MAXIMO_CELDA);
    expect(c.endsWith('…')).toBe(true);
  });

  it('entrecomilla comas, comillas y saltos', () => {
    expect(celdaCsv('a,b')).toBe('"a,b"');
    expect(celdaCsv('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(celdaCsv('l1\nl2')).toBe('"l1\nl2"');
    expect(celdaCsv(null)).toBe('');
    expect(celdaCsv(undefined)).toBe('');
    expect(celdaCsv(0)).toBe('0');
  });

  it('el archivo lleva BOM, encabezados y una línea por fila', () => {
    const csv = armarCsv(['A', 'B'], [[1, 'x'], [2, '=y']]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toBe('\uFEFFA,B\r\n1,x\r\n2,\'=y\r\n');
  });
});
