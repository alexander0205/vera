import { describe, it, expect, vi } from 'vitest';

/**
 * Lo que se vio probando Gobernanza por el chat (octubre 2026) con Gemini
 * Flash: decía «pulsa Confirmar» sin haber armado ninguna tarjeta, armaba un
 * informe entero con cifras sin consultar nada y, en la conversación
 * siguiente, dudaba de los montos que sí había calculado Zero. Aquí, con un
 * modelo simulado, que el código lo ataje.
 */

vi.mock('@/lib/db/drizzle', () => ({ db: {} }));
vi.mock('@/lib/auth/modules', () => ({ getTeamModules: vi.fn() }));
vi.mock('@/lib/auth/permissions', () => ({ getEffectivePermissions: vi.fn() }));
vi.mock('@/lib/reportes/queries', () => ({
  getKpis: vi.fn(), getTendencia: vi.fn(), getIngresosPorProducto: vi.fn(), getIngresosPorCliente: vi.fn(),
  getIngresosPorMetodo: vi.fn(), getAgingCxC: vi.fn(), getItbisResumen: vi.fn(), getVentasPorTipo: vi.fn(), getVentasPorUsuario: vi.fn(),
}));
vi.mock('@/lib/compras/captura/consultas', () => ({ listarCapturas: vi.fn(), contarPorRevisar: vi.fn() }));
vi.mock('@/lib/compras/consultas', () => ({ listarCompras: vi.fn(), resumenGastos: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@ai-sdk/google', () => ({ google: vi.fn() }));

import { MockLanguageModelV4 } from 'ai/test';
import { contextoDePrueba } from '@/lib/asistente/contexto';
import { CON_CIFRAS, PIDE_ACCION, PROMETE_CONFIRMAR, conversar } from '@/lib/asistente/agente';
import { TARJETA_GUARDADA, conTarjetas } from '@/lib/asistente/tarjeta-guardada';

const USO = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };

/** Un modelo que contesta por turno lo que diga `responder` y anota lo que recibió. */
function modelo(responder: (vuelta: number, ultimo: string) => string) {
  const ultimos: string[] = [];
  const m = new MockLanguageModelV4({
    doGenerate: async (opciones) => {
      const prompt = opciones.prompt as unknown as { role: string; content: { type: string; text?: string }[] | string }[];
      const u = [...prompt].reverse().find((x) => x.role === 'user');
      const texto = typeof u?.content === 'string' ? u.content : (u?.content ?? []).map((c) => c.text ?? '').join('');
      ultimos.push(texto);
      return {
        content: [{ type: 'text' as const, text: responder(ultimos.length, texto) }],
        finishReason: { unified: 'stop' as const, raw: 'stop' }, usage: USO, warnings: [],
      };
    },
  });
  return { m, ultimos };
}

const preguntar = (m: MockLanguageModelV4, pregunta: string) => conversar(
  contextoDePrueba(1), [{ role: 'user', content: pregunta }], { empresa: 'Colegio Demo', usuario: 'Ana' }, m as never,
);

describe('guardas del asistente', () => {
  it('dice «pulsa Confirmar» sin proponer nada: se le pide la tarjeta una vez y, si insiste, se avisa que no la hay', async () => {
    const { m, ultimos } = modelo(() => 'Se va a crear el concepto «Mensualidad». Por favor, pulsa "Confirmar" para crearlo.');
    const r = await preguntar(m, 'Crea la mensualidad');
    expect(ultimos).toHaveLength(2);
    expect(ultimos[1]).toMatch(/No llamaste ninguna herramienta proponer_/);
    expect(r.respuesta).toMatch(/No pude preparar la tarjeta para confirmar/);
    expect(r.respuesta).not.toMatch(/pulsa "Confirmar"/);
  });

  it('da cifras sin consultar ninguna herramienta: se le pide que consulte y vale lo segundo', async () => {
    const { m, ultimos } = modelo((vuelta) => vuelta === 1
      ? 'Cargado del año: RD$ 256,000.00; por cargar: RD$ 1,930,000.00.'
      : 'No tengo esos datos a mano; dime el año escolar y lo consulto.');
    const r = await preguntar(m, 'Dame un informe del colegio');
    expect(ultimos).toHaveLength(2);
    expect(ultimos[1]).toMatch(/esas cifras no salen de Zero/);
    expect(r.respuesta).toMatch(/No tengo esos datos a mano/);
  });

  it('sin cifras ni promesas no hay segunda vuelta', async () => {
    const { m, ultimos } = modelo(() => '¿Qué nombre le ponemos al año escolar y cuáles son sus fechas?');
    await preguntar(m, 'Tengo un colegio nuevo');
    expect(ultimos).toHaveLength(1);
  });

  it('las expresiones reconocen lo que se vio en la prueba', () => {
    expect(PROMETE_CONFIRMAR.test('Cuando pulses "Confirmar", este año quedará activo.')).toBe(true);
    expect(PROMETE_CONFIRMAR.test('Revisa cada una y pulsa **Confirmar** en las que quieras.')).toBe(true);
    expect(PROMETE_CONFIRMAR.test('Confirmado: el año quedó creado.')).toBe(false);
    expect(CON_CIFRAS.test('Tienes RD$ 144,000.00 vencido')).toBe(true);
    expect(CON_CIFRAS.test('Hay 4 estudiantes en 4 secciones')).toBe(false);
    for (const p of ['Crea las secciones', 'Pon las tarifas', 'Matricúlalos con fecha 24 de agosto', 'Genera ya la mora', 'Confirmado. Sigue con la Mensualidad.', 'A Ana quítale el almuerzo', 'Factúrale octubre a los Pérez', 'Cóbrale la excursión a Primario']) {
      expect(PIDE_ACCION.test(p), p).toBe(true);
    }
    for (const p of ['¿Quién me debe?', '¿Cuánto facturé en octubre?', 'Dame un informe del colegio', '¿Cuánto falta por cobrar del año?', 'Ver la factura de Luis']) {
      expect(PIDE_ACCION.test(p), p).toBe(false);
    }
  });
});

describe('tarjetas en el historial', () => {
  it('al modelo le vuelven las tarjetas que dejó; sin tarjetas, el texto tal cual', () => {
    const t = conTarjetas('Dejé lista la tarjeta.', [
      { nombre: 'Configuración del colegio', resumen: 'año activo' },
      { nombre: TARJETA_GUARDADA, resumen: 'Matricular en Pre-Kinder A a Ana Pérez: 7 cargo(s) por RD$ 49,500.00' },
    ]);
    expect(t).toMatch(/Dejé lista la tarjeta\.\n\n\[Tarjetas para confirmar que dejé.*\n- Matricular en Pre-Kinder A a Ana Pérez/s);
    expect(t).not.toMatch(/año activo/);
    expect(conTarjetas('Hola', null)).toBe('Hola');
    expect(conTarjetas('Hola', [{ nombre: 'Estudiantes', resumen: 'Ana' }])).toBe('Hola');
  });
});
