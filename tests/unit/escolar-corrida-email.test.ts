import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El cliente de Resend se mockea: estas pruebas JAMÁS mandan un correo. Lo que
 * se comprueba es lo que le entregaríamos a Resend.
 */
const enviar = vi.fn();
vi.mock('@/lib/email', () => ({
  resend: { emails: { send: (...a: unknown[]) => enviar(...a) } },
  assertSent: (res: { error: unknown }, contexto: string) => {
    if (res.error) throw new Error(`Resend falló en ${contexto}: ${JSON.stringify(res.error)}`);
  },
}));

import {
  armarCorreoCorrida,
  enviarAvisoCorrida,
  urlsDeLaCorrida,
} from '@/lib/email/escolar-corrida';
import type { DatosAvisoCorrida } from '@/lib/administracion-escolar/corrida-textos';

const BASE = 'https://app.zero.com.do';
let guardadas: Record<string, string | undefined>;

beforeEach(() => {
  enviar.mockReset();
  enviar.mockResolvedValue({ data: { id: 'x' }, error: null });
  guardadas = {
    PLANTILLAS_BASE_URL: process.env.PLANTILLAS_BASE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
  process.env.PLANTILLAS_BASE_URL = BASE;
  process.env.NEXT_PUBLIC_APP_URL = BASE;
});

afterEach(() => {
  for (const [k, v] of Object.entries(guardadas)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

const datos = (over: Partial<DatosAvisoCorrida> = {}): DatosAvisoCorrida => ({
  tipo: 'aviso-5',
  fecha: '2026-10-30',
  modo: 'automatico',
  colegio: 'Colegio <Ejemplo> & Hijos',
  resumen: {
    familias: 57, lineas: 90, totalCentavos: 41_250_000,
    porConcepto: [{ conceptoId: 1, concepto: 'Colegiatura', lineas: 78, totalCentavos: 39_000_000 }],
    facturadasHoy: { facturas: 0, lineas: 0, totalCentavos: 0 },
    sinCargo: { familias: 0, lineas: 0, totalCentavos: 0 },
    yaFacturadas: 0,
    revisar: [{ codigo: 'sin-responsable', cantidad: 3 }],
  },
  ...over,
});

describe('urlsDeLaCorrida', () => {
  it('apuntan a las pantallas del colegio con la base de enlaces del sistema', () => {
    expect(urlsDeLaCorrida()).toEqual({
      'por-facturar': `${BASE}/escolar/responsables?filtro=por-facturar`,
      'cuentas-por-cobrar': `${BASE}/dashboard/cuentas-por-cobrar`,
      tarifas: `${BASE}/escolar/configuracion/tarifas`,
    });
  });
});

describe('armarCorreoCorrida', () => {
  it('lleva un solo botón, hacia familias por facturar', () => {
    const { html, texto } = armarCorreoCorrida(datos());
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain(`${BASE}/escolar/responsables?filtro=por-facturar`);
    expect(texto).toContain(`${BASE}/escolar/responsables?filtro=por-facturar`);
  });

  it('el resultado con pendientes lleva los dos enlaces: por facturar y cuentas por cobrar', () => {
    const { html } = armarCorreoCorrida(datos({
      tipo: 'resultado',
      resumen: { ...datos().resumen, familias: 3, totalCentavos: 1_000_000, facturadasHoy: { facturas: 5, lineas: 5, totalCentavos: 2_000_000 } },
    }));
    expect(html).toContain('filtro=por-facturar');
    expect(html).toContain('/dashboard/cuentas-por-cobrar');
  });

  it('escapa el nombre del colegio', () => {
    const { html } = armarCorreoCorrida(datos());
    expect(html).toContain('Colegio &lt;Ejemplo&gt; &amp; Hijos');
    expect(html).not.toContain('<Ejemplo>');
  });

  it('trae la versión en texto plano con los montos en RD$', () => {
    const { texto } = armarCorreoCorrida(datos());
    expect(texto).toContain('Total: RD$412,500.00');
    expect(texto).toContain('Colegiatura: 78 cargos, RD$390,000.00');
    expect(texto).toContain('- 3 alumnos no tienen responsable de pago');
  });
});

describe('enviarAvisoCorrida', () => {
  it('manda desde Zero, con el asunto, el HTML y el texto', async () => {
    await enviarAvisoCorrida('admin@colegio.do', datos());
    expect(enviar).toHaveBeenCalledTimes(1);
    const arg = enviar.mock.calls[0][0];
    expect(arg.from).toBe('Zero <noreply@zero.com.do>');
    expect(arg.to).toBe('admin@colegio.do');
    expect(arg.subject).toBe('Así va a salir la facturación del 30 de octubre');
    expect(arg.html).toContain('Revisar familias por facturar');
    expect(arg.text).toContain('Revisar familias por facturar');
  });

  it('lanza si Resend rechaza el envío, para que no se anote como enviado', async () => {
    enviar.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'dominio sin verificar' } });
    await expect(enviarAvisoCorrida('admin@colegio.do', datos())).rejects.toThrow(/Resend falló/);
  });
});
