import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

/**
 * Una empresa nunca puede quedarse sin nadie que pueda entrar.
 *
 * Suena obvio y en producción pasó cuatro veces. Dos caminos distintos llevaban
 * al mismo sitio —una empresa creada, con sus secuencias e-NCF sembradas, y
 * cero personas dentro— y ninguno avisaba:
 *
 *   1. Al CREARLA: `crearEmpresa` preguntaba si el correo invitado «ya existe»
 *      con una consulta que traía cualquier usuario de la plataforma. Un correo
 *      con cuenta en OTRA empresa hacía que no se mandara la invitación. Le
 *      pasó al team 6 (CETHA): 0 miembros, 0 invitaciones, y un team 7 idéntico
 *      creado el mismo día porque la primera vez «no hizo nada».
 *
 *   2. Al VACIARLA: `eliminarMiembro` del panel de admin no contaba cuánta
 *      gente quedaba. Le pasó al team 23 (PEKE KINGS) el 2026-08-10.
 *
 * Se prueba la regla, no la consulta: lo que no puede volver a pasar es que una
 * empresa acabe sin entrada, venga por donde venga.
 */

/** Empresa con su gente dentro y sus invitaciones pendientes. */
function empresa() {
  const miembros = new Set<string>();
  const invitaciones = new Set<string>();
  return {
    miembros,
    invitaciones,
    /** ¿Puede alguien entrar? Un miembro dentro, o una invitación viva. */
    get alcanzable() { return miembros.size > 0 || invitaciones.size > 0; },
    quitar(correo: string) {
      // La guardia: no dejar la empresa sin nadie.
      if (miembros.size <= 1) return { ok: false, motivo: 'ultimo_miembro' };
      miembros.delete(correo);
      return { ok: true };
    },
  };
}

/** Alta de empresa. `cuentasEnLaPlataforma` = correos que ya tienen cuenta. */
function crearEmpresa(
  invitar: string | null,
  cuentasEnLaPlataforma: string[],
  { comoAntes = false } = {},
) {
  const e = empresa();
  if (invitar) {
    // El bug: cortaba si el correo tenía cuenta en CUALQUIER empresa.
    const salta = comoAntes && cuentasEnLaPlataforma.includes(invitar);
    if (!salta) e.invitaciones.add(invitar);
  }
  return e;
}

describe('una empresa nueva siempre queda alcanzable', () => {
  test('se invita aunque el correo ya tenga cuenta en otra empresa', () => {
    const e = crearEmpresa('ferrerasalexander@gmail.com', ['ferrerasalexander@gmail.com']);
    assert.equal(e.invitaciones.size, 1);
    assert.ok(e.alcanzable);
  });

  test('con el código viejo ese mismo caso nacía muerta — el team 6', () => {
    const e = crearEmpresa(
      'ferrerasalexander@gmail.com',
      ['ferrerasalexander@gmail.com'],
      { comoAntes: true },
    );
    assert.equal(e.invitaciones.size, 0);
    assert.equal(e.alcanzable, false);
  });

  test('un correo sin cuenta se invitaba bien: por eso el bug pasó desapercibido', () => {
    const e = crearEmpresa('nuevo@colegio.edu.do', ['otro@cosa.com'], { comoAntes: true });
    assert.ok(e.alcanzable);
  });
});

describe('no se puede vaciar una empresa', () => {
  test('quitar al último miembro se rechaza', () => {
    const e = empresa();
    e.miembros.add('director@colegio.edu.do');

    const r = e.quitar('director@colegio.edu.do');

    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'ultimo_miembro');
    assert.ok(e.alcanzable);
  });

  test('con dos dentro sí se puede quitar a uno', () => {
    const e = empresa();
    e.miembros.add('director@colegio.edu.do');
    e.miembros.add('secretaria@colegio.edu.do');

    assert.equal(e.quitar('secretaria@colegio.edu.do').ok, true);
    assert.equal(e.miembros.size, 1);
    assert.ok(e.alcanzable);
  });

  test('quitando de uno en uno nunca se llega a cero — lo del team 23', () => {
    const e = empresa();
    for (const c of ['a@x.do', 'b@x.do', 'c@x.do']) e.miembros.add(c);

    for (const c of ['a@x.do', 'b@x.do', 'c@x.do']) e.quitar(c);

    assert.equal(e.miembros.size, 1);
    assert.ok(e.alcanzable);
  });

  test('una invitación pendiente no autoriza a vaciarla: puede expirar', () => {
    const e = empresa();
    e.miembros.add('director@colegio.edu.do');
    e.invitaciones.add('nuevo@colegio.edu.do');

    assert.equal(e.quitar('director@colegio.edu.do').ok, false);
  });
});
