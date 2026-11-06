import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  datosDeVimeo, enlaceCanonicoVimeo, esHashVimeo, esIdVimeo, interpretarOembed, urlEmbedVimeo, urlHttpsValida, urlOembedVimeo,
} from '@/lib/academia/vimeo';
import { completarDesdeOembed, type LectorOembed } from '@/lib/academia/vimeo-oembed';

const ID = '123456789';
const H = 'abcdef1234';

describe('datosDeVimeo: formatos válidos', () => {
  const buenos: [string, { id: string; hash: string | null }][] = [
    [`https://vimeo.com/${ID}`, { id: ID, hash: null }],
    [`vimeo.com/${ID}`, { id: ID, hash: null }],
    [`https://www.vimeo.com/${ID}`, { id: ID, hash: null }],
    [`http://vimeo.com/${ID}`, { id: ID, hash: null }],
    [`  https://vimeo.com/${ID}  `, { id: ID, hash: null }],
    [`https://vimeo.com/${ID}/${H}`, { id: ID, hash: H }],
    [`vimeo.com/${ID}/${H}?share=copy`, { id: ID, hash: H }],
    [`https://vimeo.com/${ID}?h=${H}`, { id: ID, hash: H }],
    [`https://vimeo.com/${ID}?h=${H}&share=copy`, { id: ID, hash: H }],
    [`https://player.vimeo.com/video/${ID}?h=${H}`, { id: ID, hash: H }],
    [`https://player.vimeo.com/video/${ID}`, { id: ID, hash: null }],
    [`https://player.vimeo.com/video/${ID}?h=${H}&dnt=1&title=0`, { id: ID, hash: H }],
    [`https://vimeo.com/channels/staffpicks/${ID}`, { id: ID, hash: null }],
    [`vimeo.com/channels/mi-canal/${ID}?h=${H}`, { id: ID, hash: H }],
  ];
  it.each(buenos)('%s', (entrada, esperado) => { assert.deepEqual(datosDeVimeo(entrada), esperado); });
});

describe('datosDeVimeo: lo que se rechaza', () => {
  const malos = [
    '', '   ', 'hola', 'no es un enlace', ID,
    `https://youtube.com/watch?v=${ID}`,
    `https://youtu.be/dQw4w9WgXcQ`,
    `https://evil.example/${ID}`,
    `https://vimeo.com.evil.example/${ID}`,
    `https://evil.example/vimeo.com/${ID}`,
    `https://notvimeo.com/${ID}`,
    `https://vimeo.evil.example/${ID}`,
    `https://player.vimeo.com.evil.example/video/${ID}`,
    `https://user@evil.example/vimeo.com/${ID}`,
    'https://vimeo.com/',
    'https://vimeo.com/abc',
    `https://vimeo.com/${ID}x`,
    `https://vimeo.com/1234567890123`,
    `https://vimeo.com/${ID}/corto`,
    `https://vimeo.com/${ID}/${'a'.repeat(41)}`,
    `https://vimeo.com/${ID}?h=mal!hash`,
    `https://vimeo.com/${ID}/${H}/extra`,
    `https://vimeo.com/channels/staffpicks`,
    `https://vimeo.com/channels/${ID}`,
    `https://vimeo.com/channels/a/b/${ID}`,
    `https://vimeo.com/user12345`,
    `https://player.vimeo.com/${ID}`,
    `https://player.vimeo.com/video/${ID}/extra`,
    `https://player.vimeo.com/video/abc`,
    `javascript:alert('vimeo.com/${ID}')`,
    `ftp://vimeo.com/${ID}`,
    `data:text/html,vimeo.com/${ID}`,
    `https://vimeo.com/${ID}?${'a=b&'.repeat(100)}`,
    `https://vimeo.com/${'1'.repeat(400)}`,
  ];
  it.each(malos.map((m) => [m.slice(0, 70), m]))('%s', (_corto, entrada) => {
    assert.equal(datosDeVimeo(entrada), null);
  });
});

describe('direcciones que se arman con el id y el hash', () => {
  it('el iframe va a player.vimeo.com sin cookies de rastreo y sin títulos', () => {
    const u = new URL(urlEmbedVimeo({ id: ID, hash: H }));
    assert.equal(u.origin, 'https://player.vimeo.com');
    assert.equal(u.pathname, `/video/${ID}`);
    assert.equal(u.searchParams.get('h'), H);
    for (const [k, v] of [['dnt', '1'], ['title', '0'], ['byline', '0'], ['portrait', '0'], ['playsinline', '1']]) {
      assert.equal(u.searchParams.get(k), v, k);
    }
  });
  it('un video público va sin hash', () => {
    assert.equal(new URL(urlEmbedVimeo({ id: ID, hash: null })).searchParams.has('h'), false);
  });
  it('el enlace canónico y el oEmbed llevan el hash de los no listados', () => {
    assert.equal(enlaceCanonicoVimeo({ id: ID, hash: H }), `https://vimeo.com/${ID}/${H}`);
    assert.equal(enlaceCanonicoVimeo({ id: ID, hash: null }), `https://vimeo.com/${ID}`);
    const u = new URL(urlOembedVimeo({ id: ID, hash: H }));
    assert.equal(u.origin, 'https://vimeo.com');
    assert.equal(u.pathname, '/api/oembed.json');
    assert.equal(u.searchParams.get('url'), `https://vimeo.com/${ID}/${H}`);
  });
  it('esIdVimeo, esHashVimeo y urlHttpsValida', () => {
    assert.equal(esIdVimeo(ID), true);
    assert.equal(esIdVimeo('abc'), false);
    assert.equal(esIdVimeo(null), false);
    assert.equal(esHashVimeo(H), true);
    assert.equal(esHashVimeo('x'), false);
    assert.equal(urlHttpsValida('https://i.vimeocdn.com/video/1_640.jpg'), 'https://i.vimeocdn.com/video/1_640.jpg');
    assert.equal(urlHttpsValida('http://i.vimeocdn.com/a.jpg'), null);
    assert.equal(urlHttpsValida('https://user:pass@x.com/a.jpg'), null);
    assert.equal(urlHttpsValida('javascript:alert(1)'), null);
    assert.equal(urlHttpsValida(42), null);
  });
});

describe('oEmbed: miniatura y duración (las pruebas NO llaman a Vimeo)', () => {
  it('interpretarOembed toma la miniatura https y la duración', () => {
    assert.deepEqual(
      interpretarOembed({ thumbnail_url: 'https://i.vimeocdn.com/video/1_640.jpg', duration: 185.4 }),
      { miniaturaUrl: 'https://i.vimeocdn.com/video/1_640.jpg', duracionSeg: 185 },
    );
  });
  it('descarta lo que no sirve: miniatura http, duración absurda o respuesta rara', () => {
    assert.deepEqual(interpretarOembed({ thumbnail_url: 'http://x.com/a.jpg', duration: 99999 }), { miniaturaUrl: null, duracionSeg: 0 });
    assert.deepEqual(interpretarOembed({ duration: '120' }), { miniaturaUrl: null, duracionSeg: 0 });
    assert.deepEqual(interpretarOembed(null), { miniaturaUrl: null, duracionSeg: 0 });
    assert.deepEqual(interpretarOembed('x'), { miniaturaUrl: null, duracionSeg: 0 });
  });

  const video = { id: ID, hash: H };
  const lector = (r: Awaited<ReturnType<LectorOembed>>): { lector: LectorOembed; llamadas: number[] } => {
    const llamadas: number[] = [];
    return { llamadas, lector: async () => { llamadas.push(1); return r; } };
  };

  it('llena la miniatura y la duración que faltan', async () => {
    const l = lector({ miniaturaUrl: 'https://i.vimeocdn.com/a.jpg', duracionSeg: 120 });
    const r = await completarDesdeOembed({ miniaturaUrl: null, duracionSeg: 0, titulo: 'x' }, video, l.lector);
    assert.deepEqual(r, { miniaturaUrl: 'https://i.vimeocdn.com/a.jpg', duracionSeg: 120, titulo: 'x' });
  });
  it('no pisa lo que el administrador escribió', async () => {
    const l = lector({ miniaturaUrl: 'https://i.vimeocdn.com/a.jpg', duracionSeg: 120 });
    const r = await completarDesdeOembed({ miniaturaUrl: 'https://cdn.example.com/mia.png', duracionSeg: 0 }, video, l.lector);
    assert.equal(r.miniaturaUrl, 'https://cdn.example.com/mia.png');
    assert.equal(r.duracionSeg, 120);
  });
  it('si no falta nada, ni siquiera pregunta', async () => {
    const l = lector({ miniaturaUrl: 'https://i.vimeocdn.com/a.jpg', duracionSeg: 120 });
    await completarDesdeOembed({ miniaturaUrl: 'https://x.com/a.png', duracionSeg: 60 }, video, l.lector);
    assert.equal(l.llamadas.length, 0);
  });
  it('si Vimeo falla (null o error), queda como estaba y se escribe a mano', async () => {
    const entrada = { miniaturaUrl: null, duracionSeg: 0 };
    assert.deepEqual(await completarDesdeOembed(entrada, video, async () => null), entrada);
    assert.deepEqual(await completarDesdeOembed(entrada, video, async () => { throw new Error('sin red'); }), entrada);
  });
});

describe('Vimeo en el código y en la CSP', () => {
  const leer = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');
  it('la CSP deja player.vimeo.com solo en frame-src y no queda nada de YouTube', () => {
    const csp = leer('next.config.ts').split('\n').find((l) => l.trimStart().startsWith('"default-src'))!;
    const directiva = (n: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${n} `)) ?? '';
    assert.ok(directiva('frame-src').includes('https://player.vimeo.com'));
    assert.ok(!directiva('script-src').includes('vimeo'));
    assert.ok(!directiva('connect-src').includes('vimeo'));
    assert.ok(!/youtube|ytimg/i.test(csp));
  });
  it('@vimeo/player va con versión exacta y se importa de forma dinámica', () => {
    const pkg = JSON.parse(leer('package.json')) as { dependencies: Record<string, string> };
    assert.match(pkg.dependencies['@vimeo/player'], /^\d+\.\d+\.\d+$/);
    const s = leer('components', 'academia', 'PlayerVideo.tsx');
    assert.match(s, /import\('@vimeo\/player'\)/);
    assert.ok(!/^import [^t].*from '@vimeo\/player'/m.test(s));
    assert.match(s, /iframe\.allow = 'autoplay; fullscreen; picture-in-picture'/);
  });
  it('el reproductor usa los eventos pedidos y salta con setCurrentTime + play', () => {
    const s = leer('components', 'academia', 'PlayerVideo.tsx');
    for (const e of ['timeupdate', 'seeked', 'pause', 'ended']) assert.ok(s.includes(`'${e}'`), e);
    assert.match(s, /getDuration\(\)/);
    assert.match(s, /setCurrentTime\(seg\)/);
    assert.match(s, /p\.play\(\)\.catch/);
    assert.match(s, /keepalive: true/);
  });
});
