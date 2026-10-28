import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/drizzle', () => ({ db: {} }));

import { claveDePrevisto, leerPrevisto } from '@/lib/administracion-escolar/clave-previsto';
import { cargosDeLasLineas, estudiantesDeLasLineas, previstosDeLasLineas } from '@/lib/administracion-escolar/vincular-por-clave';

/**
 * Cobrar desde «Nueva factura» un mes que todavía no salió (diciembre en
 * octubre). La línea lleva `p<matrícula>.<cuota>` en lugar del cargo, y el
 * cargo lo crea la emisión ya atado a la factura.
 */
describe('meses adelantados en las líneas de la factura', () => {
  const dic = claveDePrevisto({ estudianteId: 557, matriculaId: 900, cuotaId: 4321, mes: 12, anio: 2026 });
  const almuerzoDic = claveDePrevisto({ estudianteId: 557, matriculaId: 900, cuotaId: 4400, mes: 12, anio: 2026 });

  it('la clave dice alumno, matrícula, cuota, mes y año, y se lee de vuelta', () => {
    expect(dic).toBe('557:p900.4321:12:2026');
    expect(leerPrevisto(dic)).toEqual({ estudianteId: 557, matriculaId: 900, cuotaId: 4321 });
    // Dos conceptos del mismo mes no chocan: cada uno lleva su cuota.
    expect(almuerzoDic).not.toBe(dic);
  });

  it('no se confunde con la clave de un cargo ni con basura', () => {
    expect(leerPrevisto('557:10916:8:2026')).toBeNull();
    expect(leerPrevisto('557:0:12:2026')).toBeNull();
    expect(leerPrevisto('557:p900:12:2026')).toBeNull();
    expect(leerPrevisto(null)).toBeNull();
  });

  it('el mes adelantado no pasa por los cargos, pero sí dice de quién es la factura', () => {
    const lineas = [{ cuotaClave: '557:10916:8:2026' }, { cuotaClave: dic }, { cuotaClave: almuerzoDic }, { cuotaClave: dic }];
    expect(cargosDeLasLineas(lineas)).toEqual([10916]);
    expect(estudiantesDeLasLineas(lineas)).toEqual([557]);
    // Repetido en dos líneas, se crea una sola vez.
    expect(previstosDeLasLineas(lineas)).toEqual([
      { estudianteId: 557, matriculaId: 900, cuotaId: 4321 },
      { estudianteId: 557, matriculaId: 900, cuotaId: 4400 },
    ]);
  });
});
