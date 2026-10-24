import { describe, it, expect } from 'vitest';
import {
  AUTOR_SOPORTE, autorDe, etiquetaAsignada, textoEvento, validarMensaje, validarNuevaTarea,
} from '@/lib/administracion-escolar/tareas-reglas';

/**
 * Las tareas por revisar nacen de los casos que se arreglaban por SQL de
 * soporte (Mi Casita, 24-10-2026): un pago de más sin decidir, una factura que
 * no cuadra con su cargo, una mora que se corre un mes. Estas son sus reglas.
 */

describe('quién firma en la conversación', () => {
  it('el equipo de Zero firma como Soporte IT aunque entre a la empresa del colegio', () => {
    expect(autorDe({ name: 'Alexander', email: 'a@zero.com.do', platformRole: 'admin' })).toBe(AUTOR_SOPORTE);
  });
  it('una persona del colegio firma con su nombre, o con su correo si no tiene', () => {
    expect(autorDe({ name: '  Lizandro ', email: 'l@colegio.do', platformRole: 'member' })).toBe('Lizandro');
    expect(autorDe({ name: null, email: 'caja@colegio.do', platformRole: 'member' })).toBe('caja@colegio.do');
  });
});

describe('a quién le toca', () => {
  it('los grupos se leen con su nombre y la persona con el suyo', () => {
    expect(etiquetaAsignada('direccion')).toBe('Dirección');
    expect(etiquetaAsignada('administracion')).toBe('Administración');
    expect(etiquetaAsignada('soporte')).toBe('Soporte IT · Zero');
    expect(etiquetaAsignada('persona', 'Lizandro')).toBe('Lizandro');
    expect(etiquetaAsignada('persona', null)).toBe('Una persona');
  });
});

describe('crear una tarea', () => {
  const base = { titulo: 'Decidir qué hacer con RD$3,000 de pago de más', asignadaA: 'administracion' };

  it('pide el título y a quién se asigna', () => {
    expect(validarNuevaTarea({ ...base, titulo: '   ' })).toEqual({ ok: false, error: 'Escribe qué hay que revisar.' });
    expect(validarNuevaTarea({ ...base, asignadaA: 'el que sea' })).toEqual({ ok: false, error: 'Elige a quién se le asigna.' });
  });

  it('a una persona hace falta decir cuál', () => {
    expect(validarNuevaTarea({ ...base, asignadaA: 'persona' })).toEqual({ ok: false, error: 'Elige a la persona.' });
    const v = validarNuevaTarea({ ...base, asignadaA: 'persona', asignadaUserId: '41' });
    expect(v.ok && v.tarea.asignadaUserId).toBe(41);
  });

  it('a un grupo no se le guarda persona aunque llegue una', () => {
    const v = validarNuevaTarea({ ...base, asignadaUserId: 41 });
    expect(v.ok && v.tarea.asignadaUserId).toBeNull();
  });

  it('limpia lo que llega: alcance, descripción vacía, factura y fecha', () => {
    const v = validarNuevaTarea({ ...base, alcance: 'familia', descripcion: '  ', ecfDocumentId: '3636', venceEl: '2026-10-31' });
    expect(v).toEqual({
      ok: true,
      tarea: {
        alcance: 'familia', titulo: base.titulo, descripcion: null, asignadaA: 'administracion',
        asignadaUserId: null, ecfDocumentId: 3636, venceEl: '2026-10-31',
      },
    });
    const sinAlcance = validarNuevaTarea(base);
    expect(sinAlcance.ok && sinAlcance.tarea.alcance).toBe('alumno');
  });

  it('rechaza una fecha mal escrita y un título demasiado largo', () => {
    expect(validarNuevaTarea({ ...base, venceEl: '31/10/2026' })).toEqual({ ok: false, error: 'La fecha no es válida.' });
    expect(validarNuevaTarea({ ...base, titulo: 'x'.repeat(161) }).ok).toBe(false);
  });
});

describe('la conversación', () => {
  it('no se envía un mensaje vacío', () => {
    expect(validarMensaje('   ')).toEqual({ ok: false, error: 'Escribe algo antes de enviar.' });
    expect(validarMensaje(' Sí, pásenlo a octubre. ')).toEqual({ ok: true, texto: 'Sí, pásenlo a octubre.' });
  });
  it('cada cambio deja su línea', () => {
    expect(textoEvento.creada('Soporte IT · Zero', 'Administración')).toBe('Soporte IT · Zero creó la tarea y la asignó a Administración');
    expect(textoEvento.completada('Lizandro')).toBe('Lizandro marcó la tarea como completada');
    expect(textoEvento.reabierta('Dirección')).toBe('Dirección volvió a abrir la tarea');
  });
});
