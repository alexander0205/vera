import { describe, expect, it } from 'vitest';
import {
  evaluarCambioDeEquipo, metaDeAuditoria, normalizarCorreo, normalizarNombre,
  type ActorEquipo, type ObjetivoEquipo,
} from '@/lib/auth/equipo-zero-reglas';

/**
 * Quién puede agregar y quitar administradores de la plataforma, y a quién.
 * Un administrador tiene acceso a TODAS las empresas, así que estas reglas son
 * lo que impide que uno recién agregado saque al dueño o deje la plataforma sin
 * nadie. Si una de estas pruebas se pone en rojo, alguien perdió una protección.
 */

const dueno: ActorEquipo = { id: 1, esAdmin: true, esDueno: true };
const admin: ActorEquipo = { id: 2, esAdmin: true, esDueno: false };
const usuario: ActorEquipo = { id: 9, esAdmin: false, esDueno: false };

const adminObj = (id: number, esDueno = false): ObjetivoEquipo => ({ id, esAdmin: true, esDueno, verificado: true });
const miembroObj = (id: number, verificado = true): ObjetivoEquipo => ({ id, esAdmin: false, esDueno: false, verificado });

const cambio = (o: Partial<Parameters<typeof evaluarCambioDeEquipo>[0]>) =>
  evaluarCambioDeEquipo({ accion: 'agregar', actor: dueno, objetivo: null, confirmado: true, adminsActivos: 2, ...o });

describe('quién puede tocar al equipo', () => {
  it('sin sesión: 401', () => {
    for (const accion of ['agregar', 'quitar'] as const) {
      expect(cambio({ accion, actor: null })).toMatchObject({ ok: false, status: 401, codigo: 'no_autenticado' });
    }
  });

  it('una cuenta normal: 403, sin importar a quién', () => {
    for (const accion of ['agregar', 'quitar'] as const) {
      expect(cambio({ accion, actor: usuario, objetivo: adminObj(3) })).toMatchObject({ ok: false, status: 403, codigo: 'no_admin' });
    }
  });

  it('un admin que no es dueño: 403 en agregar y en quitar', () => {
    expect(cambio({ accion: 'agregar', actor: admin })).toMatchObject({ ok: false, status: 403, codigo: 'solo_dueno' });
    expect(cambio({ accion: 'quitar', actor: admin, objetivo: adminObj(3) })).toMatchObject({ ok: false, status: 403, codigo: 'solo_dueno' });
  });

  it('un dueño al que ya le quitaron el admin (rol viejo en la sesión) no puede nada', () => {
    const revocado: ActorEquipo = { id: 1, esAdmin: false, esDueno: true };
    expect(cambio({ actor: revocado })).toMatchObject({ ok: false, status: 403, codigo: 'no_admin' });
  });

  it('a quien no puede no se le cuenta nada de las demás cuentas', () => {
    // Mismo veredicto aunque el objetivo sea el último admin o un dueño.
    const v = cambio({ accion: 'quitar', actor: admin, objetivo: adminObj(1, true), adminsActivos: 1 });
    expect(v).toMatchObject({ ok: false, codigo: 'solo_dueno' });
  });

  it('sin confirmar no se hace nada', () => {
    expect(cambio({ confirmado: false })).toMatchObject({ ok: false, status: 400, codigo: 'sin_confirmar' });
    expect(cambio({ accion: 'quitar', objetivo: adminObj(3), confirmado: false })).toMatchObject({ ok: false, codigo: 'sin_confirmar' });
  });
});

describe('agregar', () => {
  it('una cuenta nueva (objetivo null) o una normal se puede agregar', () => {
    expect(cambio({ objetivo: null })).toEqual({ ok: true });
    expect(cambio({ objetivo: miembroObj(5) })).toEqual({ ok: true });
  });

  it('una cuenta que NO ha verificado su correo no se promueve (pudo abrirla otra persona con ese correo)', () => {
    expect(cambio({ objetivo: miembroObj(5, false) })).toMatchObject({ ok: false, status: 409, codigo: 'correo_sin_verificar' });
  });

  it('el correo sin verificar solo importa al agregar, y a quien no puede no se le cuenta', () => {
    expect(cambio({ actor: admin, objetivo: miembroObj(5, false) })).toMatchObject({ codigo: 'solo_dueno' });
    expect(cambio({ accion: 'quitar', objetivo: { ...adminObj(3), verificado: false } })).toEqual({ ok: true });
  });

  it('quien ya es admin: 409', () => {
    expect(cambio({ objetivo: adminObj(5) })).toMatchObject({ ok: false, status: 409, codigo: 'ya_es_admin' });
  });
});

describe('quitar', () => {
  const quitar = (objetivo: ObjetivoEquipo | null, extra: Partial<Parameters<typeof evaluarCambioDeEquipo>[0]> = {}) =>
    cambio({ accion: 'quitar', objetivo, ...extra });

  it('un admin normal se puede quitar', () => {
    expect(quitar(adminObj(3))).toEqual({ ok: true });
  });

  it('una cuenta que no es admin, o que no existe: 409', () => {
    expect(quitar(miembroObj(3))).toMatchObject({ ok: false, status: 409, codigo: 'no_es_admin' });
    expect(quitar(null)).toMatchObject({ ok: false, status: 409, codigo: 'no_es_admin' });
  });

  it('nadie se quita a sí mismo, ni siendo dueño', () => {
    expect(quitar(adminObj(dueno.id, true))).toMatchObject({ ok: false, status: 400, codigo: 'a_si_mismo' });
  });

  it('un dueño no se quita desde la pantalla', () => {
    expect(quitar(adminObj(7, true))).toMatchObject({ ok: false, status: 403, codigo: 'es_dueno' });
  });

  it('NO se puede quitar al último administrador', () => {
    expect(quitar(adminObj(3), { adminsActivos: 1 })).toMatchObject({ ok: false, status: 409, codigo: 'ultimo_admin' });
    expect(quitar(adminObj(3), { adminsActivos: 0 })).toMatchObject({ ok: false, codigo: 'ultimo_admin' });
  });

  it('con dos admins sí se puede quitar uno (queda uno)', () => {
    expect(quitar(adminObj(3), { adminsActivos: 2 })).toEqual({ ok: true });
  });

  it('el orden de las comprobaciones: el último admin que además es uno mismo dice «a ti mismo»', () => {
    expect(quitar(adminObj(dueno.id, true), { adminsActivos: 1 })).toMatchObject({ codigo: 'a_si_mismo' });
  });
});

describe('normalizar lo que llega del formulario', () => {
  it('el correo se guarda en minúsculas y sin espacios', () => {
    expect(normalizarCorreo('  Ana.Perez@Zero.com.do ')).toBe('ana.perez@zero.com.do');
  });

  it.each(['', '   ', 'sin-arroba', 'a@b', '@zero.com.do', 'a b@zero.com.do', 'x@y@z.com', 123, null, undefined, {}, ['a@b.co']])(
    'no es un correo: %j', (v) => { expect(normalizarCorreo(v)).toBeNull(); },
  );

  it('un correo kilométrico se rechaza', () => {
    expect(normalizarCorreo(`${'a'.repeat(250)}@zero.com.do`)).toBeNull();
  });

  it('el nombre se recorta, se aplana y se limita a 100', () => {
    expect(normalizarNombre('  Ana \n  Pérez ')).toBe('Ana Pérez');
    expect(normalizarNombre('x'.repeat(300))).toHaveLength(100);
    expect(normalizarNombre('   ')).toBeNull();
    expect(normalizarNombre(42)).toBeNull();
  });

  it('la auditoría lleva quién, a quién y cuántos quedan', () => {
    const m = metaDeAuditoria({
      accion: 'quitar', actor: { id: 1, email: 'a@z.do' }, objetivo: { id: 3, email: 'b@z.do' }, adminsDespues: 1,
    });
    expect(m).toEqual({
      accion: 'quitar', actor: { id: 1, email: 'a@z.do' }, objetivo: { id: 3, email: 'b@z.do' },
      cuentaNueva: false, adminsDespues: 1,
    });
  });
});
