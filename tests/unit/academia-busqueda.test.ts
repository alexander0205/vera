import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  buscarVideos, debeResponderAsistente, esPregunta, normalizar, palabrasClave, parecidas, type VideoBuscable,
} from '@/lib/academia/busqueda';

const v = (id: number, slug: string, titulo: string, descripcion: string, capitulos: VideoBuscable['capitulos'] = [], transcripcion: VideoBuscable['transcripcion'] = []): VideoBuscable =>
  ({ id, slug, titulo, descripcion, capitulos, transcripcion });

const CATALOGO: VideoBuscable[] = [
  v(1, 'cobrar-una-cuenta', 'Cobrar una cuenta', 'Registrar un pago y abonar parte de la deuda.',
    [{ t: 0, titulo: 'Introducción' }, { t: 62, titulo: 'Registrar un abono' }],
    [{ t: 5, texto: 'Entra a cuentas por cobrar desde el menú.' }, { t: 70, texto: 'Si el cliente paga solo una parte, registra un abono.' }]),
  v(2, 'emitir-una-factura', 'Emitir una factura', 'Crear tu primera factura electrónica.',
    [{ t: 0, titulo: 'Nueva factura' }],
    [{ t: 10, texto: 'Pulsa el botón nueva factura y escoge al cliente.' }]),
  v(3, 'anular-una-factura', 'Anular una factura', 'Cuándo anular y cuándo hacer una nota de crédito.'),
];

describe('normalizar y palabrasClave', () => {
  it('quita tildes, mayúsculas y signos', () => {
    assert.equal(normalizar('¿Cómo COBRO una Cuenta?'), 'como cobro una cuenta');
  });
  it('descarta palabras de relleno y unifica palabras parecidas', () => {
    assert.deepEqual(palabrasClave('¿Cómo cobro una cuenta?'), ['cobro', 'cuenta']);
    assert.deepEqual(palabrasClave('pagar'), palabrasClave('cobrar'));
    assert.deepEqual(palabrasClave('abonos'), palabrasClave('cobro'));
  });
  it('trata un plural simple como el singular', () => {
    assert.deepEqual(palabrasClave('cuentas'), palabrasClave('cuenta'));
  });
  it('una búsqueda de pura relleno no tiene palabras clave', () => {
    assert.deepEqual(palabrasClave('como para el'), []);
  });
});

describe('esPregunta', () => {
  it('detecta preguntas en lenguaje natural', () => {
    assert.equal(esPregunta('cómo cobro una cuenta'), true);
    assert.equal(esPregunta('puedo anular?'), true);
    assert.equal(esPregunta('quiero cobrar a un cliente atrasado'), true);
  });
  it('una palabra suelta no lo es', () => {
    assert.equal(esPregunta('facturas'), false);
    assert.equal(esPregunta('  '), false);
  });
});

describe('buscarVideos', () => {
  it('pone primero el video cuyo título responde y señala el minuto exacto', () => {
    const r = buscarVideos(CATALOGO, 'cómo cobro una cuenta');
    assert.equal(r[0].video.slug, 'cobrar-una-cuenta');
    assert.ok(r[0].momento);
  });

  it('entiende palabras parecidas: «abonar» llega al momento del abono', () => {
    const r = buscarVideos(CATALOGO, 'abonar parte de una deuda');
    assert.equal(r[0].video.slug, 'cobrar-una-cuenta');
    assert.equal(r[0].momento?.t, 70);   // el tramo que menciona el abono Y la parte, no solo el capítulo
  });

  it('busca dentro de la transcripción aunque el título no coincida', () => {
    const r = buscarVideos(CATALOGO, 'escoge al cliente');
    assert.equal(r[0].video.slug, 'emitir-una-factura');
    assert.equal(r[0].momento?.t, 10);
  });

  it('no distingue tildes ni mayúsculas', () => {
    assert.equal(buscarVideos(CATALOGO, 'ANULAR FACTURA')[0].video.slug, 'anular-una-factura');
    assert.equal(buscarVideos(CATALOGO, 'introduccion')[0].video.slug, 'cobrar-una-cuenta');
  });

  it('sin coincidencias devuelve vacío', () => {
    assert.deepEqual(buscarVideos(CATALOGO, 'helicóptero'), []);
    assert.deepEqual(buscarVideos(CATALOGO, ''), []);
  });

  it('un video sin transcripción ni capítulos sale sin momento', () => {
    const r = buscarVideos(CATALOGO, 'nota de crédito');
    assert.equal(r[0].video.slug, 'anular-una-factura');
    assert.equal(r[0].momento, null);
  });

  it('a igualdad de coincidencias en el mismo video gana el momento más temprano', () => {
    const dos = [v(9, 'x', 'Reportes', '', [], [
      { t: 90, texto: 'el saldo del cliente' }, { t: 20, texto: 'el saldo del cliente' },
    ])];
    assert.equal(buscarVideos(dos, 'saldo cliente')[0].momento?.t, 20);
  });
});

describe('debeResponderAsistente', () => {
  it('sí cuando no hay nada y sí se escribió algo', () => {
    assert.equal(debeResponderAsistente('cómo timbro un cheque', []), true);
  });
  it('no cuando no se escribió nada', () => {
    assert.equal(debeResponderAsistente('   ', []), false);
  });
  it('una pregunta con un video claro por título no necesita asistente extra... pero una con resultado flojo, sí', () => {
    const fuerte = buscarVideos(CATALOGO, 'cobrar una cuenta');
    assert.equal(debeResponderAsistente('cobrar una cuenta', fuerte), false);
    const flojo = buscarVideos(CATALOGO, 'cómo hago para ver el saldo del cliente');
    assert.equal(debeResponderAsistente('cómo hago para ver el saldo del cliente', flojo), true);
  });
  it('una palabra suelta con resultados no llama al asistente', () => {
    assert.equal(debeResponderAsistente('anular', buscarVideos(CATALOGO, 'anular')), false);
  });
});

describe('conjugaciones (el buscador entiende cómo habla la gente)', () => {
  it('«Cómo emito una factura» pone primero el video de emitir', () => {
    const r = buscarVideos(CATALOGO, 'Cómo emito una factura');
    assert.equal(r[0].video.slug, 'emitir-una-factura');
  });
  it('«anulo» llega al video de anular', () => {
    assert.equal(buscarVideos(CATALOGO, 'cómo anulo una factura')[0].video.slug, 'anular-una-factura');
  });
  it('«cobrado» y «pagué» llegan al video de cobrar', () => {
    assert.equal(buscarVideos(CATALOGO, 'ya me han cobrado?')[0]?.video.slug, 'cobrar-una-cuenta');
    assert.equal(buscarVideos(CATALOGO, 'pagué una parte, qué hago')[0].video.slug, 'cobrar-una-cuenta');
  });
  it('parecidas compara por prefijo sin confundir palabras cortas', () => {
    assert.equal(parecidas('emito', 'emitir'), true);
    assert.equal(parecidas('anulo', 'anular'), true);
    assert.equal(parecidas('pago', 'pagina'), false);
    assert.equal(parecidas('nota', 'noto'), false);
  });
});
