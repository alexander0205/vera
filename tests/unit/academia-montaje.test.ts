import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mensajeDeErrorVimeo, montarVimeo } from '@/lib/academia/montaje';

/** Un `Player` de mentira que anota lo que se le pide, en orden. */
function escenario(opciones: { activoDespuesDeCargar?: () => boolean } = {}) {
  const log: string[] = [];
  class Falso {
    constructor(_iframe: object) {
      log.push('crear-player');
      // Si algo se coló entre «el iframe entró» y «se creó el Player», se vería aquí.
      queueMicrotask(() => log.push('microtarea-tras-crear'));
    }
    async ready() { log.push('ready'); }
    destroy() { log.push('destroy'); }
  }
  let activo = true;
  const d = {
    cargar: async () => { log.push('cargar'); return Falso; },
    insertarIframe: () => {
      log.push('insertar-iframe');
      // Una microtarea encolada JUSTO al insertar: si entre insertar y crear hubiera un await, saldría antes.
      queueMicrotask(() => log.push('microtarea-tras-insertar'));
      return {};
    },
    activo: () => (opciones.activoDespuesDeCargar ? opciones.activoDespuesDeCargar() : activo),
    alListo: async () => { log.push('registrar-eventos'); },
    alCrear: () => log.push('al-crear'),
  };
  return { log, d, desactivar: () => { activo = false; } };
}

describe('montarVimeo: el orden que evita perder el `ready` del iframe', () => {
  it('carga el paquete ANTES de meter el iframe, y el Player nace en el mismo tick que el iframe', async () => {
    const { log, d } = escenario();
    await montarVimeo(d);
    assert.ok(log.indexOf('cargar') < log.indexOf('insertar-iframe'), 'el iframe no entra hasta que el paquete cargó');
    // Mismo tick: sin ningún await entre insertar el iframe y crear el Player.
    assert.ok(log.indexOf('crear-player') < log.indexOf('microtarea-tras-insertar'), 'el Player se crea antes de cualquier microtarea');
    assert.equal(log.indexOf('crear-player'), log.indexOf('insertar-iframe') + 1);
  });

  it('los eventos se registran DESPUÉS de ready()', async () => {
    const { log, d } = escenario();
    await montarVimeo(d);
    assert.deepEqual(log.filter((x) => ['crear-player', 'ready', 'registrar-eventos'].includes(x)), ['crear-player', 'ready', 'registrar-eventos']);
  });

  it('devuelve el Player ya listo', async () => {
    const { d } = escenario();
    const p = await montarVimeo(d);
    assert.ok(p);
  });

  it('si el componente se desmontó antes de cargar (StrictMode, cerrar rápido), no mete ningún iframe', async () => {
    const { log, d } = escenario({ activoDespuesDeCargar: () => false });
    assert.equal(await montarVimeo(d), null);
    assert.ok(!log.includes('insertar-iframe'));
    assert.ok(!log.includes('crear-player'));
  });

  it('si se desmontó mientras esperaba ready(), se destruye el Player y no se registran eventos', async () => {
    const log: string[] = [];
    let vivo = true;
    class P {
      async ready() { vivo = false; }
      destroy() { log.push('destroy'); }
    }
    const r = await montarVimeo<P, object>({
      cargar: async () => P, insertarIframe: () => ({}), activo: () => vivo, alListo: () => { log.push('registrar'); },
    });
    assert.equal(r, null);
    assert.deepEqual(log, ['destroy']);
  });

  it('dos montajes seguidos (StrictMode) dejan UN solo iframe', async () => {
    let iframes = 0;
    let vivo1 = true;
    class P { async ready() {} destroy() {} }
    const base = { cargar: async () => P, alListo: () => {} };
    const a = montarVimeo<P, object>({ ...base, insertarIframe: () => { iframes++; return {}; }, activo: () => vivo1 });
    vivo1 = false;                 // el primer efecto se limpia antes de que el import resuelva
    const b = montarVimeo<P, object>({ ...base, insertarIframe: () => { iframes++; return {}; }, activo: () => true });
    await Promise.all([a, b]);
    assert.equal(iframes, 1);
  });
});

describe('mensajeDeErrorVimeo', () => {
  it('dice claro qué pasó con el error de privacidad y con un video borrado', () => {
    assert.match(mensajeDeErrorVimeo({ name: 'PrivacyError' }), /incrustarlo/);
    assert.match(mensajeDeErrorVimeo({ name: 'NotFoundError' }), /ya no está/);
  });
  it('cualquier otro error (DRM, PlaybackError, basura) da un aviso general, nunca vacío', () => {
    for (const e of [{ name: 'PlaybackError', message: 'drminitfailed' }, {}, null, 'x', undefined]) {
      assert.match(mensajeDeErrorVimeo(e), /no se pudo reproducir/);
    }
  });
});

describe('PlayerVideo usa ese orden', () => {
  const s = readFileSync(join(process.cwd(), 'components', 'academia', 'PlayerVideo.tsx'), 'utf8');
  it('no renderiza el iframe con React (ni en el servidor): lo crea montarVimeo en el cliente', () => {
    assert.ok(!/<iframe/.test(s));
    assert.match(s, /document\.createElement\('iframe'\)/);
    assert.match(s, /montarVimeo</);
  });
  it('registra los eventos dentro de alListo (tras ready) y muestra el error de Vimeo', () => {
    const listo = s.slice(s.indexOf('alListo:'));
    for (const e of ['timeupdate', 'seeked', 'pause', 'ended', 'error']) assert.ok(listo.includes(`.on('${e}'`), e);
    assert.match(s, /errorVideo/);
  });
  it('el salto a un capítulo manda setCurrentTime y play en el mismo tick (sin esperar uno al otro)', () => {
    assert.ok(!/setCurrentTime\(seg\)\.then\(/.test(s));
    assert.match(s, /void p\.setCurrentTime\(seg\)[\s\S]{0,40}\n\s*void p\.play\(\)/);
  });
  it('el título cambiado no recrea el reproductor', () => {
    const efecto = s.slice(s.indexOf('}, [guardar, src]);'), s.indexOf('}, [guardar, src]);') + 30);
    assert.match(efecto, /\[guardar, src\]/);
  });
});
