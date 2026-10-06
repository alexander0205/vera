/**
 * El buscador de Gobernanza: a quién encuentra y a dónde lleva.
 *
 * Tres cosas que no hacía:
 *
 * 1. Buscar al padre que NO paga no encontraba a nadie: solo se miraban los
 *    contactos a los que se les factura, y él figura únicamente como tutor.
 *
 * 2. Buscar a una madre cuya única ficha de alumno era una copia ya retirada
 *    la llevaba a su propia ficha de responsable —vacía—, mientras el hijo
 *    activo y su deuda estaban en la del otro padre. Y debajo salía otra vez,
 *    como «Cliente», con un enlace al formulario de Contactos de Facturación.
 *
 * 3. Buscar por cédula solo funcionaba tecleándola exactamente como se guardó.
 *    Se guarda pelada (`40212345678`) y se lee con guiones (`402-1234567-8`).
 *
 * La regla: busques a quien busques, se abre la ficha del responsable de pago
 * de su hijo activo. Buscar al alumno abre la ficha del alumno.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coincideDocumento, digitosDeDocumento, fmtDocumento } from '@/lib/busqueda/documento';
import { resolverFamilias, type VinculoFamilia } from '@/lib/busqueda/familias';

const raiz = join(__dirname, '..', '..');
const lee  = (p: string) => readFileSync(join(raiz, p), 'utf8');

/** Un vínculo con todo lo que no importa en la prueba ya puesto. */
function vinculo(v: Partial<VinculoFamilia>): VinculoFamilia {
  return {
    personaClientId: null, tutorId: null, nombre: 'SIN NOMBRE', documento: null, relacion: null,
    estudianteId: null, alumno: null, activo: false, destinoId: null, destino: null,
    pagadorAsignado: true,
    ...v,
  };
}

describe('el documento se compara por sus dígitos', () => {
  it('una cédula con guiones, con puntos o pelada da los mismos dígitos', () => {
    expect(digitosDeDocumento('402-1234567-8')).toBe('40212345678');
    expect(digitosDeDocumento('402.1234567.8')).toBe('40212345678');
    expect(digitosDeDocumento(' 402 1234567 8 ')).toBe('40212345678');
    expect(digitosDeDocumento('40212345678')).toBe('40212345678');
  });

  it('un trozo de cédula también vale: se busca mientras se teclea', () => {
    expect(digitosDeDocumento('123-4567')).toBe('1234567');
  });

  it('lo que lleva letras no es un documento', () => {
    // Un código de factura o un nombre con número no pueden ponerse a comparar
    // dígitos contra las cédulas de todo el colegio.
    expect(digitosDeDocumento('FA-2026-000633')).toBeNull();
    expect(digitosDeDocumento('Juan 23')).toBeNull();
    expect(digitosDeDocumento('madre uno')).toBeNull();
  });

  it('con menos de tres dígitos no se busca por documento', () => {
    expect(digitosDeDocumento('25')).toBeNull();
    expect(digitosDeDocumento('-')).toBeNull();
    expect(digitosDeDocumento('')).toBeNull();
  });

  it('la condición solo existe cuando lo escrito es un documento', () => {
    const columna = { getSQL: () => { throw new Error('no se usa'); } } as never;
    expect(coincideDocumento(columna, 'madre')).toBeNull();
    expect(coincideDocumento(columna, '402-1234567-8')).not.toBeNull();
  });

  it('se enseña como se lee en la cédula', () => {
    expect(fmtDocumento('40212345678')).toBe('Cédula 402-1234567-8');
    expect(fmtDocumento('402-1234567-8')).toBe('Cédula 402-1234567-8');
    expect(fmtDocumento('123456789')).toBe('RNC 123456789');
    // Lo que no encaja no se parte a la fuerza.
    expect(fmtDocumento('A1234')).toBe('A1234');
    expect(fmtDocumento('')).toBeNull();
    expect(fmtDocumento(null)).toBeNull();
  });
});

describe('buscar a un padre lleva al responsable de pago de su hijo activo', () => {
  it('quien paga abre su propia ficha y dice por quién paga', () => {
    const [r] = resolverFamilias([
      vinculo({ personaClientId: 101, nombre: 'MADRE UNO', documento: '40276543210',
        estudianteId: 201, alumno: 'HIJO UNO', activo: true, destinoId: 101, destino: 'MADRE UNO' }),
    ], 5);
    expect(r.href).toBe('/escolar/responsables/101');
    expect(r.label).toBe('MADRE UNO');
    expect(r.sublabel).toBe('Cédula 402-7654321-0 · Paga por HIJO UNO');
    expect(r.tipo).toBe('responsable');
  });

  it('el padre que no paga abre la ficha de quien paga, y lo dice', () => {
    const [r] = resolverFamilias([
      vinculo({ personaClientId: 102, tutorId: 301, nombre: 'PADRE DOS', relacion: 'padre',
        estudianteId: 202, alumno: 'HIJO DOS', activo: true, destinoId: 103, destino: 'MADRE DOS',
        pagadorAsignado: true }),
    ], 5);
    expect(r.href).toBe('/escolar/responsables/103');
    expect(r.label).toBe('PADRE DOS');
    expect(r.sublabel).toBe('Padre de HIJO DOS · paga MADRE DOS');
  });

  it('la copia retirada de una ficha no gana al hijo activo', () => {
    // El caso que lo destapó: la madre es «responsable» de la ficha repetida y
    // ya retirada de su hijo, y tutora de la ficha buena, que paga el padre.
    const r = resolverFamilias([
      vinculo({ personaClientId: 104, nombre: 'MADRE TRES', documento: '40212345678',
        estudianteId: 203, alumno: 'HIJO TRES (COPIA)', activo: false, destinoId: 104, destino: 'MADRE TRES' }),
      vinculo({ personaClientId: 104, tutorId: 302, nombre: 'MADRE TRES', documento: '40212345678',
        relacion: 'tutor', estudianteId: 204, alumno: 'HIJO TRES', activo: true,
        destinoId: 105, destino: 'PADRE TRES' }),
    ], 5);
    // Una persona, un renglón: coincidió como contacto y como tutora.
    expect(r).toHaveLength(1);
    expect(r[0].href).toBe('/escolar/responsables/105');
    expect(r[0].sublabel).toBe('Cédula 402-1234567-8 · Tutor de HIJO TRES · paga PADRE TRES');
  });

  it('entre dos hijos activos, manda el que paga la propia persona', () => {
    const [r] = resolverFamilias([
      vinculo({ personaClientId: 10, tutorId: 1, nombre: 'ANA', relacion: 'madre',
        estudianteId: 2, alumno: 'BETO', activo: true, destinoId: 20, destino: 'OTRO' }),
      vinculo({ personaClientId: 10, nombre: 'ANA',
        estudianteId: 1, alumno: 'ZOE', activo: true, destinoId: 10, destino: 'ANA' }),
    ], 5);
    expect(r.href).toBe('/escolar/responsables/10');
    expect(r.sublabel).toBe('Paga por ZOE');
  });

  it('varios hijos se nombran sin repetir y sin alargar el renglón', () => {
    const base = { personaClientId: 7, nombre: 'LUIS', destinoId: 7, destino: 'LUIS', activo: true };
    const dos = resolverFamilias([
      vinculo({ ...base, estudianteId: 1, alumno: 'HIJA A' }),
      vinculo({ ...base, estudianteId: 2, alumno: 'HIJO B' }),
      // El mismo hijo otra vez, por coincidir también como tutor.
      vinculo({ ...base, tutorId: 9, relacion: 'padre', estudianteId: 2, alumno: 'HIJO B' }),
    ], 5);
    expect(dos[0].sublabel).toBe('Paga por HIJA A y HIJO B');

    const cuatro = resolverFamilias([1, 2, 3, 4].map((i) =>
      vinculo({ ...base, estudianteId: i, alumno: `HIJO${i}` })), 5);
    expect(cuatro[0].sublabel).toBe('Paga por HIJO1, HIJO2 y 2 más');
  });

  it('quien ya no tiene a nadie activo sigue saliendo, y se dice', () => {
    const [r] = resolverFamilias([
      vinculo({ personaClientId: 30, nombre: 'CARLOS', estudianteId: 5, alumno: 'X', activo: false,
        destinoId: 30, destino: 'CARLOS' }),
    ], 5);
    expect(r.href).toBe('/escolar/responsables/30');
    expect(r.sublabel).toBe('Sin hijos activos');
  });

  it('sin responsable de pago puesto no se afirma que paga', () => {
    const [r] = resolverFamilias([
      vinculo({ personaClientId: 40, tutorId: 4, nombre: 'ROSA', relacion: 'madre',
        estudianteId: 6, alumno: 'LEO', activo: true, destinoId: 40, destino: 'ROSA',
        pagadorAsignado: false }),
    ], 5);
    expect(r.href).toBe('/escolar/responsables/40');
    expect(r.sublabel).toBe('Madre de LEO');
  });

  it('un tutor sin contacto y sin alumnos no tiene a dónde llevar', () => {
    expect(resolverFamilias([vinculo({ tutorId: 8, nombre: 'SUELTO' })], 5)).toEqual([]);
  });

  it('las familias con alguien en el colegio salen primero y se respeta el tope', () => {
    const r = resolverFamilias([
      vinculo({ personaClientId: 1, nombre: 'AARON', estudianteId: 1, alumno: 'A', activo: false, destinoId: 1, destino: 'AARON' }),
      vinculo({ personaClientId: 2, nombre: 'ZULMA', estudianteId: 2, alumno: 'B', activo: true, destinoId: 2, destino: 'ZULMA' }),
      vinculo({ personaClientId: 3, nombre: 'MARIO', estudianteId: 3, alumno: 'C', activo: true, destinoId: 3, destino: 'MARIO' }),
    ], 2);
    expect(r.map((x) => x.label)).toEqual(['MARIO', 'ZULMA']);
  });

  it('el id de cada renglón no se repite: un tutor sin contacto va en negativo', () => {
    const r = resolverFamilias([
      vinculo({ personaClientId: 5, nombre: 'CON CONTACTO', estudianteId: 1, alumno: 'A', activo: true, destinoId: 5, destino: 'X' }),
      vinculo({ tutorId: 5, nombre: 'SIN CONTACTO', relacion: 'tutor', estudianteId: 2, alumno: 'B', activo: true, destinoId: 9, destino: 'Y' }),
    ], 5);
    expect(new Set(r.map((x) => x.id)).size).toBe(2);
    expect(r.map((x) => x.id).sort((a, b) => a - b)).toEqual([-5, 5]);
  });
});

describe('la consulta del buscador', () => {
  const global = lee('lib/busqueda/global.ts');

  it('busca también en los tutores, no solo en los contactos', () => {
    expect(global).toMatch(/FROM admin_escolar_tutores t/);
    expect(global).toMatch(/t\.nombre ILIKE/);
    // El tutor que es el contacto de alguien que ya coincidió entra aunque su
    // nombre de tutor esté escrito distinto: sigue siendo la misma persona.
    expect(global).toMatch(/t\.client_id IN \(SELECT id FROM pagadores\)/);
    expect(global).toMatch(/resolverFamilias\(vinculos, TOPE\)/);
  });

  it('acepta el documento en las tres fuentes de personas', () => {
    expect(global).toMatch(/coincideDocumento\(sql`c\.rnc`, q\)/);
    expect(global).toMatch(/coincideDocumento\(sql`t\.documento`, q\)/);
    expect(global).toMatch(/coincideDocumento\(clients\.rnc, q\)/);
    // El alumno no tiene cédula: su documento es el código RNE.
    expect(global).toMatch(/coincideDocumento\(adminEscolarEstudiantes\.codigoRne, q\)/);
  });

  it('dentro de Gobernanza la familia no se repite como «Cliente»', () => {
    expect(global).toMatch(/familiasAparte: opts\.moduloActual === 'escolar' && permitidos\.includes\('responsable'\)/);
    const clientes = global.slice(global.indexOf('async function buscarClientes'), global.indexOf('async function buscarFacturas'));
    expect(clientes).toMatch(/familiasAparte\s*\?\s*sql`NOT EXISTS/);
  });

  it('el alumno activo sale antes que su ficha retirada', () => {
    const estudiantes = global.slice(global.indexOf('async function buscarEstudiantes'), global.indexOf('async function buscarResponsables'));
    expect(estudiantes).toMatch(/= 'activo'\) DESC/);
    expect(estudiantes).toMatch(/href: `\/escolar\/estudiantes\/\$\{e\.id\}`/);
  });

  it('el directorio de estudiantes también acepta el documento', () => {
    // Con la cédula del padre en la mano se llega a sus hijos, sin saber cómo
    // está escrito el nombre.
    const directorio = lee('lib/administracion-escolar/queries.ts');
    expect(directorio).toMatch(/coincideDocumento\(adminEscolarEstudiantes\.codigoRne, q\)/);
    expect(directorio).toMatch(/coincideDocumento\(adminEscolarTutores\.documento, q\)/);
    expect(directorio).toMatch(/coincideDocumento\(clients\.rnc, q\)/);
    expect(lee('app/escolar/estudiantes/_page-client.tsx'))
      .toMatch(/placeholder="Buscar por nombre, código, tutor o cédula…"/);
  });

  it('el grupo y el campo dicen lo que ahora se puede buscar', () => {
    expect(lee('lib/busqueda/tipos.ts')).toMatch(/responsable: 'Padres y responsables de pago'/);
    expect(lee('components/global-search.tsx')).toMatch(/escolar:\s+'Buscar estudiante, padre, cédula o RNC…'/);
  });
});
