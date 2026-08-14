/**
 * Unit tests — ciclo de vida de la suscripción (lib/suscripcion/estado.ts)
 * y evaluación de límites (lib/config/suscripcion.ts).
 *
 * Es lógica pura sobre fechas, y ahí es donde se esconden los errores caros:
 * un `>` en vez de `>=` le corta el acceso a un colegio un día antes, y un
 * reloj que se reinicia solo deja una mora que no vence nunca.
 *
 * `evaluarSuscripcion` recibe el `ahora` por parámetro justo para poder
 * probar «el día 16 de la prueba» sin tocar el reloj de la máquina.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// BILLING_ENABLED se lee al importar el módulo, así que hay que fijar la env
// ANTES del import. Con el billing apagado todo devuelve 'sin-billing' y no
// se probaría nada de lo de abajo.
vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', 'true');

const { evaluarSuscripcion, permiteEscritura } = await import('@/lib/suscripcion/estado');
const { evaluarLimite, LIMITES, PRUEBA, MORA, SOLO_LECTURA } =
  await import('@/lib/config/suscripcion');

const DIA = 24 * 60 * 60 * 1000;
const HOY = new Date('2026-08-14T12:00:00Z');

/** Team mínimo. Cada prueba pisa solo lo que le importa. */
function team(over: Partial<Parameters<typeof evaluarSuscripcion>[0]> = {}) {
  return {
    planName: 'negocio',
    subscriptionStatus: 'active',
    trialEnd: null,
    periodoFin: null,
    morosoDesde: null,
    cancelarAlFin: false,
    ...over,
  };
}

const enDias = (n: number) => new Date(HOY.getTime() + n * DIA);

describe('prueba', () => {
  it('con días por delante deja trabajar y no molesta', () => {
    const s = evaluarSuscripcion(
      team({ subscriptionStatus: 'trialing', trialEnd: enDias(10) }), HOY,
    );
    expect(s.estado).toBe('prueba');
    expect(s.puedeEscribir).toBe(true);
    expect(s.avisar).toBe(false);
    expect(s.diasRestantes).toBe(10);
  });

  it('avisa en los días configurados, y solo en esos', () => {
    // PRUEBA.avisarDiasAntes = [3, 1] → a 3 y a 1 sí; a 4 no.
    const alerta = (d: number) => evaluarSuscripcion(
      team({ subscriptionStatus: 'trialing', trialEnd: enDias(d) }), HOY,
    ).avisar;

    expect(alerta(PRUEBA.avisarDiasAntes[0] + 1)).toBe(false);
    for (const d of PRUEBA.avisarDiasAntes) expect(alerta(d)).toBe(true);
  });

  it('vencida sin pagar: solo lectura, no corte seco', () => {
    const s = evaluarSuscripcion(
      team({ subscriptionStatus: 'trialing', trialEnd: enDias(-1) }), HOY,
    );
    expect(s.estado).toBe('solo-lectura');
    expect(s.puedeEscribir).toBe(false);
    // Puede entrar a sacar su información durante los días de gracia.
    expect(s.diasRestantes).toBe(SOLO_LECTURA.diasTrasPrueba - 1);
  });

  it('pasada también la ventana de solo lectura, se cierra', () => {
    const s = evaluarSuscripcion(
      team({
        subscriptionStatus: 'trialing',
        trialEnd: enDias(-(SOLO_LECTURA.diasTrasPrueba + 1)),
      }),
      HOY,
    );
    expect(s.estado).toBe('cerrada');
    expect(s.puedeEscribir).toBe(false);
  });
});

describe('mora', () => {
  it('dentro de la gracia sigue trabajando', () => {
    const s = evaluarSuscripcion(
      team({ subscriptionStatus: 'past_due', morosoDesde: enDias(-2) }), HOY,
    );
    expect(s.estado).toBe('mora');
    expect(s.puedeEscribir).toBe(true);
    expect(s.avisar).toBe(true);
  });

  it('el reloj corre desde el PRIMER fallo, no desde el último reintento', () => {
    // El caso que rompe todo: Stripe reintenta la tarjeta y cada intento
    // vuelve a marcar past_due. Si el reloj se reiniciara, la mora sería
    // eterna y nunca se cortaría a nadie.
    const primerFallo = enDias(-(MORA.diasGracia + 1));
    const s = evaluarSuscripcion(
      team({ subscriptionStatus: 'past_due', morosoDesde: primerFallo }), HOY,
    );
    expect(s.puedeEscribir).toBe(false);
    expect(s.estado).toBe('solo-lectura');
  });

  it('agotada la gracia y la ventana de lectura, se cierra', () => {
    const s = evaluarSuscripcion(
      team({
        subscriptionStatus: 'past_due',
        morosoDesde: enDias(-(MORA.diasGracia + SOLO_LECTURA.diasTrasMora + 1)),
      }),
      HOY,
    );
    expect(s.estado).toBe('cerrada');
  });
});

describe('cancelación', () => {
  it('programada al fin del período: sigue trabajando y se le dice hasta cuándo', () => {
    const s = evaluarSuscripcion(
      team({ cancelarAlFin: true, periodoFin: enDias(12) }), HOY,
    );
    expect(s.estado).toBe('activa');
    expect(s.puedeEscribir).toBe(true);
    expect(s.avisar).toBe(true);
    expect(s.cancelacionPendiente).toBe(true);
  });

  it('cancelada con período pagado por delante: no se le corta lo ya cobrado', () => {
    const s = evaluarSuscripcion(
      team({ subscriptionStatus: 'canceled', periodoFin: enDias(5) }), HOY,
    );
    expect(s.puedeEscribir).toBe(true);
  });

  it('cancelada y vencida: solo lectura', () => {
    const s = evaluarSuscripcion(
      team({ subscriptionStatus: 'canceled', periodoFin: enDias(-1) }), HOY,
    );
    expect(s.puedeEscribir).toBe(false);
  });
});

describe('casos de borde', () => {
  it('sin plan (fila vieja, NULL): entra y ve, no crea', () => {
    const s = evaluarSuscripcion(
      team({ planName: null, subscriptionStatus: null }), HOY,
    );
    expect(s.estado).toBe('solo-lectura');
    expect(s.puedeEscribir).toBe(false);
  });

  it("el acceso manual ('admin') no caduca", () => {
    const s = evaluarSuscripcion(
      team({ subscriptionStatus: 'admin', trialEnd: enDias(-999) }), HOY,
    );
    expect(s.estado).toBe('sin-billing');
    expect(s.puedeEscribir).toBe(true);
    expect(s.avisar).toBe(false);
  });

  it('permiteEscritura coincide con puedeEscribir', () => {
    for (const st of ['activa', 'prueba', 'prueba-por-vencer', 'mora', 'sin-billing'] as const) {
      expect(permiteEscritura(st)).toBe(true);
    }
    for (const st of ['solo-lectura', 'cerrada'] as const) {
      expect(permiteEscritura(st)).toBe(false);
    }
  });
});

describe('evaluarLimite', () => {
  it('-1 es ilimitado: nunca bloquea ni advierte', () => {
    const r = evaluarLimite('docs', 99999, -1);
    expect(r.bloqueado).toBe(false);
    expect(r.advertir).toBe(false);
  });

  it('mira lo que la acción va a consumir, no solo lo consumido', () => {
    // 199 de 200 no está bloqueado; pedir 2 más sí. Sin `aConsumir`, una tanda
    // de 50 avisos con 199 usados pasaría entera y se iría 49 por encima.
    expect(evaluarLimite('docs', 199, 200, 1).bloqueado).toBe(false);
    expect(evaluarLimite('docs', 199, 200, 2).bloqueado).toBe(true);
  });

  it('advierte antes de chocar, en el umbral configurado', () => {
    const desde = LIMITES.docs.avisarDesde;      // 0.8
    expect(evaluarLimite('docs', Math.floor(200 * desde) - 1, 200).advertir).toBe(false);
    expect(evaluarLimite('docs', Math.ceil(200 * desde), 200).advertir).toBe(true);
  });

  it("estudiantes avisa pero NO bloquea: matricular en agosto no se corta", () => {
    const r = evaluarLimite('estudiantes', 442, 300);
    expect(r.bloqueado).toBe(false);
    expect(r.advertir).toBe(true);
    expect(r.mensaje).not.toBeNull();
  });

  it('whatsapp y sms sí bloquean: cada unidad nos cuesta dinero', () => {
    expect(evaluarLimite('whatsapp', 300, 300).bloqueado).toBe(true);
    expect(evaluarLimite('sms', 300, 300).bloqueado).toBe(true);
  });
});

describe('con el billing apagado', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('todo abierto, pase lo que pase con las fechas', async () => {
    vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', 'false');
    const { evaluarSuscripcion: evaluar } = await import('@/lib/suscripcion/estado');

    const s = evaluar(
      { planName: null, subscriptionStatus: 'canceled', trialEnd: enDias(-999),
        periodoFin: enDias(-999), morosoDesde: enDias(-999), cancelarAlFin: true },
      HOY,
    );
    expect(s.estado).toBe('sin-billing');
    expect(s.puedeEscribir).toBe(true);
    expect(s.avisar).toBe(false);
  });
});
