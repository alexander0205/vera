/**
 * Inventario por aula: totales por aula (invertido, vale hoy, por estudiante), la
 * regla de «reponer pronto» y cuándo se enseña la pantalla. Todo puro.
 */
import { describe, it, expect } from 'vitest';
import {
  debeReponerPronto, estadoVisible, etiquetaSeccion, inventarioAulaVisible, plantaFisicaDisponible, resumirInventario,
  totalesPorAula, type EspacioBase, type FichaInventario,
} from '@/lib/escolar/inventario-aula';

const HOY = '2026-06-15';

function ficha(p: Partial<FichaInventario> & { id: number }): FichaInventario {
  return {
    nombre: `Ficha ${p.id}`, espacioId: 1, categoria: 'mobiliario', cantidadVigente: 1,
    costoVigenteCents: 100_000, acumuladaVigenteCents: 0, vidaUtilMeses: 60, fechaAdquisicion: '2026-01-10',
    soloControl: false, estado: 'bien', enRevision: false, activa: true, ...p,
  };
}

function espacio(p: Partial<EspacioBase> & { id: number }): EspacioBase {
  return { nombre: `Aula ${p.id}`, tipo: 'aula', capacidad: null, responsableId: null, responsable: null, activo: true, secciones: [], ...p };
}

describe('totales por aula', () => {
  const aula = espacio({
    id: 1,
    secciones: [
      { cursoId: 10, etiqueta: '1.º A · mañana', matriculados: 20 },
      { cursoId: 11, etiqueta: '1.º B · tarde', matriculados: 10 },
    ],
  });
  const fichas = [
    // 30 butacas: costaron RD$30,000.00, ya se depreciaron RD$10,000.00.
    ficha({ id: 1, cantidadVigente: 30, costoVigenteCents: 3_000_000, acumuladaVigenteCents: 1_000_000 }),
    // 100 marcadores «solo control»: se cuentan, pero no suman al dinero.
    ficha({ id: 2, cantidadVigente: 100, costoVigenteCents: 500_000, soloControl: true }),
  ];

  it('suma unidades, lo invertido y lo que vale hoy; el solo control solo cuenta en unidades', () => {
    const t = totalesPorAula(aula, fichas, HOY);
    expect(t.unidades).toBe(130);
    expect(t.fichas).toBe(2);
    expect(t.invertidoCents).toBe(3_000_000);
    expect(t.valeHoyCents).toBe(2_000_000);
    expect(t.unidadesSoloControl).toBe(100);
  });

  it('por estudiante es lo que vale hoy entre los matriculados de TODAS sus secciones', () => {
    const t = totalesPorAula(aula, fichas, HOY);
    expect(t.estudiantes).toBe(30);
    expect(t.porEstudianteCents).toBe(Math.round(2_000_000 / 30));
  });

  it('un espacio sin secciones, o sin alumnos, no tiene «por estudiante» (—)', () => {
    expect(totalesPorAula(espacio({ id: 2 }), fichas, HOY).porEstudianteCents).toBeNull();
    const vacia = espacio({ id: 3, secciones: [{ cursoId: 1, etiqueta: '2.º A', matriculados: 0 }] });
    expect(totalesPorAula(vacia, fichas, HOY).porEstudianteCents).toBeNull();
  });

  it('el valor en libros nunca sale negativo', () => {
    const t = totalesPorAula(aula, [ficha({ id: 5, costoVigenteCents: 1_000, acumuladaVigenteCents: 5_000 })], HOY);
    expect(t.valeHoyCents).toBe(0);
  });
});

describe('resumen general', () => {
  const e1 = espacio({ id: 1, secciones: [{ cursoId: 1, etiqueta: '1.º A', matriculados: 25 }] });
  const e2 = espacio({ id: 2, nombre: 'Oficina', tipo: 'oficina' });
  const eViejo = espacio({ id: 3, nombre: 'Cerrada', activo: false });
  const fichas = [
    ficha({ id: 1, espacioId: 1, cantidadVigente: 10, costoVigenteCents: 1_000_000, acumuladaVigenteCents: 400_000 }),
    ficha({ id: 2, espacioId: 2, cantidadVigente: 2, costoVigenteCents: 2_000_000, acumuladaVigenteCents: 500_000 }),
    ficha({ id: 3, espacioId: null, cantidadVigente: 4, costoVigenteCents: 800_000, acumuladaVigenteCents: 0 }),
    // En un espacio inactivo: se va a «sin aula», no se pierde.
    ficha({ id: 4, espacioId: 3, cantidadVigente: 1, costoVigenteCents: 100_000, acumuladaVigenteCents: 0 }),
    // Dada de baja: no cuenta.
    ficha({ id: 5, espacioId: 1, cantidadVigente: 9, costoVigenteCents: 9_000_000, activa: false }),
  ];
  const r = resumirInventario([e1, e2, eViejo], fichas, 50, HOY);

  it('una fila por espacio activo y un grupo «Sin aula asignada» con lo suelto', () => {
    expect(r.aulas.map((a) => a.espacioId)).toEqual([1, 2]);
    expect(r.sinAula?.nombre).toBe('Sin aula asignada');
    expect(r.sinAula?.unidades).toBe(5);
    expect(r.sinAula?.invertidoCents).toBe(900_000);
  });

  it('las tarjetas suman todo, incluso lo que no tiene aula; por estudiante usa todos los matriculados', () => {
    expect(r.tarjetas.invertidoCents).toBe(1_000_000 + 2_000_000 + 900_000);
    expect(r.tarjetas.valeHoyCents).toBe(600_000 + 1_500_000 + 900_000);
    expect(r.tarjetas.porEstudianteCents).toBe(Math.round(3_000_000 / 50));
    expect(r.tarjetas.estudiantes).toBe(50);
  });

  it('sin estudiantes no hay «por estudiante»; sin activos sueltos no hay grupo «sin aula»', () => {
    expect(resumirInventario([e1], [fichas[0]], 0, HOY).tarjetas.porEstudianteCents).toBeNull();
    expect(resumirInventario([e1], [fichas[0]], 5, HOY).sinAula).toBeNull();
  });

  it('«por reponer» suma el costo de lo que está por vencer o dañado', () => {
    const lista = [
      ficha({ id: 1, espacioId: 1, cantidadVigente: 3, costoVigenteCents: 300_000, vidaUtilMeses: 18, fechaAdquisicion: '2025-07-01' }), // le quedan 7 meses
      ficha({ id: 2, espacioId: 1, cantidadVigente: 1, costoVigenteCents: 50_000, estado: 'danado' }),
      ficha({ id: 3, espacioId: 1, cantidadVigente: 8, costoVigenteCents: 900_000 }), // nueva: bien
    ];
    const t = resumirInventario([e1], lista, 25, HOY).tarjetas;
    expect(t.porReponerCents).toBe(350_000);
    expect(t.unidadesPorReponer).toBe(4);
  });
});

describe('«reponer pronto»', () => {
  // Hoy = 2026-06-15. Los meses van por calendario: de 2022-06 a 2026-06 son 48.
  const f = (p: Partial<FichaInventario>) => ficha({ id: 1, ...p });

  it('le quedan 12 meses o menos de vida útil', () => {
    expect(debeReponerPronto(f({ vidaUtilMeses: 60, fechaAdquisicion: '2022-06-01' }), HOY)).toBe(true);  // quedan 12
    expect(debeReponerPronto(f({ vidaUtilMeses: 60, fechaAdquisicion: '2022-07-01' }), HOY)).toBe(false); // quedan 13
    expect(debeReponerPronto(f({ vidaUtilMeses: 60, fechaAdquisicion: '2015-01-01' }), HOY)).toBe(true);  // ya se acabó
  });

  it('o ya se consumió más del 85 % de la vida útil', () => {
    // Vida de 40 años (480 meses): a 420 meses va al 87,5 % y todavía le quedan 5 años.
    expect(debeReponerPronto(f({ vidaUtilMeses: 480, fechaAdquisicion: '1991-06-01' }), HOY)).toBe(true);
    // A 408 meses va justo al 85 %: «más del 85 %» no se cumple.
    expect(debeReponerPronto(f({ vidaUtilMeses: 480, fechaAdquisicion: '1992-06-01' }), HOY)).toBe(false);
  });

  it('lo nuevo no se repone', () => {
    expect(debeReponerPronto(f({ vidaUtilMeses: 60, fechaAdquisicion: '2026-05-01' }), HOY)).toBe(false);
  });

  it('no aplica al solo control, a los terrenos ni a una ficha sin confirmar', () => {
    const vieja = { vidaUtilMeses: 12, fechaAdquisicion: '2010-01-01' };
    expect(debeReponerPronto(f({ ...vieja }), HOY)).toBe(true);
    expect(debeReponerPronto(f({ ...vieja, soloControl: true }), HOY)).toBe(false);
    expect(debeReponerPronto(f({ ...vieja, categoria: 'terrenos' }), HOY)).toBe(false);
    expect(debeReponerPronto(f({ ...vieja, enRevision: true }), HOY)).toBe(false);
  });

  it('el estado que se ve: dañado manda; luego reponer pronto; si no, lo que anotó la persona', () => {
    const vieja = { vidaUtilMeses: 12, fechaAdquisicion: '2010-01-01' };
    expect(estadoVisible(f({ ...vieja, estado: 'danado' }), HOY)).toBe('danado');
    expect(estadoVisible(f({ ...vieja, estado: 'regular' }), HOY)).toBe('reponer');
    expect(estadoVisible(f({ estado: 'regular' }), HOY)).toBe('regular');
    expect(estadoVisible(f({ estado: 'bien' }), HOY)).toBe('bien');
    expect(estadoVisible(f({ soloControl: true, ...vieja }), HOY)).toBe('bien');
  });
});

describe('mostrar u ocultar «Inventario por aula»', () => {
  it('solo se ve con todo migrado, con espacios Y con al menos un activo con aula', () => {
    expect(inventarioAulaVisible({ disponible: true, espacios: 3, activosConEspacio: 5 })).toBe(true);
  });

  it('sin espacios no se ve', () => {
    expect(inventarioAulaVisible({ disponible: true, espacios: 0, activosConEspacio: 5 })).toBe(false);
  });

  it('con espacios pero sin ningún activo con aula no se ve', () => {
    expect(inventarioAulaVisible({ disponible: true, espacios: 3, activosConEspacio: 0 })).toBe(false);
  });

  it('sin las migraciones (disponible = false) no se ve, aunque haya números', () => {
    expect(inventarioAulaVisible({ disponible: false, espacios: 3, activosConEspacio: 5 })).toBe(false);
  });

  it('sin lectura (null o undefined) no se ve', () => {
    expect(inventarioAulaVisible(null)).toBe(false);
    expect(inventarioAulaVisible(undefined)).toBe(false);
  });

  it('«Planta física» solo necesita que las migraciones estén al día', () => {
    expect(plantaFisicaDisponible({ disponible: true, espacios: 0, activosConEspacio: 0 })).toBe(true);
    expect(plantaFisicaDisponible({ disponible: false, espacios: 0, activosConEspacio: 0 })).toBe(false);
    expect(plantaFisicaDisponible(null)).toBe(false);
  });
});

describe('etiqueta de sección', () => {
  it('abrevia el grado, deja la letra y traduce la tanda', () => {
    expect(etiquetaSeccion('Primero', 'A', 'Matutina')).toBe('1.º A · mañana');
    expect(etiquetaSeccion('Primer grado (7mo Nivel Básico)', 'B', 'Vespertina')).toBe('1.º B · tarde');
    expect(etiquetaSeccion('Cuarto grado (2do Nivel Medio)', 'C', null)).toBe('4.º C');
  });

  it('lo que no reconoce se deja como viene', () => {
    expect(etiquetaSeccion('Pre-kínder', 'A', 'Matutina')).toBe('Pre-kínder A · mañana');
  });
});
