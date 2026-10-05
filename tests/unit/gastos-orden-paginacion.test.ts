import { describe, it, expect } from 'vitest';
import { compararGastos, paginaDe, type FilaOrdenable } from '@/lib/compras/orden-gastos';

/**
 * La lista de gastos sale de dos tablas. Para paginarla se piden a cada una sus
 * primeras N filas y se mezclan aquí, y eso solo da el resultado correcto si
 * este orden es el mismo que el de las consultas. Cuando no lo era, un gasto
 * aparecía en dos páginas y otro no aparecía en ninguna, sin ningún error.
 *
 * Estas pruebas recorren las páginas como lo hace la pantalla y comprueban que
 * entre todas sale cada gasto una vez y solo una.
 */

/** Lo que devuelve una consulta: su propio orden, fecha y luego id descendente. */
const comoLaConsulta = (filas: FilaOrdenable[], fuente: 'r' | 'e', limite: number) =>
  filas.filter((f) => f.fuente === fuente)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
    .slice(0, limite);

/** Lo que hace la pantalla para pintar una página. */
const paginaComoLaPantalla = (todas: FilaOrdenable[], pagina: number, porPagina: number) => {
  const hasta = pagina * porPagina;
  const traidas = [...comoLaConsulta(todas, 'r', hasta), ...comoLaConsulta(todas, 'e', hasta)];
  return paginaDe(traidas.sort(compararGastos), pagina, porPagina);
};

const clave = (f: FilaOrdenable) => `${f.fuente}${f.id}`;

describe('orden de la lista de gastos', () => {
  it('lo más nuevo primero', () => {
    const filas: FilaOrdenable[] = [
      { fuente: 'e', id: 1, fecha: '2026-08-15' },
      { fuente: 'r', id: 2, fecha: '2026-09-27' },
      { fuente: 'e', id: 3, fecha: '2026-07-01' },
    ];
    expect([...filas].sort(compararGastos).map(clave)).toEqual(['r2', 'e1', 'e3']);
  });

  it('a igual fecha manda el id más alto, como la consulta', () => {
    const mismoDia: FilaOrdenable[] = [2, 10, 9, 1, 11].map((id) => ({ fuente: 'e', id, fecha: '2026-08-15' }));
    // Con un orden por texto esto daba e1, e10, e11, e2, e9: ahí nació el fallo.
    expect([...mismoDia].sort(compararGastos).map(clave)).toEqual(['e11', 'e10', 'e9', 'e2', 'e1']);
  });
});

describe('paginación sobre dos fuentes', () => {
  // El caso real que lo destapó: un gasto de septiembre y once de agosto, casi
  // todos del mismo día, repartidos entre las dos tablas.
  const todas: FilaOrdenable[] = [
    { fuente: 'r', id: 3, fecha: '2026-09-27' },
    { fuente: 'e', id: 20, fecha: '2026-08-17' },
    ...Array.from({ length: 10 }, (_, i) => ({ fuente: 'e' as const, id: i + 1, fecha: '2026-08-15' })),
  ];

  it('con páginas de cinco, cada gasto sale una vez y solo una', () => {
    const vistas = [1, 2, 3].flatMap((p) => paginaComoLaPantalla(todas, p, 5).map(clave));
    expect(vistas).toHaveLength(todas.length);
    expect(new Set(vistas).size).toBe(todas.length);
  });

  it('las páginas juntas dan exactamente la lista ordenada', () => {
    const esperado = [...todas].sort(compararGastos).map(clave);
    const vistas = [1, 2, 3].flatMap((p) => paginaComoLaPantalla(todas, p, 5).map(clave));
    expect(vistas).toEqual(esperado);
  });

  it('da igual el tamaño de página', () => {
    const esperado = [...todas].sort(compararGastos).map(clave);
    for (const tam of [1, 2, 3, 4, 7, 12, 50]) {
      const paginas = Math.ceil(todas.length / tam);
      const vistas = Array.from({ length: paginas }, (_, i) => paginaComoLaPantalla(todas, i + 1, tam).map(clave)).flat();
      expect(vistas, `páginas de ${tam}`).toEqual(esperado);
    }
  });

  it('pasada la última página no hay nada, no se repite la anterior', () => {
    expect(paginaComoLaPantalla(todas, 4, 5)).toEqual([]);
  });
});
