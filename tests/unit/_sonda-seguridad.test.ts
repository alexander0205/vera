import { it, vi } from 'vitest';
vi.mock('@/lib/db/drizzle', () => ({ db: {} }));
vi.mock('@/lib/auth/modules', () => ({ getTeamModules: vi.fn() }));
vi.mock('@/lib/auth/permissions', () => ({ getEffectivePermissions: vi.fn() }));
vi.mock('@/lib/reportes/queries', () => ({ getKpis: vi.fn(), getTendencia: vi.fn(), getIngresosPorProducto: vi.fn(), getIngresosPorCliente: vi.fn(), getIngresosPorMetodo: vi.fn(), getAgingCxC: vi.fn(), getItbisResumen: vi.fn(), getVentasPorTipo: vi.fn(), getVentasPorUsuario: vi.fn() }));
vi.mock('@/lib/compras/captura/consultas', () => ({ listarCapturas: vi.fn(), contarPorRevisar: vi.fn() }));
vi.mock('@/lib/compras/consultas', () => ({ listarCompras: vi.fn(), resumenGastos: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@ai-sdk/google', () => ({ google: vi.fn() }));
import { crearHerramientas } from '@/lib/asistente/herramientas';
import { contextoDePrueba } from '@/lib/asistente/contexto';
import { responderLocal } from '@/lib/asistente/local';
import { ATAQUES } from './_ataques';

it('sonda', async () => {
  const out: string[] = [];
  for (const a of ATAQUES) {
    const reales = crearHerramientas(contextoDePrueba(1), []) as Record<string, { inputSchema?: unknown }>;
    let llamadas = 0;
    const tools = Object.fromEntries(Object.keys(reales).map((n) => [n, {
      inputSchema: reales[n].inputSchema,
      execute: n === 'donde_encontrar' ? (reales[n] as never as { execute: unknown }).execute : async () => { llamadas++; return { ventasNetas: 999, facturas: 9, totalPorCobrar: 1, coinciden: 1 }; },
    }]));
    const r = await responderLocal(a.texto, tools as never, { hoy: '2026-10-14' });
    const tag = r ? (r.intencion.startsWith('politica') ? r.intencion : `DATOS:${r.intencion}`) : 'IA';
    out.push(`${a.cat}\t${a.esperado}\t${tag}\t${llamadas}\t${a.texto.replace(/[\u200b]/g, '·').slice(0, 70)}`);
  }
  (await import('node:fs')).writeFileSync('C:/tmp/sonda-seg.txt', out.join(String.fromCharCode(10)));
});
