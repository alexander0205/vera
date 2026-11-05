import { describe, it, expect, vi } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { calcularRegalia, anioRegaliaValido, esCandidatoRegalia, anioEnCurso } from '@/lib/nomina/regalia';
import { calcularLiquidacion } from '@/lib/nomina/liquidacion';
import { revisarZip } from '@/lib/zip-seguro';
import { construirCorrida, periodoDeCorrida, type EmpleadoParaCorrida } from '@/lib/nomina/corrida';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';
import type { ConceptoAplicable } from '@/lib/nomina/conceptos';

describe('1. regalía: quién entra', () => {
  const e = (extra: Record<string, unknown> = {}) => ({ estado: 'activo', fechaIngreso: '2020-01-01', fechaSalida: null as string | null, ...extra });
  it('activo entra; de baja sin fecha de salida no', () => {
    expect(esCandidatoRegalia(e(), 2026, false)).toBe(true);
    expect(esCandidatoRegalia(e({ estado: 'inactivo' }), 2026, false)).toBe(false);
    expect(esCandidatoRegalia(e({ estado: 'inactivo', fechaSalida: '2026-05-31' }), 2026, false)).toBe(true);
  });
  it('liquidado o que salió antes del año o entró después, no', () => {
    expect(esCandidatoRegalia(e(), 2026, true)).toBe(false);
    expect(esCandidatoRegalia(e({ fechaSalida: '2025-12-31' }), 2026, false)).toBe(false);
    expect(esCandidatoRegalia(e({ fechaIngreso: '2027-01-01' }), 2026, false)).toBe(false);
  });
});

describe('2. regalía con diciembre pagado a medias', () => {
  it('caso del revisor: 31,000, ingreso 16-jul, nóminas ago-nov y solo una quincena de dic → 14,250.00', () => {
    const devengadoPorMes: Record<string, number> = {
      '2026-08': 3_100_000, '2026-09': 3_100_000, '2026-10': 3_100_000, '2026-11': 3_100_000, '2026-12': 1_550_000,
    };
    const coberturaPorMes: Record<string, { q1: boolean; q2: boolean }> = {};
    for (const m of ['08', '09', '10', '11']) coberturaPorMes[`2026-${m}`] = { q1: true, q2: true };
    coberturaPorMes['2026-12'] = { q1: true, q2: false };
    const r = calcularRegalia({
      anio: 2026, salarioMensualCents: 3_100_000, fechaIngreso: '2026-07-16', fechaSalida: null,
      devengadoPorMes, coberturaPorMes, topeExentoCents: null,
    });
    expect(r.regaliaCents).toBe(1_425_000);
    expect(r.mesesEstimados).toContain('2026-12');
  });
  it('la quincena de la que no hay nómina no se estima si el empleado aún no había entrado', () => {
    const r = calcularRegalia({
      anio: 2026, salarioMensualCents: 3_000_000, fechaIngreso: '2026-12-20', fechaSalida: null,
      devengadoPorMes: { '2026-12': 600_000 }, coberturaPorMes: { '2026-12': { q1: false, q2: true } }, topeExentoCents: null,
    });
    expect(r.regaliaCents).toBe(Math.round((600_000 + 0) / 12));
  });
  it('sin dato de cobertura el mes se da por completo (como antes)', () => {
    const r = calcularRegalia({
      anio: 2026, salarioMensualCents: 3_000_000, fechaIngreso: null, fechaSalida: null,
      devengadoPorMes: { '2026-12': 1_500_000 }, topeExentoCents: null,
    });
    expect(r.devengadoEstimadoCents).toBe(11 * 3_000_000);
  });
});

describe('6. regalía del año en curso solo desde el 1 de noviembre', () => {
  it('reglas por fecha', () => {
    expect(anioRegaliaValido(2026, '2026-10-31')).toBe(false);
    expect(anioRegaliaValido(2026, '2026-11-01')).toBe(true);
    expect(anioRegaliaValido(2025, '2026-02-01')).toBe(true);
    expect(anioRegaliaValido(2027, '2026-12-31')).toBe(false);
    expect(anioRegaliaValido(1999, '2026-12-31')).toBe(false);
    expect(anioRegaliaValido('2026', '2026-12-01')).toBe(false);
  });
  it('el año en curso se avisa como estimado', () => {
    expect(anioEnCurso(2026, '2026-11-05')).toBe(true);
    expect(anioEnCurso(2025, '2026-11-05')).toBe(false);
  });
});

describe('4. el ISR de una línea nunca es negativo', () => {
  const Q1 = periodoDeCorrida('quincenal-1', { periodo: '2026-11' })!;
  const MES = periodoDeCorrida('mensual', { periodo: '2026-11' })!;
  const emp = (salario: number, conceptos: ConceptoAplicable[]): EmpleadoParaCorrida => ({
    id: 1, nombres: 'Ana', apellidos: 'Prueba', cedula: null, cargo: null, salarioBaseCents: salario, estado: 'activo', conceptos,
  });
  const ingreso = (montoCents: number, cotizaTss: boolean, gravaIsr: boolean): ConceptoAplicable =>
    ({ conceptoId: 1, tipo: 'ingreso', nombre: 'Concepto', montoCents, cotizaTss, gravaIsr });

  it('caso del revisor: 37,500 con concepto de 30,000 que cotiza TSS y no grava ISR', () => {
    for (const periodo of [Q1, MES]) {
      const { lineas } = construirCorrida([emp(3_750_000, [ingreso(3_000_000, true, false)])], TASAS_NOMINA_2026, periodo);
      expect(lineas[0].isrCents).toBeGreaterThanOrEqual(0);
      expect(lineas[0].netoCents).toBe(lineas[0].brutoCents - lineas[0].totalDeduccionesCents);
    }
  });

  it('ninguna combinación de salario, monto y marcas da ISR negativo', () => {
    for (const salario of [1_500_000, 2_500_000, 3_750_000, 6_000_000, 12_000_000]) {
      for (const monto of [200_000, 1_000_000, 3_000_000, 9_000_000]) {
        for (const [tss, isr] of [[true, true], [true, false], [false, true], [false, false]] as const) {
          for (const periodo of [Q1, MES]) {
            const { lineas } = construirCorrida([emp(salario, [ingreso(monto, tss, isr)])], TASAS_NOMINA_2026, periodo);
            expect(lineas[0].isrCents).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});

describe('7. liquidación', () => {
  const base = { fechaIngreso: '2024-01-01', fechaSalida: '2026-07-01', motivo: 'desahucio' as const, regalia: null };

  it('multiplica primero y redondea al final: preaviso de 28 días con salario de 35,000 = 41,124.63', () => {
    const r = calcularLiquidacion({ ...base, salarioMensualCents: 3_500_000 });
    expect(r.componentes.find((c) => c.clave === 'preaviso')!.montoCents).toBe(4_112_463);
  });

  it('con 12 meses exactos y sin días indicados avisa que dio las vacaciones por 0', () => {
    const r = calcularLiquidacion({ ...base, fechaIngreso: '2025-07-01', salarioMensualCents: 3_500_000 });
    expect(r.mesesServicio).toBe(12);
    expect(r.avisos.join(' ')).toMatch(/exacto/);
    expect(r.componentes.some((c) => c.clave === 'vacaciones')).toBe(false);
  });

  it('con los días indicados, ya no avisa y los paga', () => {
    const r = calcularLiquidacion({ ...base, fechaIngreso: '2025-07-01', salarioMensualCents: 3_500_000, diasVacacionesPendientes: 14 });
    expect(r.avisos.join(' ')).not.toMatch(/exacto/);
    expect(r.componentes.find((c) => c.clave === 'vacaciones')!.montoCents).toBe(Math.round((14 * 3_500_000) / 23.83));
  });
});

describe('8. zip bomb', () => {
  // Zip de una entrada deflate cuyo directorio MIENTE sobre el tamaño descomprimido.
  function zipMentiroso(real: number, declarado: number): ArrayBuffer {
    const datos = deflateRawSync(Buffer.alloc(real));
    const nombre = Buffer.from('a.xml');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(datos.length, 18); local.writeUInt32LE(declarado, 22); local.writeUInt16LE(nombre.length, 26);
    const cuerpo = Buffer.concat([local, nombre, datos]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(datos.length, 20); central.writeUInt32LE(declarado, 24); central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(0, 42);
    const dir = Buffer.concat([central, nombre]);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(dir.length, 12); eocd.writeUInt32LE(cuerpo.length, 16);
    const out = Buffer.concat([cuerpo, dir, eocd]);
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  }
  const limites = { maxBytesDescomprimidos: 1_000_000, maxEntradas: 50 };

  it('un archivo honesto pasa', () => {
    expect(revisarZip(zipMentiroso(10_000, 10_000), limites).ok).toBe(true);
  });
  it('declara 100 bytes pero se descomprime a 5 MB: se rechaza', () => {
    const r = revisarZip(zipMentiroso(5_000_000, 100), limites);
    expect(r.ok).toBe(false);
  });
});

describe('3. aprobar dos veces a la vez descuenta una sola vez', () => {
  it('quien no logra reclamar la aprobación recibe 409 y no descuenta ni crea obligaciones', async () => {
    vi.resetModules();
    const descontar = vi.fn(async () => 0);
    const obligaciones = vi.fn(async () => undefined);
    let reclamos = 0;
    vi.doMock('@/lib/auth/api-guard', () => ({ requireModuleAndPermission: async () => ({ ok: true, teamId: 1, user: { id: 1 } }) }));
    vi.doMock('@/lib/nomina/conceptos-db', () => ({ descontarPrestamosDeCorrida: descontar, reconciliarPrestamosDeCorrida: async () => [] }));
    vi.doMock('@/lib/nomina/obligaciones-db', () => ({ crearObligacionesCorrida: obligaciones }));
    vi.doMock('@/lib/contabilidad/asientos', () => ({
      generarAsientoNomina: async () => ({ creado: false }), generarAsientoProvisionNomina: async () => ({ creado: false }),
    }));
    const cadena = (resultado: () => unknown[]) => {
      const c: Record<string, unknown> = {};
      for (const m of ['from', 'where', 'set', 'limit']) c[m] = () => c;
      c.returning = async () => resultado();
      (c as { then: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado()).then(ok);
      return c;
    };
    vi.doMock('@/lib/db/drizzle', () => ({
      db: {
        select: () => cadena(() => [{ id: 7, estado: 'borrador' }]),
        // El primer UPDATE (reclamo) lo gana la primera petición; la segunda no recibe filas.
        update: () => cadena(() => (++reclamos === 1 ? [{ id: 7 }] : [])),
      },
    }));
    const { POST } = await import('@/app/api/nomina/corridas/[id]/aprobar/route');
    const llamar = () => POST(new Request('http://x'), { params: Promise.resolve({ id: '7' }) });
    const [a, b] = [await llamar(), await llamar()];
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(descontar).toHaveBeenCalledTimes(1);
    expect(obligaciones).toHaveBeenCalledTimes(1);
    vi.doUnmock('@/lib/db/drizzle');
  });
});
