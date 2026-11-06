import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aQuienAlertar, alertaDebida, debeTomar, esperaInicial, esperaTrasEstado, esperaTrasMensaje, HORAS_ALERTA, ladoDe, pasaElTurno,
  textoSeguimiento, turnoDe, validarPausa,
} from '@/lib/administracion-escolar/tareas-reglas';

const ia = vi.hoisted(() => ({
  modelo: 'google/gemini-2.5-flash-lite' as string | null,
  paso: 'ok' as 'ok' | 'falla' | 'cuelga' | 'sin-riesgo',
  consumos: [] as { uso: string; modelo: string; tokensEntrada: number }[][],
  pedidos: [] as unknown[],
}));
vi.mock('ai', () => ({
  Output: { object: (o: unknown) => o },
  generateText: async (o: { messages: unknown; abortSignal: AbortSignal }) => {
    ia.pedidos.push(o.messages);
    if (ia.paso === 'falla') throw new Error('503');
    if (ia.paso === 'cuelga') return new Promise(() => {});
    const output = ia.paso === 'sin-riesgo'
      ? { riesgo: false, motivo: '', sugerencia: '' }
      : { riesgo: true, motivo: 'Culpa al colegio por el error', sugerencia: 'Hola. Vamos a revisarlo juntos.' };
    return { output, usage: { inputTokens: 40, outputTokens: 12 } };
  },
}));
vi.mock('@/lib/ia/modelo-servidor', () => ({
  modelosDe: async () => ({ principal: 'google/gemini-2.5-flash-lite', respaldo: 'google/gemini-2.5-flash-lite' }),
  comoModelo: () => ia.modelo,
  caminoDe: () => 'google',
}));
vi.mock('@/lib/ia/consumo-servidor', () => ({
  registrarConsumo: async (_d: unknown, c: { uso: string; modelo: string; tokensEntrada: number }[]) => { ia.consumos.push(c); },
}));


const H = 3_600_000;
const AHORA = new Date('2026-11-06T15:00:00Z');
const hace = (horas: number) => new Date(AHORA.getTime() - horas * H);

describe('a quién le toca (guardado)', () => {
  it('al crear: Soporte es trabajo de Zero; una persona, del colegio', () => {
    expect(esperaInicial('soporte')).toBe('zero');
    expect(esperaInicial('persona')).toBe('colegio');
  });

  it('tras un cambio de estado repite lo que deducía turnoDe', () => {
    for (const estado of ['abierta', 'en_proceso', 'en_revision'] as const) {
      for (const asignadaA of ['soporte', 'persona']) {
        const t = turnoDe({ estado, asignadaA, asignadaUserId: 9, creadaPorUserId: 7, ultimo: null });
        expect(esperaTrasEstado(asignadaA, estado)).toBe(t.soporte ? 'zero' : 'colegio');
      }
    }
    expect(esperaTrasEstado('soporte', 'completada')).toBeNull();
    expect(esperaTrasEstado('persona', 'completada')).toBeNull();
  });

  it('turnoDe obedece a lo guardado', () => {
    const base = { estado: 'abierta', asignadaA: 'soporte', asignadaUserId: null, creadaPorUserId: 7, ultimo: { userId: 1, esSoporte: true } };
    expect(turnoDe({ ...base, espera: 'zero' }).soporte).toBe(true);
    expect(turnoDe({ ...base, espera: 'colegio' })).toEqual({ soporte: false, colegio: true, usuarios: [7] });
    // Sin lo guardado, como siempre: una abierta de Soporte es de Zero.
    expect(turnoDe(base).soporte).toBe(true);
  });
});

describe('enviar con 5 segundos: cuándo pasa la tarea', () => {
  const soporte = { asignadaA: 'soporte', estado: 'abierta' };
  it('Zero contesta una tarea que le tocaba a Zero: pasa al colegio', () => {
    expect(pasaElTurno({ ...soporte, espera: 'zero', lado: 'zero' })).toBe(true);
    expect(esperaTrasMensaje({ ...soporte, espera: 'zero', lado: 'zero' }, true)).toBe('colegio');
  });
  it('el colegio contesta lo que le tocaba al colegio: pasa a Zero, también en revisión', () => {
    expect(esperaTrasMensaje({ ...soporte, espera: 'colegio', lado: 'colegio' }, true)).toBe('zero');
    expect(esperaTrasMensaje({ asignadaA: 'soporte', estado: 'en_revision', espera: 'colegio', lado: 'colegio' }, true)).toBe('zero');
  });
  it('«Enviar sin pasar» la deja del mismo lado', () => {
    expect(esperaTrasMensaje({ ...soporte, espera: 'zero', lado: 'zero' }, false)).toBe('zero');
  });
  it('si la tarea ya está del otro lado no pasa nada (y la pantalla no pregunta)', () => {
    expect(pasaElTurno({ ...soporte, espera: 'colegio', lado: 'zero' })).toBe(false);
    expect(esperaTrasMensaje({ ...soporte, espera: 'colegio', lado: 'zero' }, true)).toBe('colegio');
    // En revisión le toca al colegio: Zero escribiendo no la pasa.
    expect(pasaElTurno({ asignadaA: 'soporte', estado: 'en_revision', espera: 'colegio', lado: 'zero' })).toBe(false);
  });
  it('completada no tiene turno que pasar', () => {
    expect(pasaElTurno({ asignadaA: 'soporte', estado: 'completada', espera: null, lado: 'zero' })).toBe(false);
    expect(esperaTrasMensaje({ asignadaA: 'soporte', estado: 'completada', espera: null, lado: 'zero' }, true)).toBeNull();
  });
  it('una tarea de una persona del colegio es siempre del colegio', () => {
    expect(pasaElTurno({ asignadaA: 'persona', estado: 'abierta', espera: 'colegio', lado: 'colegio' })).toBe(false);
  });
  it('de qué lado es quien escribe', () => {
    expect(ladoDe({ esSoporte: true })).toBe('zero');
    expect(ladoDe({ esSoporte: false })).toBe('colegio');
  });
});

describe('tomar la tarea, por lado', () => {
  it('pide tomarla si nadie de SU lado lo hizo, aunque el otro lado sí', () => {
    const t = { estado: 'abierta', tomadaPor: { zero: { userId: 1 }, colegio: null } };
    expect(debeTomar(t, 'colegio')).toBe(true);
    expect(debeTomar(t, 'zero')).toBe(false);
  });
  it('no lo pide en una completada ni cuando la respuesta no trae el dato', () => {
    expect(debeTomar({ estado: 'completada', tomadaPor: { zero: null, colegio: null } }, 'zero')).toBe(false);
    expect(debeTomar({ estado: 'abierta' }, 'zero')).toBe(false);
  });
});

describe('alerta a las 2 horas', () => {
  const parada = { estado: 'abierta', revisionVenceEn: null, actualizadoEn: hace(3), pausaHasta: null, urgenteEnviadoEn: null };
  it('son 2 horas', () => expect(HORAS_ALERTA).toBe(2));

  it('avisa pasadas las 2 horas, no antes', () => {
    expect(alertaDebida(parada, AHORA)).toBe(true);
    expect(alertaDebida({ ...parada, actualizadoEn: hace(1.9) }, AHORA)).toBe(false);
  });
  it('un solo aviso por parada; un movimiento nuevo vuelve a armarla', () => {
    expect(alertaDebida({ ...parada, urgenteEnviadoEn: hace(1) }, AHORA)).toBe(false);
    // Se movió después del aviso (p. ej. «Sigo trabajando») y volvió a pasar el plazo.
    expect(alertaDebida({ ...parada, actualizadoEn: hace(2.5), urgenteEnviadoEn: hace(5) }, AHORA)).toBe(true);
  });
  it('la pausa de «Esto tomará más tiempo» calla la alerta hasta su hora', () => {
    expect(alertaDebida({ ...parada, pausaHasta: new Date(AHORA.getTime() + H) }, AHORA)).toBe(false);
    expect(alertaDebida({ ...parada, pausaHasta: new Date(AHORA.getTime() - 1000) }, AHORA)).toBe(true);
  });
  it('las completadas y las que se cierran solas en revisión no avisan', () => {
    expect(alertaDebida({ ...parada, estado: 'completada' }, AHORA)).toBe(false);
    expect(alertaDebida({ ...parada, estado: 'en_revision', revisionVenceEn: new Date(AHORA.getTime() + H) }, AHORA)).toBe(false);
  });

  it('va a quien la tomó; si nadie, a todo ese equipo', () => {
    expect(aQuienAlertar({ lado: 'zero', tomo: 4, deColegio: [] }))
      .toEqual({ usuarios: [], zeroSoloA: [4], soporte: false, duenos: false });
    expect(aQuienAlertar({ lado: 'zero', tomo: null, deColegio: [] }))
      .toEqual({ usuarios: [], zeroSoloA: [], soporte: true, duenos: false });
    expect(aQuienAlertar({ lado: 'colegio', tomo: 8, deColegio: [3] }))
      .toEqual({ usuarios: [8], zeroSoloA: [], soporte: false, duenos: false });
    expect(aQuienAlertar({ lado: 'colegio', tomo: null, deColegio: [3, 3, 5] }))
      .toEqual({ usuarios: [3, 5], zeroSoloA: [], soporte: false, duenos: true });
  });
});

describe('los dos botones rápidos', () => {
  it('«más tiempo» pide una fecha futura y no pasada de 30 días', () => {
    expect(validarPausa('', AHORA).ok).toBe(false);
    expect(validarPausa('no es fecha', AHORA).ok).toBe(false);
    expect(validarPausa(new Date(AHORA.getTime() - H).toISOString(), AHORA).ok).toBe(false);
    expect(validarPausa(new Date(AHORA.getTime() + 60 * 86_400_000).toISOString(), AHORA).ok).toBe(false);
    const ok = validarPausa(new Date(AHORA.getTime() + 26 * H).toISOString(), AHORA);
    expect(ok.ok).toBe(true);
  });
  it('el mensaje al otro lado lleva la fecha', () => {
    const t = textoSeguimiento.mas_tiempo(new Date('2026-11-09T18:30:00Z'));
    expect(t).toContain('lunes');
    expect(t).toContain('9 de noviembre');
    expect(textoSeguimiento.sigo()).toMatch(/Sigo trabajando/);
  });
});

describe('la revisión del tono', () => {
  beforeEach(() => { ia.modelo = 'google/gemini-2.5-flash-lite'; ia.paso = 'ok'; ia.consumos = []; ia.pedidos = []; vi.useRealTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const D = { teamId: 1, userId: 2, borrador: 'Eso fue culpa de ustedes, ya se los dijimos.' };

  it('avisa del riesgo con motivo y sugerencia, y anota el gasto con su uso', async () => {
    const { revisarTono } = await import('@/lib/administracion-escolar/tareas-tono');
    const r = await revisarTono(D);
    expect(r).toEqual({ riesgo: true, motivo: 'Culpa al colegio por el error', sugerencia: 'Hola. Vamos a revisarlo juntos.' });
    expect(ia.consumos[0][0]).toMatchObject({ uso: 'revision_tono', modelo: 'google/gemini-2.5-flash-lite', tokensEntrada: 40 });
  });

  it('manda SOLO el borrador', async () => {
    const { revisarTono } = await import('@/lib/administracion-escolar/tareas-tono');
    await revisarTono(D);
    expect(JSON.stringify(ia.pedidos[0])).toContain('culpa de ustedes');
    expect(JSON.stringify(ia.pedidos[0])).not.toContain('colegio');
  });

  it('sin riesgo, no hay aviso', async () => {
    ia.paso = 'sin-riesgo';
    const { revisarTono } = await import('@/lib/administracion-escolar/tareas-tono');
    expect((await revisarTono(D)).riesgo).toBe(false);
  });

  it('NUNCA bloquea: si el modelo falla, se envía normal', async () => {
    ia.paso = 'falla';
    const { revisarTono } = await import('@/lib/administracion-escolar/tareas-tono');
    expect((await revisarTono(D)).riesgo).toBe(false);
  });

  it('NUNCA bloquea: sin llave no se llama a nadie', async () => {
    ia.modelo = null;
    const { revisarTono } = await import('@/lib/administracion-escolar/tareas-tono');
    expect((await revisarTono(D)).riesgo).toBe(false);
    expect(ia.pedidos).toHaveLength(0);
  });

  it('NUNCA bloquea: si el modelo se cuelga, a los 3 s y medio sale sin riesgo', async () => {
    ia.paso = 'cuelga';
    vi.useFakeTimers();
    const { revisarTono } = await import('@/lib/administracion-escolar/tareas-tono');
    const p = revisarTono(D);
    await vi.advanceTimersByTimeAsync(3_600);
    expect((await p).riesgo).toBe(false);
  });

  it('un borrador vacío no se revisa', async () => {
    const { revisarTono } = await import('@/lib/administracion-escolar/tareas-tono');
    expect((await revisarTono({ ...D, borrador: '   ' })).riesgo).toBe(false);
    expect(ia.pedidos).toHaveLength(0);
  });

  it('un riesgo sin sugerencia no se enseña: «Usar sugerencia» no tendría nada', async () => {
    const { limpiarTono } = await import('@/lib/administracion-escolar/tareas-tono-reglas');
    expect(limpiarTono({ riesgo: true, motivo: 'Tono duro', sugerencia: '' }).riesgo).toBe(false);
    expect(limpiarTono({ riesgo: true, motivo: '', sugerencia: 'Hola' }).riesgo).toBe(false);
    expect(limpiarTono('basura').riesgo).toBe(false);
  });

  it('es un uso aparte en /admin/ia, con el flash-lite gratis de Google de fábrica', async () => {
    const { elegirModelos, USOS_IA } = await import('@/lib/ia/modelos');
    expect(USOS_IA).toContain('revision_tono');
    expect(elegirModelos(null, 'revision_tono').principal).toBe('google/gemini-2.5-flash-lite');
  });
});
