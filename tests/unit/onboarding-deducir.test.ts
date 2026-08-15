/**
 * Lo que el onboarding deduce solo.
 *
 * Se prueba porque de aquí sale el plan que se le va a cobrar a la gente: una
 * deducción torcida no rompe nada visiblemente, solo pone a todo el mundo en
 * el escalón equivocado y eso se descubre facturando.
 *
 * Los valores de `actividad` de las pruebas son los de verdad, tal como llegan
 * del padrón de la DGII: RECORTADOS a 10 caracteres. Si alguien "arregla" el
 * código comparando contra los textos completos, estas pruebas se caen — que
 * es justo lo que tienen que hacer.
 */

import { describe, it, expect } from 'vitest';
import {
  lineaPorActividad, tramoPorFacturas, planSugerido, estadoFiscal, preguntaDeTamano,
} from '@/lib/onboarding/deducir';

describe('lineaPorActividad', () => {
  it('manda los colegios a la línea de colegio', () => {
    // Llega así de recortado: «ENSEÑANZA PRIMARIA» y «ENSEÑANZA PRIVADA» son
    // las dos `ENSEÑANZA ` en el padrón.
    expect(lineaPorActividad('ENSEÑANZA ')).toBe('erp-colegio');
  });

  it('manda el mostrador a POS + ERP', () => {
    expect(lineaPorActividad('VENTA AL P')).toBe('pos-erp');
    expect(lineaPorActividad('COLMADOS')).toBe('pos-erp');
  });

  it('todo lo demás cae en ERP, que es lo que sirve a cualquiera que facture', () => {
    expect(lineaPorActividad('SERVICIOS')).toBe('erp');
    expect(lineaPorActividad('FABRICACIÓ')).toBe('erp');
    expect(lineaPorActividad('CONSTR. RE')).toBe('erp');
  });

  it('sin actividad no adivina: ERP', () => {
    expect(lineaPorActividad(null)).toBe('erp');
    expect(lineaPorActividad('')).toBe('erp');
    expect(lineaPorActividad('   ')).toBe('erp');
  });

  it('no le importan las mayúsculas ni los espacios de sobra', () => {
    expect(lineaPorActividad('  enseñanza privada ')).toBe('erp-colegio');
  });
});

describe('tramoPorFacturas', () => {
  it('coloca cada volumen en su escalón', () => {
    expect(tramoPorFacturas(50)?.key).toBe('emprendedor');
    expect(tramoPorFacturas(200)?.key).toBe('negocio');
    expect(tramoPorFacturas(500)?.key).toBe('pro');
  });

  it('quien pasa del tope más alto va al plan sin tope', () => {
    expect(tramoPorFacturas(5000)?.key).toBe('ilimitado');
    expect(tramoPorFacturas(1_000_000)?.key).toBe('ilimitado');
  });

  it('el límite es inclusivo: 50 facturas caben en el plan de 50', () => {
    expect(tramoPorFacturas(50)?.key).toBe('emprendedor');
    expect(tramoPorFacturas(51)?.key).toBe('negocio');
  });
});

describe('planSugerido', () => {
  it('para colegio pregunta por estudiantes, no por facturas', () => {
    // 300 estudiantes es el tramo Intermedio. Si se equivocara de familia,
    // 300 caería en un plan de e-CF y el colegio se quedaría sin su módulo.
    expect(planSugerido('erp-colegio', 300)?.key).toBe('colegio-intermedio');
    expect(planSugerido('erp-colegio', 150)?.key).toBe('colegio-basico');
    expect(planSugerido('erp-colegio', 800)?.key).toBe('colegio-institucional');
  });

  it('POS y ERP comparten la familia de e-CF', () => {
    expect(planSugerido('erp', 200)?.key).toBe('negocio');
    expect(planSugerido('pos-erp', 200)?.key).toBe('negocio');
  });

  it('devuelve las CLAVES de los planes, no sus nombres', () => {
    // Guardar el nombre en vez de la clave es el fallo que dejó a cinco de los
    // ocho planes cayendo a Gratis después de cobrar.
    const plan = planSugerido('erp-colegio', 500);
    expect(plan?.key).toBe('colegio-avanzado');
    expect(plan?.name).toBe('Avanzado');
  });
});

describe('estadoFiscal', () => {
  it('el 2 es el único activo — verificado contra nuestros clientes reales', () => {
    const r = estadoFiscal('2');
    expect(r.activo).toBe(true);
    expect(r.aviso).toBeNull();
  });

  it('cualquier otro estado avisa pero NO bloquea', () => {
    for (const e of ['3', '0', '4', '', null, undefined]) {
      const r = estadoFiscal(e);
      expect(r.activo).toBe(false);
      expect(r.aviso).toBeTruthy();
    }
  });
});

describe('preguntaDeTamano', () => {
  it('al colegio le pregunta por estudiantes', () => {
    expect(preguntaDeTamano('erp-colegio').titulo).toMatch(/estudiantes/i);
  });

  it('al resto por facturas', () => {
    expect(preguntaDeTamano('erp').titulo).toMatch(/facturas/i);
    expect(preguntaDeTamano('pos-erp').titulo).toMatch(/facturas/i);
  });

  it('cada opción cae en un plan distinto, sin escalones muertos', () => {
    // Si dos opciones dieran el mismo plan, una de las dos sobraría y estaría
    // haciendo perder un clic a todo el mundo.
    for (const linea of ['erp', 'erp-colegio'] as const) {
      const claves = preguntaDeTamano(linea).opciones
        .map(o => planSugerido(linea, o.valor)?.key);
      expect(claves.every(Boolean)).toBe(true);
      expect(new Set(claves).size).toBe(claves.length);
    }
  });
});
