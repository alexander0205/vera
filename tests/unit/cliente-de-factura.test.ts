/**
 * Ninguna factura de venta sin cliente: la ficha elegida, la de su cédula
 * (o una nueva con ella), la única con ese nombre exacto, o «CONSUMIDOR FINAL».
 */
import { describe, expect, it } from 'vitest';
import {
  clienteDeLaFactura, esConsumidorFinal, esDocumento, soloDigitos, NOMBRE_CONSUMIDOR_FINAL,
} from '@/lib/clientes/cliente-de-factura';

/** Un `db` de mentira: cada select devuelve la siguiente respuesta; los insert se anotan. */
function falsoDb(respuestas: { id: number }[][]) {
  const insertados: Record<string, unknown>[] = [];
  let i = 0;
  const cadena = (filas: { id: number }[]) => {
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy']) c[m] = () => c;
    c.limit = async () => filas;
    return c;
  };
  return {
    insertados,
    db: {
      select: () => cadena(respuestas[i++] ?? []),
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          insertados.push(v);
          return { returning: async () => [{ id: 900 + insertados.length }] };
        },
      }),
    } as never,
  };
}

describe('lo que identifica a alguien', () => {
  it('cédula y RNC, con o sin guiones', () => {
    expect(soloDigitos('001-1506746-4')).toBe('00115067464');
    expect(esDocumento('00115067464')).toBe(true);
    expect(esDocumento('101123456')).toBe(true);
    expect(esDocumento('12345')).toBe(false);
    expect(esConsumidorFinal(' Consumidor  Final ')).toBe(true);
  });
});

describe('clienteDeLaFactura', () => {
  it('con cédula de una ficha que existe → esa ficha, sin crear nada', async () => {
    const { db, insertados } = falsoDb([[{ id: 1805 }]]);
    expect(await clienteDeLaFactura(db, { teamId: 22, rnc: '001-1506746-4', razonSocial: 'MARIAM' })).toBe(1805);
    expect(insertados).toHaveLength(0);
  });

  it('con cédula que no tiene ficha → la crea con el nombre y la cédula de la factura', async () => {
    const { db, insertados } = falsoDb([[]]);
    expect(await clienteDeLaFactura(db, { teamId: 22, rnc: '40223981412', razonSocial: 'GABRIELA ARIAS' })).toBe(901);
    expect(insertados[0]).toMatchObject({ teamId: 22, rnc: '40223981412', razonSocial: 'GABRIELA ARIAS' });
  });

  it('sin cédula, con UNA ficha de ese nombre exacto → esa', async () => {
    const { db } = falsoDb([[{ id: 77 }]]);
    expect(await clienteDeLaFactura(db, { teamId: 4, razonSocial: 'Juan Pérez' })).toBe(77);
  });

  it('sin cédula y con dos fichas del mismo nombre → no adivina: consumidor final', async () => {
    const { db, insertados } = falsoDb([[{ id: 1 }, { id: 2 }], []]);
    expect(await clienteDeLaFactura(db, { teamId: 4, razonSocial: 'Juan Pérez' })).toBe(901);
    expect(insertados[0]).toMatchObject({ razonSocial: NOMBRE_CONSUMIDOR_FINAL });
  });

  it('sin nada → el consumidor final que ya existe', async () => {
    const { db, insertados } = falsoDb([[{ id: 5 }]]);
    expect(await clienteDeLaFactura(db, { teamId: 4 })).toBe(5);
    expect(insertados).toHaveLength(0);
  });
});
