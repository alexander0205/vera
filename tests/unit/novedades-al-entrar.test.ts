/**
 * La ventana de novedades que sale al entrar al sistema.
 *
 * Se pidió que, cada vez que se suban cambios, a quien entre le salga una
 * ventana grande con lo nuevo; que la cierre, y que no vuelva a salir hasta la
 * siguiente tanda.
 *
 * Lo que se fija aquí:
 *   1. Qué cuenta como «lo nuevo» y qué se recuerda de cada persona.
 *   2. Que publicar una versión (mover `pendiente` a `versiones`) NO hace que
 *      la ventana vuelva a salir con lo mismo.
 *   3. Que la ventana solo se abre dentro de un módulo y con sesión, y que lo
 *      visto se guarda donde lo ven todos los subdominios.
 *   4. Que el archivo de novedades de verdad está bien escrito.
 *
 * Las entradas de abajo son inventadas.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DIAS_DE_NOVEDAD,
  claveDeCambio,
  clavesDeLaCookie,
  cookieDeNovedades,
  novedadesFechadas,
  novedadesSinVer,
  valorAlCerrar,
  vistasEnCookies,
  type Cambio,
  type DocNovedades,
} from '@/lib/novedades';

const raiz = join(__dirname, '..', '..');
const lee  = (p: string) => readFileSync(join(raiz, p), 'utf8');

const A: Cambio = { tipo: 'nuevo',   titulo: 'Cobro en tres pasos',  detalle: 'Detalle A', desde: '2026-10-10' };
const B: Cambio = { tipo: 'mejora',  titulo: 'Pantalla más grande',  detalle: 'Detalle B', desde: '2026-10-08' };
const C: Cambio = { tipo: 'arreglo', titulo: 'Un aviso equivocado',  detalle: 'Detalle C', desde: '2026-10-12' };
const VIEJA: Cambio = { tipo: 'nuevo', titulo: 'Algo de agosto, sin fecha', detalle: 'Detalle viejo' };
const HOY = '2026-10-15';

describe('claveDeCambio — el nombre corto de cada entrada', () => {
  it('es corta y solo lleva letras minúsculas y números: cabe en una cookie', () => {
    expect(claveDeCambio(A)).toMatch(/^[a-z0-9]{1,8}$/);
  });

  it('es la misma mientras no cambien el tipo ni el título', () => {
    expect(claveDeCambio(A)).toBe(claveDeCambio({ tipo: 'nuevo', titulo: '  Cobro en tres pasos ' }));
    // El detalle se puede corregir (una errata) sin que la ventana vuelva a salir.
    expect(claveDeCambio({ ...A, detalle: 'Otro detalle' } as Cambio)).toBe(claveDeCambio(A));
  });

  it('cambia si cambia el título o el tipo', () => {
    expect(claveDeCambio({ ...A, titulo: 'Cobro en cuatro pasos' })).not.toBe(claveDeCambio(A));
    expect(claveDeCambio({ ...A, tipo: 'mejora' })).not.toBe(claveDeCambio(A));
  });
});

describe('novedadesFechadas — qué puede salir en la ventana', () => {
  it('solo lo que lleva fecha: lo viejo sin fecha se queda en la pantalla de Novedades', () => {
    const doc: DocNovedades = { pendiente: { cambios: [A, VIEJA, B] }, versiones: [] };
    expect(novedadesFechadas(doc).map((n) => n.titulo)).toEqual(['Cobro en tres pasos', 'Pantalla más grande']);
  });

  it('de la más nueva a la más vieja', () => {
    const doc: DocNovedades = { pendiente: { cambios: [B, A, C] } };
    expect(novedadesFechadas(doc).map((n) => n.desde)).toEqual(['2026-10-12', '2026-10-10', '2026-10-08']);
  });

  it('mira `pendiente` y la ÚLTIMA versión publicada, no las anteriores', () => {
    const doc: DocNovedades = {
      pendiente: { cambios: [A] },
      versiones: [
        { version: '2.0.0', fecha: '2026-10-09', titulo: 'v2', cambios: [B] },
        { version: '1.9.0', fecha: '2026-09-01', titulo: 'v1.9', cambios: [C] },
      ],
    };
    expect(novedadesFechadas(doc).map((n) => n.titulo)).toEqual(['Cobro en tres pasos', 'Pantalla más grande']);
  });

  it('una fecha mal escrita no cuenta como fecha', () => {
    const doc: DocNovedades = { pendiente: { cambios: [{ ...A, desde: '10/10/2026' }, { ...B, desde: '' }] } };
    expect(novedadesFechadas(doc)).toEqual([]);
  });

  it('sin archivo o vacío, no hay nada que enseñar', () => {
    expect(novedadesFechadas({})).toEqual([]);
    expect(novedadesFechadas({ pendiente: { cambios: [] }, versiones: [] })).toEqual([]);
  });
});

describe('novedadesSinVer — qué se le enseña a ESTA persona hoy', () => {
  const fechadas = novedadesFechadas({ pendiente: { cambios: [A, B, C] } });

  it('la primera vez, todo lo reciente', () => {
    expect(novedadesSinVer(fechadas, [], HOY)).toHaveLength(3);
  });

  it('lo que ya cerró no vuelve a salir', () => {
    const vistas = [claveDeCambio(A), claveDeCambio(B), claveDeCambio(C)];
    expect(novedadesSinVer(fechadas, vistas, HOY)).toEqual([]);
  });

  it('la siguiente tanda sale SOLA, sin repetir las anteriores', () => {
    const vistas = [claveDeCambio(A), claveDeCambio(B)];
    expect(novedadesSinVer(fechadas, vistas, HOY).map((n) => n.titulo)).toEqual(['Un aviso equivocado']);
  });

  it(`pasados ${DIAS_DE_NOVEDAD} días deja de salir aunque nadie la haya cerrado`, () => {
    // A quien abre su cuenta en diciembre no se le cuenta lo de octubre.
    expect(novedadesSinVer(fechadas, [], '2026-12-20')).toEqual([]);
    // En el borde todavía sale: 45 días después del 12 de octubre es el 26 de noviembre.
    expect(novedadesSinVer(fechadas, [], '2026-11-26').map((n) => n.titulo)).toEqual(['Un aviso equivocado']);
    expect(novedadesSinVer(fechadas, [], '2026-11-27')).toEqual([]);
  });
});

describe('publicar una versión no hace que la ventana vuelva a salir', () => {
  it('lo mismo, movido de `pendiente` a `versiones`, conserva sus claves', () => {
    const antes: DocNovedades = { pendiente: { cambios: [A, B] }, versiones: [] };
    const despues: DocNovedades = {
      pendiente: { cambios: [] },
      versiones: [{ version: '1.22.0', fecha: '2026-10-16', titulo: 'Mejoras', cambios: [A, B] }],
    };
    const vistas = novedadesFechadas(antes).map((n) => n.clave);
    expect(novedadesSinVer(novedadesFechadas(despues), vistas, '2026-10-17')).toEqual([]);
  });

  it('y si la misma entrada quedara en los dos sitios, sale una sola vez', () => {
    const doc: DocNovedades = {
      pendiente: { cambios: [A] },
      versiones: [{ version: '1.22.0', fecha: '2026-10-16', titulo: 'Mejoras', cambios: [A] }],
    };
    expect(novedadesFechadas(doc)).toHaveLength(1);
  });
});

describe('lo visto se recuerda en una cookie por usuario', () => {
  it('cada usuario tiene la suya: dos personas en el mismo navegador no se pisan', () => {
    expect(cookieDeNovedades(35)).toBe('zero_nov_35');
    expect(cookieDeNovedades(39)).not.toBe(cookieDeNovedades(35));
  });

  it('se lee de las cookies del navegador, entre las demás', () => {
    const cookies = 'tema=claro; zero_nov_35=abc123.x9; zero_nov_39=otra1; session=…';
    expect(vistasEnCookies(cookies, 35)).toEqual(['abc123', 'x9']);
    expect(vistasEnCookies(cookies, 39)).toEqual(['otra1']);
    expect(vistasEnCookies(cookies, 40)).toEqual([]);
    expect(vistasEnCookies('', 35)).toEqual([]);
  });

  it('lo que no parece una clave se descarta: la cookie la puede tocar cualquiera', () => {
    expect(clavesDeLaCookie('abc.<script>.DROP TABLE.ok1..abc')).toEqual(['abc', 'ok1']);
    expect(clavesDeLaCookie(null)).toEqual([]);
  });

  it('al cerrar se suma lo enseñado a lo que ya había, sin repetir', () => {
    expect(valorAlCerrar(['a1', 'b2'], ['b2', 'c3'])).toBe('a1.b2.c3');
    expect(valorAlCerrar([], [])).toBe('');
  });

  it('no crece sin fin: se quedan las últimas', () => {
    const muchas = Array.from({ length: 80 }, (_, i) => `k${i}`);
    const guardadas = valorAlCerrar(muchas, ['nueva']).split('.');
    expect(guardadas).toHaveLength(60);
    expect(guardadas.at(-1)).toBe('nueva');
    expect(guardadas).not.toContain('k0');
  });
});

describe('la ventana solo se abre dentro del sistema, con sesión, y se cierra para siempre', () => {
  const ventana = lee('components/novedades-al-entrar.tsx');
  const layout  = lee('app/layout.tsx');
  const marcar  = lee('app/api/novedades/vistas/route.ts');

  it('va montada una sola vez, en el layout raíz, con lo fechado calculado al compilar', () => {
    expect(layout).toContain('const NOVEDADES = novedadesFechadas(docNovedades as unknown as DocNovedades);');
    expect(layout.split('<NovedadesAlEntrar novedades={NOVEDADES} />').length - 1).toBe(1);
  });

  it('fuera de un módulo no pinta nada ni pregunta quién es el usuario', () => {
    // El layout raíz envuelve también la web pública, los enlaces de pago de
    // los padres y las pantallas de imprimir.
    const afuera = ventana.indexOf('moduloDeRuta(pathname) == null) return null;');
    const usuario = ventana.indexOf("useSWR<{ id: number } | null>('/api/user'");
    expect(afuera).toBeGreaterThan(-1);
    expect(usuario).toBeGreaterThan(afuera);
  });

  it('sin sesión no se abre', () => {
    expect(ventana).toContain('if (usuarioId == null) return;');
  });

  it('se cierra con el botón, con la X, pulsando fuera o con Escape, y todas marcan lo visto', () => {
    expect(ventana).toContain('<Dialog open onOpenChange={(v) => { if (!v) cerrar(); }}>');
    expect(ventana).toContain('<Button onClick={cerrar} className="w-full sm:w-auto">Entendido</Button>');
    expect(ventana).toContain("void fetch('/api/novedades/vistas', {");
    expect(ventana).toContain('body: JSON.stringify({ claves: porEnsenar.map((n) => n.clave) }),');
  });

  it('es una ventana grande, y manda a la pantalla con todas las novedades', () => {
    expect(ventana).toContain('<DialogContent className="max-w-2xl">');
    expect(ventana).toContain('<Link href="/dashboard/novedades" onClick={cerrar}>Ver todas las novedades</Link>');
  });

  it('lo visto se guarda en el dominio de la sesión: no vuelve a salir al cambiar de módulo', () => {
    // Cada módulo vive en su subdominio. Con `localStorage` saldría una vez en cada uno.
    expect(ventana).not.toContain('localStorage');
    expect(marcar).toContain('process.env.SESSION_COOKIE_DOMAIN');
    expect(marcar).toContain('...cookieDomain,');
  });

  it('marcar lo visto pide sesión y no toca la base de datos', () => {
    expect(marcar).toContain('const sesion = await getSession();');
    expect(marcar).toContain("return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });");
    expect(marcar).not.toContain("from '@/lib/db");
  });
});

describe('la pantalla «Novedades» enseña también lo más reciente', () => {
  const pagina = lee('app/(dashboard)/dashboard/novedades/page.tsx');

  it('lo que todavía no tiene número de versión sale arriba, sin número', () => {
    expect(pagina).toContain("titulo: 'Lo más reciente',");
    expect(pagina).toContain('{v.version && <span');
  });
});

describe('content/novedades.json está bien escrito', () => {
  const doc = JSON.parse(lee('content/novedades.json')) as DocNovedades;
  const todas = [...(doc.pendiente?.cambios ?? []), ...(doc.versiones ?? []).flatMap((v) => v.cambios)];

  it('cada entrada tiene tipo válido, título y detalle', () => {
    for (const c of todas) {
      expect(['nuevo', 'mejora', 'arreglo'], c.titulo).toContain(c.tipo);
      expect(c.titulo.trim().length, 'título vacío').toBeGreaterThan(0);
      expect(c.detalle.trim().length, c.titulo).toBeGreaterThan(0);
    }
  });

  it('las fechas van como AAAA-MM-DD', () => {
    for (const c of todas) {
      if (c.desde !== undefined) expect(c.desde, c.titulo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('hay algo fechado que contar, y lo fechado va ARRIBA de `pendiente`', () => {
    const pendientes = doc.pendiente?.cambios ?? [];
    const fechadas = pendientes.filter((c) => c.desde);
    expect(fechadas.length).toBeGreaterThan(0);
    const ultimaFechada = pendientes.map((c) => !!c.desde).lastIndexOf(true);
    expect(pendientes.slice(0, ultimaFechada + 1).every((c) => !!c.desde)).toBe(true);
  });

  it('dos entradas fechadas no comparten clave: una taparía a la otra', () => {
    const claves = novedadesFechadas(doc).map((n) => n.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('ninguna entrada fechada nombra a una persona, un correo ni un documento', () => {
    for (const n of novedadesFechadas(doc)) {
      const texto = `${n.titulo} ${n.detalle}`;
      expect(texto, n.titulo).not.toMatch(/@|\b\d{9,11}\b/);
    }
  });
});
