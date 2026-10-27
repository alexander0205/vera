import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/email', () => ({ resend: { emails: { send: vi.fn() } }, assertSent: vi.fn() }));

import { armarCorreoTarea, urlDeTarea, type DatosAvisoTarea } from '@/lib/email/escolar-tareas';

/**
 * El correo de una tarea por revisar: lo que lee quien tiene que decidir sin
 * abrir el sistema. Tiene que decir de qué se trata y llevar a la tarea.
 */

const base: DatosAvisoTarea = {
  aviso: 'creada', colegio: 'Colegio Demo', tareaId: 12,
  titulo: 'Decidir qué hacer con RD$3,000 de pago de más', de: 'Mateo Rosario', asignada: 'Lizandro',
  autor: 'Soporte IT · Zero', texto: '¿Sala de tarea de septiembre o saldo a favor?', documento: 'FA-2026-000629',
};

describe('el correo de una tarea', () => {
  it('al crearla dice quién la creó, para quién y de qué alumno', () => {
    const c = armarCorreoTarea(base);
    expect(c.asunto).toBe('Tarea por revisar: Decidir qué hacer con RD$3,000 de pago de más');
    expect(c.texto).toContain('Soporte IT · Zero creó una tarea para Lizandro en Colegio Demo.');
    expect(c.texto).toContain('De: Mateo Rosario · Asignada a Lizandro · FA-2026-000629');
    expect(c.texto).toContain('¿Sala de tarea de septiembre o saldo a favor?');
  });

  it('una tarea del colegio dice «Del colegio», sin «De:»', () => {
    const c = armarCorreoTarea({ ...base, de: 'Del colegio', documento: null });
    expect(c.texto).toContain('Del colegio · Asignada a Lizandro');
    expect(c.texto).not.toContain('De: Del colegio');
  });

  it('cada cambio tiene su asunto', () => {
    expect(armarCorreoTarea({ ...base, aviso: 'mensaje', autor: 'Lizandro' }).asunto).toMatch(/^Lizandro respondió: /);
    expect(armarCorreoTarea({ ...base, aviso: 'completada' }).asunto).toMatch(/^Completada: /);
    expect(armarCorreoTarea({ ...base, aviso: 'reabierta' }).asunto).toMatch(/^Abierta de nuevo: /);
  });

  it('el botón lleva a la tarea en «Por revisar»', () => {
    const c = armarCorreoTarea(base);
    expect(urlDeTarea(12)).toMatch(/\/escolar\/por-revisar\?tarea=12$/);
    expect(c.html).toContain(urlDeTarea(12));
    expect(c.texto).toContain(`Abrir la tarea: ${urlDeTarea(12)}`);
  });

  it('lo que escribió la gente va escapado en el HTML', () => {
    const c = armarCorreoTarea({ ...base, texto: '<script>alert(1)</script>' });
    expect(c.html).not.toContain('<script>');
    expect(c.html).toContain('&lt;script&gt;');
  });
});
