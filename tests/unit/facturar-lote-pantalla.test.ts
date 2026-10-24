// tests/unit/facturar-lote-pantalla.test.ts
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PasoAlumnosLote } from '@/components/administracion-escolar/facturar-lote/PasoAlumnosLote';
import { PasoConceptosLote } from '@/components/administracion-escolar/facturar-lote/PasoConceptosLote';
import { RevisionLote } from '@/components/administracion-escolar/facturar-lote/RevisionLote';
import { ResultadoFacturasLote } from '@/components/administracion-escolar/facturar-lote/ResultadoFacturasLote';
import {
  planearFacturasPorLote,
  type AlumnoCatalogo, type AlumnoLote, type CargoLote, type ConceptoCatalogo,
} from '@/lib/administracion-escolar/facturar-lote';

/**
 * Estas pantallas no se pueden ejecutar en un navegador de pruebas (el proyecto
 * no tiene uno), pero sí PINTAR en el servidor: basta para saber que no
 * revientan con datos reales y que dicen lo que tienen que decir. Lo que hacen
 * al tocarlas lo cubren las reglas de `facturar-lote.ts`, que es donde viven.
 */

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const sinOp = () => {};

const catalogo = (id: number, nombre: string, extra: Partial<AlumnoCatalogo> = {}): AlumnoCatalogo => ({
  estudianteId: id, nombre, codigo: null, servicioId: 1, servicio: 'Primaria', gradoId: 10, grado: 'Primero',
  cursoId: 100, seccion: 'A', responsableId: 40, responsable: 'Rosa Gómez', sinFactura: 2, sinFacturaCentavos: 1000000,
  ...extra,
});

describe('PasoAlumnosLote', () => {
  const alumnos = [
    catalogo(1, 'Ana Pérez'),
    catalogo(2, 'Luis Pérez', { sinFactura: 0, sinFacturaCentavos: 0 }),
    catalogo(3, 'Eva Ruiz', { responsableId: null, responsable: null }),
  ];

  it('lista a todos, con lo que cada uno debe y quién no tiene responsable', () => {
    const h = html(createElement(PasoAlumnosLote, { alumnos, seleccion: new Set([1]), onCambiar: sinOp }));
    expect(h).toContain('Ana Pérez');
    expect(h).toContain('Luis Pérez');
    expect(h).toContain('2 cargos');
    expect(h).toContain('RD$10,000.00');
    expect(h).toContain('Al día');
    expect(h).toContain('Sin responsable');
    expect(h).toContain('Seleccionar todos (3)');
    expect(h).toContain('1 marcado');
  });

  it('sin alumnos, lo dice', () => {
    const h = html(createElement(PasoAlumnosLote, { alumnos: [], seleccion: new Set<number>(), onCambiar: sinOp }));
    expect(h).toContain('No hay alumnos matriculados');
  });
});

describe('PasoConceptosLote', () => {
  const conceptos: ConceptoCatalogo[] = [
    { id: 1, nombre: 'Colegiatura', tipo: 'mensualidad', sinFactura: 40, sinFacturaCentavos: 20000000 },
    { id: 2, nombre: 'Uniforme', tipo: 'uniforme', sinFactura: 1, sinFacturaCentavos: 250000 },
  ];
  const props = {
    conceptos, seleccionados: new Set([1]), onConceptos: sinOp, hasta: '2026-10-22', onHasta: sinOp,
    juntar: false, onJuntar: sinOp,
  };

  it('ofrece los conceptos con sus cargos, el corte en letras y «juntar hermanos» apagado', () => {
    const h = html(createElement(PasoConceptosLote, props));
    expect(h).toContain('Colegiatura');
    expect(h).toContain('40 cargos');
    expect(h).toContain('1 cargo ·');
    expect(h).toContain('Cuotas emitidas hasta');
    expect(h).toContain('jueves 22 de octubre de 2026');
    expect(h).toContain('Juntar hermanos en una sola factura');
    expect(h).toContain('una factura por cada alumno');
  });

  it('con «juntar» encendido explica que sale una por responsable', () => {
    expect(html(createElement(PasoConceptosLote, { ...props, juntar: true }))).toContain('Una factura por responsable de pago');
  });

  it('una fecha inválida no se presenta como buena', () => {
    expect(html(createElement(PasoConceptosLote, { ...props, hasta: '' }))).toContain('Escribe una fecha válida');
  });

  it('sin conceptos pendientes, lo dice', () => {
    expect(html(createElement(PasoConceptosLote, { ...props, conceptos: [] }))).toContain('ningún concepto con cargos sin factura');
  });
});

describe('RevisionLote', () => {
  const alumnos: AlumnoLote[] = [
    { id: 1, nombre: 'Ana Pérez', clienteId: 40, responsable: 'Rosa Gómez' },
    { id: 2, nombre: 'Luis Pérez', clienteId: 40, responsable: 'Rosa Gómez' },
    { id: 3, nombre: 'Eva Ruiz', clienteId: null, responsable: null },
  ];
  const cargo = (id: number, estudianteId: number): CargoLote => ({
    id, estudianteId, conceptoId: 1, conceptoNombre: 'Colegiatura', mes: 10, anio: 2026, estado: 'pendiente',
    saldoCentavos: 500000, fechaVencimiento: '2026-10-05', fechaEmision: '2026-10-01', ecfDocumentId: null,
  });
  const plan = (juntarHermanos: boolean) => planearFacturasPorLote(
    [cargo(1, 1), cargo(2, 2), cargo(3, 3)],
    { alumnos, conceptoIds: [1], hasta: '2026-10-22', juntarHermanos },
  );

  it('una fila por alumno, con a nombre de quién sale, y aparte quien se queda sin factura', () => {
    const h = html(createElement(RevisionLote, { plan: plan(false), juntar: false, periodo: '2026-2027' }));
    expect(h).toContain('2 facturas');
    expect(h).toContain('una por alumno');
    expect(h).toContain('Ana Pérez');
    expect(h).toContain('Luis Pérez');
    expect(h).toContain('A nombre de Rosa Gómez');
    expect(h).toContain('RD$5,000.00');
    expect(h).toContain('Sin responsable de pago');
    expect(h).toContain('Sin factura (1 alumno)');
    expect(h).toContain('borrador');
  });

  it('juntando hermanos, una fila por familia con la suma de los dos', () => {
    const h = html(createElement(RevisionLote, { plan: plan(true), juntar: true, periodo: '2026-2027' }));
    expect(h).toContain('1 factura');
    expect(h).toContain('una por responsable');
    expect(h).toContain('Rosa Gómez');
    expect(h).toContain('2 hijos');
    expect(h).toContain('RD$10,000.00');
  });

  it('sin nada que crear, lo dice y enseña por qué', () => {
    const vacio = planearFacturasPorLote([], { alumnos, conceptoIds: [1], hasta: '2026-10-22', juntarHermanos: false });
    const h = html(createElement(RevisionLote, { plan: vacio, juntar: false, periodo: '2026-2027' }));
    expect(h).toContain('No hay ninguna factura que crear');
    expect(h).toContain('Sin cargos de estos conceptos');
  });
});

describe('ResultadoFacturasLote', () => {
  const creada = (documentoId: number, nombre: string, monto: number) => ({
    clave: `e:${documentoId}`, documentoId, codigo: `FA-2026-${documentoId}`, montoCentavos: monto,
    estudiantes: [{ id: documentoId, nombre }], responsable: 'Rosa Gómez', cargos: 1,
  });
  const base = { omitidos: [], interrumpido: null, onVer: sinOp, onOtroLote: sinOp, onRevisarDeNuevo: sinOp };

  it('cuenta lo creado con el total REAL y recuerda que son borradores', () => {
    const h = html(createElement(ResultadoFacturasLote, {
      ...base, fallidas: [], creadas: [creada(1, 'Ana Pérez', 590000), creada(2, 'Luis Pérez', 500000)],
    }));
    expect(h).toContain('Listo: 2 facturas creadas en borrador');
    expect(h).toContain('RD$10,900.00');
    expect(h).toContain('FA-2026-1');
    expect(h).toContain('desde aquí no se envió nada');
  });

  it('separa lo que falló de lo que ya estaba hecho', () => {
    const h = html(createElement(ResultadoFacturasLote, {
      ...base, creadas: [creada(1, 'Ana Pérez', 500000)],
      fallidas: [
        { clave: 'e:2', estudiantes: [{ id: 2, nombre: 'Luis Pérez' }], responsable: null, motivo: 'prefill-rechazado', detalle: 'Ningún tutor está vinculado.', yaFacturados: false },
        { clave: 'e:3', estudiantes: [{ id: 3, nombre: 'Eva Ruiz' }], responsable: null, motivo: 'error', detalle: 'ya', yaFacturados: true },
      ],
    }));
    expect(h).toContain('1 factura no se pudo crear');
    expect(h).toContain('Ningún tutor está vinculado.');
    expect(h).toContain('Otra factura ya estaba hecha');
    expect(h).toContain('No se duplicó nada');
  });

  it('si se cortó a medias, dice por qué y ofrece revisar lo que falta', () => {
    const h = html(createElement(ResultadoFacturasLote, {
      ...base, creadas: [creada(1, 'Ana Pérez', 500000)], fallidas: [], interrumpido: 'Se cortó la conexión a mitad.',
    }));
    expect(h).toContain('Se cortó la conexión a mitad.');
    expect(h).toContain('Revisar lo que falta');
  });

  it('si no se creó ninguna, no canta victoria', () => {
    const h = html(createElement(ResultadoFacturasLote, { ...base, creadas: [], fallidas: [] }));
    expect(h).toContain('No se creó ninguna factura');
    expect(h).not.toContain('Listo');
  });
});

describe('la pantalla entera', () => {
  it('se pinta en el servidor: título, explicación y «cargando» antes de tener datos', async () => {
    const { default: Pantalla } = await import('@/app/escolar/facturar/_page-client');
    const h = html(createElement(Pantalla));
    expect(h).toContain('Facturar por lote');
    expect(h).toContain('Nada se envía a la DGII');
    expect(h).toContain('Cargando alumnos');
    // No hay pasos hasta que llegan los alumnos: no se puede marcar a nadie «a ciegas».
    expect(h).not.toContain('Todo lo pendiente');
  });
});
