import { describe, expect, it } from 'vitest';
import { enlaceDeAviso, enlaceDeFactura, sufijoDeBoton } from '@/lib/administracion-escolar/agrupar-avisos';
import { textoDePlantilla } from '@/lib/whatsapp/plantillas';

describe('el enlace dice de qué aviso viene', () => {
  const base = 'https://app.zero.com.do/pagar/tok';

  it('con o sin factura', () => {
    expect(enlaceDeAviso(base, 5)).toBe(`${base}?a=5`);
    expect(enlaceDeAviso(enlaceDeFactura(base, 77), 5)).toBe(`${base}?f=77&a=5`);
  });

  it('llega también por el botón de WhatsApp', () => {
    expect(sufijoDeBoton(enlaceDeAviso(enlaceDeFactura(base, 77), 5))).toBe('tok?f=77&a=5');
  });
});

describe('lo que recibe la familia por WhatsApp', () => {
  const plantilla = { cuerpo: 'Hola, de {{1}}: {{2}} debe {{3}}.', pie: 'Gracias' };

  it('la plantilla con sus variables y el pie', () => {
    expect(textoDePlantilla(plantilla, ['Mi Casita', 'Ana', 'RD$500'], false))
      .toBe('Hola, de Mi Casita: Ana debe RD$500.\n\nGracias');
  });

  it('dice que lleva el botón del enlace', () => {
    expect(textoDePlantilla({ cuerpo: 'Hola {{1}}', pie: null }, ['Ana'], true)).toBe('Hola Ana\n\n[Botón con el enlace de pago]');
  });

  it('una variable que falta no se inventa', () => {
    expect(textoDePlantilla({ cuerpo: 'Hola {{1}} y {{2}}', pie: null }, ['Ana'], false)).toBe('Hola Ana y {{2}}');
  });

  it('sin la plantilla guardada no hay texto', () => {
    expect(textoDePlantilla(undefined, ['Ana'], false)).toBeNull();
  });
});
