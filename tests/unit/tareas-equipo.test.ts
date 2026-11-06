import { describe, expect, it } from 'vitest';
import {
  armarPersonaEquipo, autorAMostrar, etiquetaAtiende, etiquetaPersona, filtroAtiende, firmaVisible, inicialesDe,
  personaDeMensaje, urlFotoParaColegios, type PersonaEquipo,
} from '@/lib/administracion-escolar/tareas-equipo';
import { AUTOR_SOPORTE } from '@/lib/administracion-escolar/tareas-reglas';
import { notificacionDeTarea } from '@/lib/notificaciones/texto';

const conFoto: PersonaEquipo = { userId: 7, nombre: 'Marta', cargo: 'Soporte técnico', fotoUrl: urlFotoParaColegios(7, 3) };
const sinFoto: PersonaEquipo = { userId: 8, nombre: 'Pedro', cargo: null, fotoUrl: null };

describe('armarPersonaEquipo', () => {
  it('solo el primer nombre, el cargo y la URL de la foto con su versión', () => {
    const p = armarPersonaEquipo({ userId: 7, name: 'marta del carmen lópez', cargo: ' Soporte técnico ', fotoVersion: 3 });
    expect(p).toEqual({ userId: 7, nombre: 'Marta', cargo: 'Soporte técnico', fotoUrl: '/api/equipo-zero/7/foto?v=3' });
  });
  it('sin foto: fotoUrl null; sin cargo: cargo null', () => {
    expect(armarPersonaEquipo({ userId: 8, name: 'Pedro Gil', cargo: '  ', fotoVersion: null }))
      .toEqual({ userId: 8, nombre: 'Pedro', cargo: null, fotoUrl: null });
  });
  it('sin nombre que enseñar (vacío o un correo) no hay persona', () => {
    expect(armarPersonaEquipo({ userId: 9, name: null })).toBeNull();
    expect(armarPersonaEquipo({ userId: 9, name: '   ' })).toBeNull();
    expect(armarPersonaEquipo({ userId: 9, name: 'alguien@ejemplo.test' })).toBeNull();
  });
  it('no lleva el correo ni el nombre completo, ni siquiera si llegan de más', () => {
    const entrada = { userId: 7, name: 'Marta Lópe', cargo: 'Ventas', fotoVersion: 1, email: 'marta@ejemplo.test' };
    const p = armarPersonaEquipo(entrada)!;
    expect(Object.keys(p).sort()).toEqual(['cargo', 'fotoUrl', 'nombre', 'userId']);
    const texto = JSON.stringify(p);
    expect(texto).not.toContain('@');
    expect(texto).not.toContain('Lópe');
  });
});

describe('autorAMostrar', () => {
  it('con foto: «Marta · Soporte técnico · Zero» y su foto', () => {
    expect(autorAMostrar({ autor: AUTOR_SOPORTE, equipo: conFoto })).toEqual({
      esPersona: true, etiqueta: 'Marta · Soporte técnico · Zero', iniciales: 'M', fotoUrl: '/api/equipo-zero/7/foto?v=3',
    });
  });
  it('sin foto: sus iniciales; sin cargo: «Pedro · Zero»', () => {
    const a = autorAMostrar({ autor: AUTOR_SOPORTE, equipo: sinFoto });
    expect(a.fotoUrl).toBeNull();
    expect(a.iniciales).toBe('P');
    expect(a.etiqueta).toBe('Pedro · Zero');
  });
  it('mensaje viejo sin persona: la firma con que se escribió', () => {
    expect(autorAMostrar({ autor: 'Soporte IT · Zero' })).toEqual({
      esPersona: false, etiqueta: 'Soporte IT · Zero', iniciales: 'IT', fotoUrl: null,
    });
    expect(autorAMostrar({ autor: AUTOR_SOPORTE, equipo: null }).etiqueta).toBe(AUTOR_SOPORTE);
  });
  it('un mensaje del colegio nunca se firma como equipo, aunque traiga una persona', () => {
    const a = autorAMostrar({ autor: 'Lucía Pérez', equipo: conFoto });
    expect(a).toMatchObject({ esPersona: false, etiqueta: 'Lucía Pérez', fotoUrl: null, iniciales: 'LP' });
  });
});

describe('personaDeMensaje', () => {
  const equipo = new Map([[7, conFoto]]);
  it('un mensaje o archivo del equipo con cuenta conocida lleva a la persona', () => {
    expect(personaDeMensaje({ userId: 7, autor: AUTOR_SOPORTE, tipo: 'mensaje' }, equipo)).toBe(conFoto);
    expect(personaDeMensaje({ userId: 7, autor: 'Soporte IT · Zero', tipo: 'adjunto' }, equipo)).toBe(conFoto);
  });
  it('viejo (sin usuario), de otra firma, de Zero AI o un evento: sin persona', () => {
    expect(personaDeMensaje({ userId: null, autor: AUTOR_SOPORTE, tipo: 'mensaje' }, equipo)).toBeNull();
    expect(personaDeMensaje({ userId: 7, autor: 'Lucía Pérez', tipo: 'mensaje' }, equipo)).toBeNull();
    expect(personaDeMensaje({ userId: 7, autor: AUTOR_SOPORTE, tipo: 'ia' }, equipo)).toBeNull();
    expect(personaDeMensaje({ userId: 7, autor: AUTOR_SOPORTE, tipo: 'evento' }, equipo)).toBeNull();
  });
  it('una cuenta que ya no es del equipo (no está en el mapa) vuelve a la firma genérica', () => {
    expect(personaDeMensaje({ userId: 99, autor: AUTOR_SOPORTE, tipo: 'mensaje' }, equipo)).toBeNull();
  });
});

describe('«La atiende» y las notificaciones', () => {
  it('etiquetas', () => {
    expect(etiquetaAtiende(conFoto)).toBe('Marta · Soporte técnico');
    expect(etiquetaAtiende(sinFoto)).toBe('Pedro');
    expect(etiquetaPersona(sinFoto)).toBe('Pedro · Zero');
    expect(inicialesDe('Ana Pérez')).toBe('AP');
  });
  it('la notificación del colegio dice el nombre de la persona si se conoce', () => {
    const base = { cambio: 'mensaje' as const, tareaId: 5, titulo: 'Revisar factura', texto: 'Listo' };
    const sabida = notificacionDeTarea({ ...base, autor: firmaVisible({ nombre: AUTOR_SOPORTE }, conFoto) });
    expect(sabida.titulo).toBe('Marta · Zero respondió');
    const generica = notificacionDeTarea({ ...base, autor: firmaVisible({ nombre: AUTOR_SOPORTE }, null) });
    expect(generica.titulo).toBe(`${AUTOR_SOPORTE} respondió`);
  });
});

describe('filtroAtiende («Mis tareas»)', () => {
  it('`mias` con sesión busca las que atiende esa persona', () => {
    expect(filtroAtiende('mias', 7)).toEqual({ tipo: 'usuario', userId: 7 });
  });
  it('`mias` sin saber quién mira no devuelve todas: devuelve ninguna', () => {
    expect(filtroAtiende('mias', null)).toEqual({ tipo: 'ninguna' });
    expect(filtroAtiende('mias', undefined)).toEqual({ tipo: 'ninguna' });
    expect(filtroAtiende('mias', 0)).toEqual({ tipo: 'ninguna' });
  });
  it('sin el filtro o con otro valor no filtra', () => {
    expect(filtroAtiende(undefined, 7)).toBeNull();
    expect(filtroAtiende('todas', 7)).toBeNull();
    expect(filtroAtiende('7', 7)).toBeNull();
  });
});
