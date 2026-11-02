import { describe, it, expect } from 'vitest';
import {
  limpiarParametro, parametrosTareaWhatsApp, PLANTILLA_TAREA_WHATSAPP as P,
} from '@/lib/notificaciones/plantilla-tarea-whatsapp';
import { esFirmaSoporte, AUTOR_SOPORTE } from '@/lib/administracion-escolar/tareas-reglas';

/**
 * Los avisos de las tareas por WhatsApp salen SOLO con una plantilla aprobada
 * por Meta (29-10-2026). Meta rechaza plantillas que empiezan o terminan con
 * una variable, o con dos variables pegadas, y parámetros con saltos de línea.
 */

describe('la plantilla de Meta', () => {
  it('tiene las 5 variables, en orden, y no empieza ni termina con una', () => {
    const vars = [...P.cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    expect(vars).toEqual([1, 2, 3, 4, 5]);
    expect(P.cuerpo.trimStart().startsWith('{{')).toBe(false);
    expect(P.cuerpo.trimEnd().endsWith('}}')).toBe(false);
    expect(P.cuerpo).not.toMatch(/\}\}\s*\{\{/);
    expect(P.variables.map((v) => v.pos)).toEqual([1, 2, 3, 4, 5]);
    expect(P.pie.length).toBeLessThanOrEqual(60);
    expect(P.cuerpo.length).toBeLessThanOrEqual(1024);
  });
});

describe('los parámetros', () => {
  it('dicen a quién, de qué colegio, qué pasó, qué tarea y el enlace', () => {
    expect(parametrosTareaWhatsApp({
      nombre: 'Lizandro', colegio: 'INFANTIL MI CASITA II SRL', cambio: 'revision',
      autor: AUTOR_SOPORTE, titulo: 'Saber', url: 'https://app.zero.com.do/escolar/por-revisar?tarea=8',
    })).toEqual([
      'Lizandro', 'INFANTIL MI CASITA II SRL', 'La tarea quedó en revisión: revísala y confírmanos', 'Saber',
      'https://app.zero.com.do/escolar/por-revisar?tarea=8',
    ]);
  });
  it('sin saltos de línea ni vacíos, que Meta rechaza', () => {
    expect(limpiarParametro('Hola\n\nmundo\t  x')).toBe('Hola mundo x');
    expect(limpiarParametro('   ')).toBe('-');
    expect(limpiarParametro('x'.repeat(300), 10)).toHaveLength(10);
  });
});

describe('Departamento de IT', () => {
  it('reconoce la firma nueva y la de antes en las conversaciones guardadas', () => {
    expect(AUTOR_SOPORTE).toBe('Departamento de IT · Zero');
    expect(esFirmaSoporte('Soporte IT · Zero')).toBe(true);
    expect(esFirmaSoporte('Departamento de IT · Zero')).toBe(true);
    expect(esFirmaSoporte('Lic. Lizandro Martinez')).toBe(false);
  });
});
