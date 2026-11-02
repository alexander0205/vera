import { describe, it, expect } from 'vitest';
import {
  AUTOR_SOPORTE, AUTOR_ZERO_AI, aQuienAvisar, autorDe, autorTarea, etiquetaAsignada, textoEvento,
  validarMensaje, validarNuevaTarea,
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
  it('el equipo de Zero se lee como Departamento de IT y la persona con su nombre', () => {
    expect(etiquetaAsignada('soporte')).toBe('Departamento de IT · Zero');
    expect(etiquetaAsignada('persona', 'Lizandro')).toBe('Lizandro');
    expect(etiquetaAsignada('persona', null)).toBe('Una persona');
  });
});

describe('crear una tarea', () => {
  const base = { titulo: 'Decidir qué hacer con RD$3,000 de pago de más', asignadaA: 'soporte' };

  it('pide el título y a quién se asigna', () => {
    expect(validarNuevaTarea({ ...base, titulo: '   ' })).toEqual({ ok: false, error: 'Escribe qué hay que revisar.' });
    expect(validarNuevaTarea({ ...base, asignadaA: 'el que sea' })).toEqual({ ok: false, error: 'Elige a quién se le asigna.' });
  });

  it('ya no se asigna a un grupo sin nombre: solo a Soporte IT o a una persona', () => {
    expect(validarNuevaTarea({ ...base, asignadaA: 'direccion' }).ok).toBe(false);
    expect(validarNuevaTarea({ ...base, asignadaA: 'administracion' }).ok).toBe(false);
  });

  it('a una persona hace falta decir cuál', () => {
    expect(validarNuevaTarea({ ...base, asignadaA: 'persona' })).toEqual({ ok: false, error: 'Elige a la persona.' });
    const v = validarNuevaTarea({ ...base, asignadaA: 'persona', asignadaUserId: '41' });
    expect(v.ok && v.tarea.asignadaUserId).toBe(41);
  });

  it('a Soporte IT no se le guarda persona aunque llegue una', () => {
    const v = validarNuevaTarea({ ...base, asignadaUserId: 41 });
    expect(v.ok && v.tarea.asignadaUserId).toBeNull();
  });

  it('limpia lo que llega: alcance, descripción vacía, factura y fecha', () => {
    const v = validarNuevaTarea({ ...base, alcance: 'familia', descripcion: '  ', ecfDocumentId: '3636', venceEl: '2026-10-31' });
    expect(v).toEqual({
      ok: true,
      tarea: {
        alcance: 'familia', titulo: base.titulo, descripcion: null, asignadaA: 'soporte',
        asignadaUserId: null, ecfDocumentId: 3636, venceEl: '2026-10-31',
      },
    });
    const sinAlcance = validarNuevaTarea(base);
    expect(sinAlcance.ok && sinAlcance.tarea.alcance).toBe('alumno');
  });

  it('una tarea del colegio no es de ningún alumno; un alcance desconocido cae en el del alumno', () => {
    const delColegio = validarNuevaTarea({ ...base, alcance: 'colegio' });
    expect(delColegio.ok && delColegio.tarea.alcance).toBe('colegio');
    const raro = validarNuevaTarea({ ...base, alcance: 'todo' });
    expect(raro.ok && raro.tarea.alcance).toBe('alumno');
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

describe('a quién le llega el correo', () => {
  const deLizandro = { asignadaA: 'persona', asignadaUserId: 35, creadaPorUserId: 4 };
  const alSoporte = { asignadaA: 'soporte', asignadaUserId: null, creadaPorUserId: 35 };
  const yo = (userId: number, esSoporte = false) => ({ userId, esSoporte });

  it('al crearla, solo a quien se le asignó', () => {
    expect(aQuienAvisar(deLizandro, [], 'creada', yo(4))).toEqual({ usuarios: [35], soporte: false });
    expect(aQuienAvisar(alSoporte, [], 'creada', yo(35))).toEqual({ usuarios: [], soporte: true });
  });

  it('una respuesta le llega también a quien la creó y a quien ya escribió, nunca a quien responde', () => {
    expect(aQuienAvisar(deLizandro, [35, 41], 'mensaje', yo(35))).toEqual({ usuarios: [4, 41], soporte: false });
    expect(aQuienAvisar(deLizandro, [41], 'completada', yo(41)).usuarios.sort()).toEqual([35, 4].sort());
  });

  it('Soporte no se avisa a sí mismo', () => {
    expect(aQuienAvisar(alSoporte, [], 'mensaje', yo(1, true))).toEqual({ usuarios: [35], soporte: false });
  });

  it('lo que abre Zero AI le llega a la persona asignada', () => {
    const deIa = { asignadaA: 'persona', asignadaUserId: 35, creadaPorUserId: null };
    expect(aQuienAvisar(deIa, [], 'creada', AUTOR_ZERO_AI)).toEqual({ usuarios: [35], soporte: false });
  });

  it('quien hace el cambio firma como en la conversación', () => {
    expect(autorTarea({ id: 1, name: 'Alexander', email: 'a@zero.com.do', platformRole: 'admin' }))
      .toEqual({ userId: 1, nombre: AUTOR_SOPORTE, esSoporte: true });
    expect(autorTarea({ id: 35, name: 'Lizandro', email: 'l@colegio.do', platformRole: null }))
      .toEqual({ userId: 35, nombre: 'Lizandro', esSoporte: false });
  });
});
