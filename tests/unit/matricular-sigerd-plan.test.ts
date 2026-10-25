import { describe, it, expect } from 'vitest';
import type { LineaPlan } from '@/components/administracion-escolar/PlanCobroSelector';
import {
  cambioDeMatricula, conConcepto, conPaquete, conPrecio, conceptosDeSeccion, cuentaDe, cuentaDeConcepto,
  igualASeccion, seccionConConcepto, type AjusteAlumno,
} from '@/lib/administracion-escolar/matricular-sigerd-plan';

/**
 * Los montos de «Matricular desde SIGERD» en sus tres vistas. Plan de una
 * sección de primaria como la del colegio 43, inscripción el 1 de agosto y
 * hoy 23 de octubre: agosto, septiembre y octubre ya vencieron y se cargan al
 * matricular; noviembre a mayo los crea el devengo.
 */
const CORTE = '2026-10-23';

function linea(o: {
  id: number; nombre: string; tipo: string; tarifa: number; n: number; porCuota: boolean;
  opcional?: boolean; fecha?: string; omitidas?: number;
}): LineaPlan {
  const cada = o.porCuota ? o.tarifa : o.tarifa / o.n;
  const cuotas = Array.from({ length: o.n }, (_, i) => {
    const mes = ((7 + i) % 12) + 1;
    const anio = mes >= 8 ? 2026 : 2027;
    const fechaEmision = o.fecha ?? `${anio}-${String(mes).padStart(2, '0')}-01`;
    return {
      cuotaId: o.id * 100 + i, numero: i + 1, etiqueta: `Cuota ${i + 1}`, mes,
      fechaEmision, fechaVencimiento: fechaEmision, montoCentavos: cada,
      omitida: i < (o.omitidas ?? 0), porcentajeMilesimas: 10000,
    };
  });
  return {
    conceptoId: o.id, nombre: o.nombre, tipo: o.tipo, admiteBeca: false,
    montoCentavos: o.tarifa, origen: 'grado', productId: 1, opcional: o.opcional, precioPorCuota: o.porCuota,
    cuotas, totalCentavos: cuotas.filter((c) => !c.omitida).reduce((s, c) => s + c.montoCentavos, 0),
    omitidas: o.omitidas ?? 0,
  };
}

const AVANCE = linea({ id: 1, nombre: 'Avance de Anualidad A', tipo: 'inscripcion', tarifa: 3_000_000, n: 1, porCuota: false, fecha: '2026-08-01' });
const TALLERES = linea({ id: 2, nombre: 'Mensualidad Talleres', tipo: 'mensualidad', tarifa: 1_500_000, n: 10, porCuota: true });
const ALMUERZO = linea({ id: 3, nombre: 'Servicio de Almuerzo A', tipo: 'otro', tarifa: 500_000, n: 10, porCuota: true, opcional: true });
// «Otro» que reparte: RD$5,000 en el año son diez cuotas de RD$500.
const PROGRAMA = linea({ id: 4, nombre: 'Programa personalizado', tipo: 'otro', tarifa: 500_000, n: 10, porCuota: false, opcional: true });
const EXCURSION = linea({ id: 5, nombre: 'Excursión', tipo: 'actividad', tarifa: 100_000, n: 1, porCuota: false, opcional: true, fecha: '2026-11-15' });
const PLAN = [AVANCE, TALLERES, ALMUERZO, PROGRAMA, EXCURSION];

describe('lo que cobra la sección', () => {
  it('por defecto los obligatorios sí y los opcionales no', () => {
    expect(conceptosDeSeccion(PLAN)).toEqual([1, 2]);
    expect(conceptosDeSeccion(PLAN, new Set([3]))).toEqual([1, 2, 3]);
    expect(conceptosDeSeccion(PLAN, new Set([2]))).toEqual([1]);
  });

  it('sin plan todavía, nadie es «igual a su sección»', () => {
    expect(igualASeccion(null, { conceptos: [], precios: [] })).toBe(false);
    expect(igualASeccion([1, 2], { conceptos: [2, 1], precios: [] })).toBe(true);
    expect(igualASeccion([1, 2], { conceptos: [1, 2], precios: [{ conceptoId: 2, montoCentavos: 1 }] })).toBe(false);
  });
});

describe('cuánto se le carga a un alumno', () => {
  it('lo de su sección: avance entero y tres mensualidades hoy, el resto en el año', () => {
    expect(cuentaDe(PLAN, [1, 2], [], CORTE)).toEqual({
      hoy: 3_000_000 + 3 * 1_500_000, cargos: 4, anio: 3_000_000 + 10 * 1_500_000,
    });
  });

  it('con almuerzo a precio propio de RD$4,000 por cuota', () => {
    const c = cuentaDe(PLAN, [1, 2, 3], [{ conceptoId: 3, montoCentavos: 400_000 }], CORTE);
    expect(c.hoy).toBe(7_500_000 + 3 * 400_000);
    expect(c.anio).toBe(18_000_000 + 10 * 400_000);
    expect(c.cargos).toBe(7);
  });

  it('lo que vence después de hoy no se carga hoy, pero cuenta en el año', () => {
    expect(cuentaDe(PLAN, [5], [], CORTE)).toEqual({ hoy: 0, cargos: 0, anio: 100_000 });
    // El mismo día de la emisión ya se carga.
    expect(cuentaDe(PLAN, [5], [], '2026-11-15')).toEqual({ hoy: 100_000, cargos: 1, anio: 100_000 });
  });

  it('las cuotas omitidas (antes de entrar) no se cobran nunca', () => {
    const tarde = linea({ id: 2, nombre: 'Mensualidad Talleres', tipo: 'mensualidad', tarifa: 1_500_000, n: 10, porCuota: true, omitidas: 2 });
    expect(cuentaDe([tarde], [2], [], CORTE)).toEqual({ hoy: 1_500_000, cargos: 1, anio: 8 * 1_500_000 });
  });

  it('la suma de la vista por concepto es la cuenta del alumno', () => {
    const conceptos = [1, 2, 3, 4, 5];
    const precios = [{ conceptoId: 3, montoCentavos: 400_000 }, { conceptoId: 2, montoCentavos: 1_200_000 }];
    const total = cuentaDe(PLAN, conceptos, precios, CORTE);
    const porConcepto = PLAN.map((l) => cuentaDeConcepto(l, precios, CORTE));
    expect(porConcepto.reduce((s, c) => s + c.hoy, 0)).toBe(total.hoy);
    expect(porConcepto.reduce((s, c) => s + c.anio, 0)).toBe(total.anio);
    expect(porConcepto.reduce((s, c) => s + c.cargos, 0)).toBe(total.cargos);
  });
});

describe('cambiar precio a varios', () => {
  it('en una mensualidad lo escrito es la cuota', () => {
    const a = conPrecio(TALLERES, [1, 2], [], 1_200_000);
    expect(a).toEqual({ conceptos: [1, 2], precios: [{ conceptoId: 2, montoCentavos: 1_200_000 }] });
    expect(cuentaDe(PLAN, a!.conceptos, a!.precios, CORTE).hoy).toBe(3_000_000 + 3 * 1_200_000);
  });

  it('en un concepto que reparte se escribe la cuota y se guarda el total, como en el alumno', () => {
    // RD$400 por cuota → tarifa de RD$4,000 en el año (no RD$400 en el año).
    const a = conPrecio(PROGRAMA, [1, 2, 4], [], 40_000);
    expect(a?.precios).toEqual([{ conceptoId: 4, montoCentavos: 400_000 }]);
    const c = cuentaDeConcepto(PROGRAMA, a!.precios, CORTE);
    expect(c).toEqual({ hoy: 3 * 40_000, cargos: 3, anio: 400_000 });
  });

  it('escribir la tarifa de la sección le quita el precio propio', () => {
    const a = conPrecio(PROGRAMA, [1, 2, 4], [{ conceptoId: 4, montoCentavos: 400_000 }], 50_000);
    expect(a).toEqual({ conceptos: [1, 2, 4], precios: [] });
    expect(conPrecio(TALLERES, [1, 2], [{ conceptoId: 2, montoCentavos: 1_200_000 }], 1_500_000)?.precios).toEqual([]);
  });

  it('a quien no lleva el concepto no se le pone precio', () => {
    expect(conPrecio(ALMUERZO, [1, 2], [], 400_000)).toBeNull();
  });

  it('cambiar un precio no toca los de otros conceptos', () => {
    const a = conPrecio(ALMUERZO, [1, 2, 3], [{ conceptoId: 2, montoCentavos: 1_200_000 }], 400_000);
    expect(a?.precios).toEqual([
      { conceptoId: 2, montoCentavos: 1_200_000 }, { conceptoId: 3, montoCentavos: 400_000 },
    ]);
  });
});

describe('dar o quitar conceptos', () => {
  it('dar y quitar a un alumno; quitar se lleva su precio propio', () => {
    expect(conConcepto([1, 2], [], 3, true)).toEqual({ conceptos: [1, 2, 3], precios: [] });
    expect(conConcepto([1, 2, 3], [{ conceptoId: 3, montoCentavos: 400_000 }], 3, false))
      .toEqual({ conceptos: [1, 2], precios: [] });
    expect(conConcepto([1, 2], [], 2, true)).toBeNull();
  });

  it('un paquete deja justo sus conceptos con tarifa en la sección', () => {
    const a = conPaquete(PLAN, [2, 3, 99], [{ conceptoId: 1, montoCentavos: 1 }, { conceptoId: 3, montoCentavos: 400_000 }]);
    expect(a).toEqual({ conceptos: [2, 3], precios: [{ conceptoId: 3, montoCentavos: 400_000 }] });
  });

  it('«Todos» en una sección: cambia lo de la sección y a quien tenía lo suyo', () => {
    const ajustes = new Map<number, AjusteAlumno>([
      // Con precio propio en talleres: sigue distinto de la sección.
      [10, { conceptos: [1, 2], precios: [{ conceptoId: 2, montoCentavos: 1_200_000 }] }],
      // Ya tenía almuerzo: al darlo a toda la sección queda igual a ella.
      [11, { conceptos: [1, 2, 3], precios: [] }],
    ]);
    const r = seccionConConcepto(PLAN, undefined, ajustes, 3, true)!;
    expect([...r.cambiados]).toEqual([3]);
    expect(r.ajustes.get(10)).toEqual({ conceptos: [1, 2, 3], precios: [{ conceptoId: 2, montoCentavos: 1_200_000 }] });
    expect(r.ajustes.get(11)).toBeNull();

    // «Ninguno» lo devuelve como estaba.
    const de = seccionConConcepto(PLAN, r.cambiados, new Map([[10, r.ajustes.get(10)!]]), 3, false)!;
    expect([...de.cambiados]).toEqual([]);
    expect(de.ajustes.get(10)).toEqual({ conceptos: [1, 2], precios: [{ conceptoId: 2, montoCentavos: 1_200_000 }] });
  });

  it('un concepto sin tarifa en la sección no se toca', () => {
    expect(seccionConConcepto(PLAN, undefined, new Map(), 99, true)).toBeNull();
  });
});

describe('los ya matriculados en la misma lista', () => {
  it('«Todos» en la sección también se lo da a los matriculados; sin cambios es quedar como su matrícula', () => {
    // 20 ya tiene almuerzo guardado; 21 no.
    const matriculados = new Map([[20, [1, 2, 3]], [21, [1, 2]]]);
    const r = seccionConConcepto(PLAN, undefined, new Map(), 3, true, matriculados)!;
    expect(r.ajustes.get(20)).toBeNull();
    expect(r.ajustes.get(21)).toEqual({ conceptos: [1, 2, 3], precios: [] });

    // «Ninguno»: a 20 se le quita aunque la sección por defecto ya no lo cobraba.
    const q = seccionConConcepto(PLAN, undefined, new Map(), 3, false, matriculados)!;
    expect(q.ajustes.get(20)).toEqual({ conceptos: [1, 2], precios: [] });
    expect(q.ajustes.get(21)).toBeNull();
  });

  it('un matriculado con cambios previos los conserva al tocar la sección', () => {
    const matriculados = new Map([[20, [1, 2]]]);
    const ajustes = new Map<number, AjusteAlumno>([[20, { conceptos: [1, 2, 4], precios: [] }]]);
    const r = seccionConConcepto(PLAN, undefined, ajustes, 3, true, matriculados)!;
    expect(r.ajustes.get(20)).toEqual({ conceptos: [1, 2, 4, 3], precios: [] });
  });

  it('lo que se manda a guardar: qué se agrega y qué se quita de su matrícula', () => {
    expect(cambioDeMatricula([1, 2, 3], { conceptos: [1, 2, 4], precios: [] })).toEqual({ agregar: [4], quitar: [3] });
    expect(cambioDeMatricula([1, 2], { conceptos: [2, 1], precios: [] })).toBeNull();
    expect(cambioDeMatricula([1, 2], undefined)).toBeNull();
  });
});
