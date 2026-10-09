/**
 * Sonido y vibración de la caja.
 *
 * Se prueban las partes que no necesitan navegador: la forma de las señales y
 * la lectura de preferencias. La forma importa porque el clic al agregar se
 * dispara varias veces por segundo — si durase demasiado se solaparía consigo
 * mismo y sonaría a cacharro roto — y las preferencias porque un JSON corrupto
 * en el almacenamiento no puede dejar la caja sin cobrar.
 */

import { describe, it, expect } from 'vitest';
import {
  RECETAS, VIBRACIONES, duracionMs, leerPrefs, guardarPrefs,
  PASOS_VOLUMEN, pasoVolumen, nivelVolumen,
  PREFS_POR_DEFECTO, CLAVE_PREFS, type Senal,
} from '@/lib/pos/feedback';

const SENALES: Senal[] = ['agregar', 'quitar', 'cobrar', 'rechazo'];

function almacenFalso(inicial: Record<string, string> = {}) {
  const datos = { ...inicial };
  return {
    getItem: (k: string) => (k in datos ? datos[k] : null),
    setItem: (k: string, v: string) => { datos[k] = v; },
    datos,
  };
}

describe('forma de las señales', () => {
  it('el clic de agregar no llega a solaparse tocando rápido', () => {
    // Tres toques por segundo es un ritmo real en una cafetería con cola.
    expect(duracionMs('agregar')).toBeLessThan(1000 / 3);
  });

  it('cobrar y rechazo duran más que agregar: son eventos, no repeticiones', () => {
    expect(duracionMs('cobrar')).toBeGreaterThan(duracionMs('agregar'));
    expect(duracionMs('rechazo')).toBeGreaterThan(duracionMs('agregar'));
  });

  it('ninguna señal pasa de medio segundo', () => {
    for (const s of SENALES) expect(duracionMs(s)).toBeLessThanOrEqual(500);
  });

  it('cobrar sube de tono y rechazo baja', () => {
    const c = RECETAS.cobrar;
    expect(c[c.length - 1].hz).toBeGreaterThan(c[0].hz);
    const r = RECETAS.rechazo;
    expect(r[r.length - 1].hz).toBeLessThan(r[0].hz);
  });

  it('agregar es el más agudo: se distingue del rechazo sin mirar', () => {
    const agudo = Math.max(...RECETAS.agregar.map(t => t.hz));
    const grave = Math.max(...RECETAS.rechazo.map(t => t.hz));
    expect(agudo).toBeGreaterThan(grave * 2);
  });

  it('quitar suena por debajo de agregar pero muy por encima del rechazo', () => {
    const quitar  = Math.max(...RECETAS.quitar.map(t => t.hz));
    const agregar = Math.max(...RECETAS.agregar.map(t => t.hz));
    const rechazo = Math.max(...RECETAS.rechazo.map(t => t.hz));
    expect(quitar).toBeLessThan(agregar);
    expect(quitar).toBeGreaterThan(rechazo * 2);
  });

  it('quitar es tan corto como agregar: también se repite', () => {
    expect(duracionMs('quitar')).toBeLessThan(1000 / 3);
  });

  it('el volumen se queda corto a propósito', () => {
    for (const s of SENALES) {
      for (const t of RECETAS[s]) {
        expect(t.vol).toBeGreaterThan(0);
        expect(t.vol).toBeLessThanOrEqual(0.25);
      }
    }
  });

  it('cada señal tiene su patrón de vibración y ninguno es interminable', () => {
    for (const s of SENALES) {
      const p = VIBRACIONES[s];
      expect(p.length).toBeGreaterThan(0);
      expect(p.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(300);
    }
  });
});

describe('preferencias', () => {
  it('sin nada guardado, encendido de fábrica', () => {
    expect(leerPrefs(almacenFalso())).toEqual(PREFS_POR_DEFECTO);
  });

  it('un JSON corrupto no revienta: vuelve a los valores de fábrica', () => {
    expect(leerPrefs(almacenFalso({ [CLAVE_PREFS]: '{roto' }))).toEqual(PREFS_POR_DEFECTO);
  });

  it('un valor a medias completa lo que falta', () => {
    const p = leerPrefs(almacenFalso({ [CLAVE_PREFS]: '{"sonido":false}' }));
    expect(p.sonido).toBe(false);
    expect(p.vibracion).toBe(PREFS_POR_DEFECTO.vibracion);
  });

  it('un tipo que no toca se ignora', () => {
    const p = leerPrefs(almacenFalso({ [CLAVE_PREFS]: '{"sonido":"si","vibracion":1}' }));
    expect(p).toEqual(PREFS_POR_DEFECTO);
  });

  it('lo guardado se vuelve a leer igual', () => {
    const a = almacenFalso();
    guardarPrefs({ sonido: false, vibracion: true, volumen: 0.8 }, a);
    expect(leerPrefs(a)).toEqual({ sonido: false, vibracion: true, volumen: 0.8 });
  });

  it('un almacenamiento que lanza no tumba la caja', () => {
    const roto = {
      getItem: () => { throw new Error('bloqueado'); },
      setItem: () => { throw new Error('bloqueado'); },
    };
    expect(leerPrefs(roto)).toEqual(PREFS_POR_DEFECTO);
    expect(() => guardarPrefs(PREFS_POR_DEFECTO, roto)).not.toThrow();
  });
});

describe('volumen', () => {
  it('sube y baja de peldaño sin salirse de la escala', () => {
    expect(pasoVolumen(PASOS_VOLUMEN[0], -1)).toBe(PASOS_VOLUMEN[0]);
    const tope = PASOS_VOLUMEN[PASOS_VOLUMEN.length - 1];
    expect(pasoVolumen(tope, 1)).toBe(tope);
    expect(pasoVolumen(PASOS_VOLUMEN[1], 1)).toBe(PASOS_VOLUMEN[2]);
    expect(pasoVolumen(PASOS_VOLUMEN[2], -1)).toBe(PASOS_VOLUMEN[1]);
  });

  it('un valor intermedio se engancha al peldaño más cercano', () => {
    // 0.62 está entre 0.6 y 0.8, pegado al 0.6: subir tiene que dar 0.8.
    expect(pasoVolumen(0.62, 1)).toBe(0.8);
    expect(pasoVolumen(0.62, -1)).toBe(0.35);
  });

  it('el primer peldaño es silencio y el último es el máximo', () => {
    expect(PASOS_VOLUMEN[0]).toBe(0);
    expect(PASOS_VOLUMEN[PASOS_VOLUMEN.length - 1]).toBe(1);
  });

  it('nivelVolumen dice en qué peldaño está, para pintar las barritas', () => {
    expect(nivelVolumen(0)).toBe(0);
    expect(nivelVolumen(1)).toBe(PASOS_VOLUMEN.length - 1);
    expect(nivelVolumen(0.6)).toBe(2);
  });

  it('un volumen fuera de rango se acota en vez de tirarse', () => {
    expect(leerPrefs(almacenFalso({ [CLAVE_PREFS]: '{"volumen":9}' })).volumen).toBe(1);
    expect(leerPrefs(almacenFalso({ [CLAVE_PREFS]: '{"volumen":-4}' })).volumen).toBe(0);
    expect(leerPrefs(almacenFalso({ [CLAVE_PREFS]: '{"volumen":"alto"}' })).volumen)
      .toBe(PREFS_POR_DEFECTO.volumen);
  });
});
