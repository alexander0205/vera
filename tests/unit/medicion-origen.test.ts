/**
 * Medición del embudo: el origen de la primera visita, la clasificación de los
 * clics y las cuentas del embudo.
 *
 * Lo que más importa probar es lo que NO debe salir: la query de la URL (en
 * dos pantallas lleva un secreto), un correo en un texto, un dominio propio
 * contado como fuente, o un valor del navegador sin recortar.
 */

import { describe, it, expect } from 'vitest';
import {
  canalDeOrigen, detalleDeOrigen, escribirOrigen, leerOrigen, leerOrigenGuardado, origenDeVisita,
} from '@/lib/analytics/origen';
import { clasificarClic, destinoMedible } from '@/lib/analytics/eventos';
import { contarEmbudo, pasosAlcanzados, porCanal, type RegistroEmbudo } from '@/lib/analytics/embudo';

const HOY = '2026-10-15';

describe('origen de la primera visita', () => {
  it('guarda camino de entrada sin query, utm y dominio externo', () => {
    const o = origenDeVisita(
      new URL('https://www.zero.com.do/colegios?utm_source=google&utm_medium=cpc&utm_campaign=colegios-oct&token=SECRETO'),
      'https://www.google.com/',
      HOY,
    );
    expect(o).toEqual({ f: HOY, l: '/colegios', r: 'google.com', us: 'google', um: 'cpc', uc: 'colegios-oct' });
    expect(JSON.stringify(o)).not.toContain('SECRETO');
  });

  it('un referrer de Zero no es una fuente', () => {
    const o = origenDeVisita(new URL('https://app.zero.com.do/sign-up'), 'https://www.zero.com.do/precios', HOY);
    expect(o.r).toBeUndefined();
    expect(canalDeOrigen(o)).toBe('Directo');
  });

  it('marca los anuncios por su identificador', () => {
    const o = origenDeVisita(new URL('https://www.zero.com.do/?gclid=abc123'), '', HOY);
    expect(o.g).toBe(1);
    expect(canalDeOrigen(o)).toBe('Anuncios');
  });

  it('ida y vuelta por la cookie, y rechaza basura', () => {
    const o = origenDeVisita(new URL('https://www.zero.com.do/precios?utm_source=whatsapp'), '', HOY);
    expect(leerOrigen(escribirOrigen(o))).toEqual(o);
    expect(leerOrigen('no-es-json')).toBeNull();
    expect(leerOrigen(encodeURIComponent(JSON.stringify({ f: 'ayer', l: '/' })))).toBeNull();
    expect(leerOrigen(encodeURIComponent(JSON.stringify({ f: HOY, l: 'sin-barra' })))).toBeNull();
  });

  it('recorta lo que viene del navegador', () => {
    const largo = 'x'.repeat(500);
    const o = leerOrigen(encodeURIComponent(JSON.stringify({ f: HOY, l: '/', us: `<script>${largo}`, g: 'si' })))!;
    expect(o.us!.length).toBeLessThanOrEqual(100);
    expect(o.us).not.toContain('<');
    expect(o.g).toBeUndefined();
  });

  it('lee el origen guardado en la bitácora', () => {
    const o = { f: HOY, l: '/', r: 'chatgpt.com' };
    expect(leerOrigenGuardado(JSON.stringify({ metodo: 'correo', origen: o }))).toEqual(o);
    expect(leerOrigenGuardado(JSON.stringify({ metodo: 'correo', origen: null }))).toBeNull();
    expect(leerOrigenGuardado(null)).toBeNull();
  });
});

describe('canal de llegada', () => {
  const de = (r?: string, us?: string, um?: string) => canalDeOrigen({ f: HOY, l: '/', ...(r ? { r } : {}), ...(us ? { us } : {}), ...(um ? { um } : {}) });

  it('separa asistentes de IA de los buscadores', () => {
    expect(de('chatgpt.com')).toBe('Asistente de IA');
    expect(de('perplexity.ai')).toBe('Asistente de IA');
    expect(de(undefined, 'chatgpt.com')).toBe('Asistente de IA');
    expect(de('google.com.do')).toBe('Buscador');
    expect(de('bing.com')).toBe('Buscador');
  });

  it('redes, WhatsApp, correo y el resto', () => {
    expect(de('l.facebook.com')).toBe('Redes sociales');
    expect(de('linkedin.com')).toBe('Redes sociales');
    expect(de('wa.me')).toBe('WhatsApp');
    expect(de(undefined, 'whatsapp')).toBe('WhatsApp');
    expect(de(undefined, 'boletin', 'email')).toBe('Correo');
    expect(de('diariolibre.com')).toBe('Otro sitio');
    expect(de(undefined, 'feria-educativa')).toBe('Campaña');
    expect(de(undefined, 'box')).toBe('Campaña'); // termina en «x» y no es X/Twitter
    expect(canalDeOrigen(null)).toBe('Directo');
  });

  it('el detalle dice fuente, medio y campaña', () => {
    expect(detalleDeOrigen({ f: HOY, l: '/', us: 'google', um: 'cpc', uc: 'colegios' })).toBe('google / cpc · colegios');
    expect(detalleDeOrigen({ f: HOY, l: '/', r: 'chatgpt.com' })).toBe('chatgpt.com');
    expect(detalleDeOrigen(null)).toBe('—');
  });
});

describe('clics que se miden', () => {
  const aqui = 'https://www.zero.com.do/precios';
  it('por destino', () => {
    expect(clasificarClic('/sign-up', aqui)).toBe('registro');
    expect(clasificarClic('https://app.zero.com.do/sign-up?plan=x', aqui)).toBe('registro');
    expect(clasificarClic('https://app.zero.com.do/sign-in', aqui)).toBe('entrar');
    expect(clasificarClic('/contacto?perfil=colegio', aqui)).toBe('contacto');
    expect(clasificarClic('https://wa.me/18095550000', aqui)).toBe('whatsapp');
    expect(clasificarClic('mailto:ventas@zero.com.do', aqui)).toBe('correo');
    expect(clasificarClic('tel:+18095550000', aqui)).toBe('telefono');
    expect(clasificarClic('/colegios', aqui)).toBe('producto');
    expect(clasificarClic('/agentes.md', aqui)).toBe('agentes');
    expect(clasificarClic('https://dgii.gov.do', aqui)).toBe('externo');
  });
  it('no mide anclas ni navegación sin interés', () => {
    expect(clasificarClic('#planes', aqui)).toBeNull();
    expect(clasificarClic('/privacidad', aqui)).toBeNull();
    expect(clasificarClic('', aqui)).toBeNull();
  });
  it('el destino sale sin query, salvo el perfil', () => {
    expect(destinoMedible('/reset-password?token=SECRETO', aqui)).toBe('/reset-password');
    expect(destinoMedible('/contacto?perfil=colegio&x=1', aqui)).toBe('/contacto?perfil=colegio');
    expect(destinoMedible('https://wa.me/18095550000?text=hola', aqui)).toBe('wa.me');
    expect(destinoMedible('mailto:a@b.com', aqui)).toBe('mailto');
  });
});

describe('embudo', () => {
  const base: RegistroEmbudo = {
    teamId: 1, fecha: '2026-10-01', empresa: 'X', rnc: null, email: 'a@b.com', interno: false, metodo: 'correo',
    verificado: false, paso: 1, completado: false, estado: null, plan: null, clientes: 0, documentos: 0,
    entradas: 0, volvio: false, ultimaEntrada: null, canal: 'Directo', detalle: '—', entrada: '/',
  };

  it('cada paso incluye a los anteriores que dependen de él', () => {
    const p = pasosAlcanzados({ ...base, verificado: true, completado: true, paso: 4 });
    expect(p).toMatchObject({ registro: true, verificado: true, empresa: true, tamano: true, alta: true, uso: false, pagando: false });
    expect(pasosAlcanzados({ ...base, paso: 3 })).toMatchObject({ empresa: true, tamano: false });
  });

  it('cuenta por paso y por canal', () => {
    const filas: RegistroEmbudo[] = [
      { ...base, teamId: 1, canal: 'Buscador', verificado: true, completado: true, paso: 4, clientes: 2, estado: 'active' },
      { ...base, teamId: 2, canal: 'Buscador', verificado: true },
      { ...base, teamId: 3, canal: 'Asistente de IA' },
    ];
    const e = Object.fromEntries(contarEmbudo(filas).map((x) => [x.clave, x.n]));
    expect(e).toMatchObject({ registro: 3, verificado: 2, alta: 1, uso: 1, pagando: 1 });
    expect(porCanal(filas)).toEqual([
      { canal: 'Buscador', registros: 2, alta: 1, uso: 1, pagando: 1 },
      { canal: 'Asistente de IA', registros: 1, alta: 0, uso: 0, pagando: 0 },
    ]);
  });
});
