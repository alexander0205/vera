/**
 * El registro no puede convertirse en un detector de correos con cuenta.
 *
 * Si al intentar registrarte con un correo que ya existe la pantalla dijera
 * «ese correo ya está registrado», cualquiera podría probar una lista y saber
 * quién es cliente. Por eso el alta responde SIEMPRE lo mismo, exista el correo
 * o falle por cualquier otra razón.
 *
 * Lo que sí se arregló es que ese mensaje no llevaba a ninguna parte: decía
 * «Intenta de nuevo», o sea, repite exactamente lo que acaba de fallar. Ahora
 * sugiere entrar en vez de registrarse — que se puede decir sin afirmar nada,
 * porque se dice siempre.
 *
 * Y el nombre: el formulario lo repinta con `state.name`, pero `signUp` solo
 * devolvía `email` y `password`, así que en cada fallo había que reescribirlo.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz    = join(__dirname, '..', '..');
const alta    = readFileSync(join(raiz, 'lib/auth/alta.ts'), 'utf8');
const actions = readFileSync(join(raiz, 'app/(login)/actions.ts'), 'utf8');
const login   = readFileSync(join(raiz, 'app/(login)/login.tsx'), 'utf8');

/** El cuerpo de darDeAlta, sin comentarios: solo lo que se ejecuta. */
const cuerpoAlta = alta
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

describe('el mensaje de alta fallida no revela nada', () => {
  it('no nombra que el correo ya exista', () => {
    expect(cuerpoAlta).not.toMatch(/ya (está|esta) registrad/i);
    expect(cuerpoAlta).not.toMatch(/correo.*en uso|email.*taken|already exists/i);
  });

  it('es un único mensaje compartido por todas las salidas fallidas', () => {
    // Dos ramas: correo repetido, e inserción que no devuelve fila.
    const usos = (cuerpoAlta.match(/MENSAJE_ALTA_FALLIDA/g) ?? []).length;
    expect(usos).toBeGreaterThanOrEqual(3); // la definición + las dos ramas
  });

  it('dice qué hacer en vez de mandar a repetir lo que falló', () => {
    expect(alta).toMatch(/entra en su lugar/i);
    expect(alta).not.toMatch(/'No se pudo crear el usuario\. Intenta de nuevo\.'/);
  });
});

describe('un registro fallido no borra lo que ya escribiste', () => {
  it('signUp devuelve el nombre junto al correo y la contraseña', () => {
    // Las dos salidas con error del registro.
    const salidas = actions.match(/return \{ error: [^}]*\}/g) ?? [];
    const deRegistro = salidas.filter(s => s.includes('email') && s.includes('password'));
    expect(deRegistro.length).toBeGreaterThanOrEqual(2);
    for (const s of deRegistro) expect(s).toContain('name');
  });

  it('la pantalla sigue repintando los tres campos', () => {
    expect(login).toContain('defaultValue={state.name');
    expect(login).toContain('defaultValue={state.email');
    expect(login).toContain('defaultValue={state.password');
  });
});
