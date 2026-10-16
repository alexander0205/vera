/**
 * «Agregar cargo» en la ficha del alumno sale con el precio de su curso.
 *
 * Pedido en la reunión del 14-oct (04:10-05:43): al escoger un concepto, el
 * formulario debe enseñar el precio configurado para el curso del alumno, y
 * dejar escribirlo a mano cuando no hay ninguno.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deDondeSaleElPrecio, sugerirMontoDelCargo } from '@/lib/administracion-escolar/precio-cargo-individual';

const tercio = 33333;
const P = (etiqueta: string, mes: number, pct = tercio) => ({ etiqueta, mes, porcentajeMilesimas: pct });

describe('sugerirMontoDelCargo', () => {
  it('sin precio para el curso no sugiere nada: se escribe a mano', () => {
    expect(sugerirMontoDelCargo('otro', null, [], 10)).toBeNull();
  });

  it('un cobro de una vez sugiere la tarifa entera', () => {
    const s = sugerirMontoDelCargo('otro', { montoCentavos: 150000, origen: 'grado' }, [], 10);
    expect(s).toEqual({ montoCentavos: 150000, tarifaCentavos: 150000, origen: 'grado', cuota: null });
  });

  it('la colegiatura cobra la tarifa entera aunque tenga diez cuotas', () => {
    const cuotas = Array.from({ length: 10 }, (_, i) => P(`Mes ${i + 1}`, ((i + 8) % 12) + 1, 10000));
    const s = sugerirMontoDelCargo('mensualidad', { montoCentavos: 280000, origen: 'seccion' }, cuotas, 10);
    expect(s?.montoCentavos).toBe(280000);
    expect(s?.cuota).toBeNull();
  });

  it('una evaluación de RD$600 en tres cuotas es un cargo de RD$200, no de RD$600', () => {
    const cuotas = [P('P1', 10, 33334), P('P2', 1), P('P3', 4)];
    const s = sugerirMontoDelCargo('actividad', { montoCentavos: 60000, origen: 'servicio' }, cuotas, 1);
    expect(s?.montoCentavos).toBe(20000);
    expect(s?.tarifaCentavos).toBe(60000);
    expect(s?.cuota).toEqual({ etiqueta: 'P2', de: 3 });
  });

  it('si ninguna cuota cae en el mes, toma la primera', () => {
    const cuotas = [P('P1', 10, 33334), P('P2', 1), P('P3', 4)];
    const s = sugerirMontoDelCargo('actividad', { montoCentavos: 60000, origen: 'grado' }, cuotas, 6);
    expect(s?.cuota?.etiqueta).toBe('P1');
  });

  it('la beca del 100% sugiere cero, no lo esconde', () => {
    const s = sugerirMontoDelCargo('mensualidad', { montoCentavos: 0, origen: 'beca' }, [], 10);
    expect(s?.montoCentavos).toBe(0);
    expect(s?.origen).toBe('beca');
  });
});

describe('sugerirMontoDelCargo · qué cuota es el cargo (revisión PR #126)', () => {
  const Q = (id: number, etiqueta: string, mes: number, cargada = false, pct = tercio) =>
    ({ id, etiqueta, mes, porcentajeMilesimas: pct, cargada });
  const tarifa = { montoCentavos: 60000, origen: 'grado' as const };

  it('devuelve el id de la cuota para atar el cargo', () => {
    const s = sugerirMontoDelCargo('actividad', tarifa, [Q(1, 'P1', 10, false, 33334), Q(2, 'P2', 1), Q(3, 'P3', 4)], 1);
    expect(s?.cuota).toEqual({ id: 2, etiqueta: 'P2', de: 3 });
  });

  it('no propone la cuota del mes si ya tiene cargo: toma la primera libre', () => {
    const s = sugerirMontoDelCargo('actividad', tarifa, [Q(1, 'P1', 10, true, 33334), Q(2, 'P2', 1, true), Q(3, 'P3', 4)], 1);
    expect(s?.cuota?.id).toBe(3);
  });

  it('respeta la cuota que eligió la secretaria', () => {
    const s = sugerirMontoDelCargo('actividad', tarifa, [Q(1, 'P1', 10, false, 33334), Q(2, 'P2', 1), Q(3, 'P3', 4)], 1, 3);
    expect(s?.cuota?.id).toBe(3);
    expect(s?.montoCentavos).toBe(20000);
  });
});

describe('deDondeSaleElPrecio', () => {
  it('dice cada origen en palabras de la secretaria', () => {
    expect(deDondeSaleElPrecio('estudiante')).toBe('su precio personal');
    expect(deDondeSaleElPrecio('seccion')).toBe('su sección');
    expect(deDondeSaleElPrecio('grado')).toBe('su grado');
    expect(deDondeSaleElPrecio('servicio')).toBe('su servicio');
    expect(deDondeSaleElPrecio('beca')).toBe('su beca');
  });
});

const raiz = join(__dirname, '..', '..');
const lee = (p: string) => readFileSync(join(raiz, p), 'utf8');
const ruta = lee('app/api/administracion-escolar/matriculas/[id]/precio/route.ts');
const dialogo = lee('components/administracion-escolar/CrearCargoEstudianteDialog.tsx');

describe('la ruta del precio usa la misma cadena que cobra el servidor', () => {
  it('resuelve con resolverTarifa, como POST /cargos sin monto', () => {
    expect(ruta).toContain('resolverTarifa(teamId, matriculaId, conceptoId)');
  });

  it('solo mira la matrícula y el concepto del propio colegio', () => {
    expect(ruta).toContain('eq(adminEscolarMatriculas.teamId, teamId)');
    expect(ruta).toContain('eq(adminEscolarConceptosPago.teamId, teamId)');
  });
});

describe('el diálogo rellena el monto y lo deja editable', () => {
  it('pide el precio al elegir concepto o mes', () => {
    expect(dialogo).toContain('/api/administracion-escolar/matriculas/${matriculaId}/precio?');
    expect(dialogo).toContain('[open, matriculaId, form.conceptoId, form.mes, form.cuotaId]');
  });

  it('otro concepto trae su precio; un monto escrito a mano para el mismo se respeta', () => {
    expect(dialogo).toMatch(/otroConcepto \|\| f\.monto === '' \|\| f\.monto === montoSugerido\.current/);
  });

  it('el campo de monto sigue siendo editable', () => {
    expect(dialogo).toContain('onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}');
  });

  it('sin precio avisa que se escribe a mano', () => {
    expect(dialogo).toContain('Escribe el monto de este cargo.');
  });

  it('el becado al 100% no manda el cero: lo calcula el servidor', () => {
    expect(dialogo).toContain('...(exonerado ? {} : { montoCentavos })');
  });
});
