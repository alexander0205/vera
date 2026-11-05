import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pieDeMenu } from '@/lib/academia/menu';
import { academiaVisibleEnMenu, puedeVerPaginaAcademia } from '@/lib/academia/reglas';
import { urlEmbedVimeo } from '@/lib/academia/vimeo';

const leer = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

describe('regla del dueño: si no está configurado, no se muestra', () => {
  it('sin ningún video publicado, el menú no trae «Academia» en ningún rail', () => {
    for (const otros of [0, 1, 3]) {
      assert.equal(pieDeMenu(otros, false, false).academia, false);
      assert.equal(pieDeMenu(otros, false, false).separadorPropioAcademia, false);
    }
    assert.equal(academiaVisibleEnMenu(false), false);
  });
  it('con videos publicados, sale como antes', () => {
    assert.equal(pieDeMenu(2, false, true).academia, true);
    assert.equal(pieDeMenu(0, false, true).separadorPropioAcademia, true);
    assert.equal(academiaVisibleEnMenu(true), true);
  });
  it('el bloque «Módulos» no depende de la Academia', () => {
    assert.equal(pieDeMenu(2, false, false).bloqueModulos, true);
    assert.equal(pieDeMenu(0, false, false).bloqueModulos, false);
  });

  it('/academia: los usuarios normales no la ven sin videos; el administrador sí (para subir el primero)', () => {
    assert.equal(puedeVerPaginaAcademia({ hayPublicados: false, esAdmin: false }), false);
    assert.equal(puedeVerPaginaAcademia({ hayPublicados: false, esAdmin: true }), true);
    assert.equal(puedeVerPaginaAcademia({ hayPublicados: true, esAdmin: false }), true);
  });

  it('el menú lee el dato de usePermissions y por defecto (cargando o sin dato) no se muestra', () => {
    const hook = leer('lib', 'hooks', 'usePermissions.ts');
    assert.match(hook, /const academiaActiva = data\?\.academia === true;/);
    assert.match(leer('components', 'rail-modulos.tsx'), /pieDeMenu\(otros\.length, esMenuDeLaAcademia, academiaActiva\)/);
  });
  it('/api/user manda `academia` con la consulta mínima en caché, y no lanza', () => {
    assert.match(leer('app', 'api', 'user', 'route.ts'), /hayAcademia\(\)/);
    const datos = leer('lib', 'academia', 'datos.ts');
    const f = datos.slice(datos.indexOf('export async function hayAcademia'), datos.indexOf('export function olvidarCatalogo'));
    assert.match(f, /\.limit\(1\)/);                       // consulta mínima
    assert.match(f, /hay\.hasta > Date\.now\(\)/);         // caché corta
    assert.match(f, /seguro\(false/);                      // sin tabla o sin base: false, sin romper nada
    assert.match(datos, /olvidarCatalogo\(\) \{ catalogo = null; hay = null; \}/);   // publicar/despublicar lo actualiza
  });
  it('la página /academia da 404 a los normales cuando no hay videos', () => {
    const s = leer('app', 'academia', 'page.tsx');
    assert.match(s, /puedeVerPaginaAcademia\(/);
    assert.match(s, /notFound\(\)/);
  });
  it('las tarjetas y «Aprender» no piden nada si no hay videos publicados', () => {
    const c = leer('components', 'academia', 'TutorialDePantalla.tsx');
    assert.match(c, /if \(!academiaActiva\) \{ setR\(\{ mostrar: false, videos: \[\] \}\); return; \}/);
    const api = leer('app', 'api', 'academia', 'tarjeta', 'route.ts');
    assert.ok(api.indexOf('hayAcademia()') < api.indexOf('videosDePantalla(user.id'));
  });
  it('/admin/academia sigue sin depender de que haya videos publicados', () => {
    const s = leer('app', 'admin', 'academia', 'page.tsx');
    assert.ok(!s.includes('hayAcademia'));
    assert.match(s, /await exigirAdmin\(\)/);
  });
});

describe('que nadie pueda copiar el video', () => {
  it('el iframe siempre lleva dnt=1', () => {
    assert.equal(new URL(urlEmbedVimeo({ id: '123456', hash: null })).searchParams.get('dnt'), '1');
    assert.equal(new URL(urlEmbedVimeo({ id: '123456', hash: 'abcdef1234' })).searchParams.get('dnt'), '1');
  });
  it('ninguna pantalla de la Academia ofrece descargar el video', () => {
    for (const f of [
      ['components', 'academia', 'PlayerVideo.tsx'], ['components', 'academia', 'Reproductor.tsx'],
      ['components', 'academia', 'VideoDialogo.tsx'], ['components', 'academia', 'PanelAprender.tsx'],
      ['components', 'academia', 'TarjetaVideo.tsx'],
    ]) {
      const s = leer(...f);
      assert.ok(!/\bdownload\b/i.test(s), `${f.join('/')} ofrece descargar`);
      assert.ok(!/\.mp4/i.test(s), `${f.join('/')} enlaza un archivo`);
    }
  });
  it('la pantalla del admin explica cómo cerrar el video en Vimeo', () => {
    const s = leer('app', 'admin', 'academia', '_academia-client.tsx');
    assert.match(s, /No listado/);
    assert.match(s, /apaga las descargas/);
    assert.match(s, /dominio de Zero/);
  });
});

describe('CSP después del merge', () => {
  const csp = leer('next.config.ts').split('\n').find((l) => l.trimStart().startsWith('"default-src'))!;
  const directiva = (n: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${n} `)) ?? '';
  it('frame-src deja pasar player.vimeo.com', () => {
    assert.ok(directiva('frame-src').includes('https://player.vimeo.com'));
  });
  it('no queda YouTube ni subidas a S3 de la Academia (connect-src sin S3)', () => {
    assert.ok(!/youtube|ytimg/i.test(leer('next.config.ts')));
    assert.ok(!/amazonaws/.test(directiva('connect-src')));
    assert.ok(!directiva('script-src').includes('vimeo'));
    assert.ok(!/S3_COMPROBANTES_BUCKET/.test(leer('next.config.ts')));
  });
});
