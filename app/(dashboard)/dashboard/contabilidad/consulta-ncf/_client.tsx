'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Search, AlertTriangle, ExternalLink, Download, Loader2, ChevronDown, Printer,
} from 'lucide-react';
import {
  ESTADO_NCF_META, VEREDICTO_META, ESTADOS_ERROR,
  type EstadoNcf, type Veredicto,
} from '@/lib/contabilidad/estados';

// El tipo de fila viaja por JSON desde la API; se declara aquí para no importar
// la capa de datos (que arrastraría drizzle y el cliente de ecf-api al bundle).
interface FilaConsulta {
  numero: number;
  encf: string;
  estado: EstadoNcf;
  motivo: string | null;
  fecha: string | null;
  cliente: string | null;
  rncComprador: string | null;
  montoTotal: number | null;
  trackId: string | null;
  urlVerificacion: string | null;
  documentoId: number | null;
  proveedor: { estado: string; enviadoEn: string | null; ambiente: string | null } | null;
}
interface ResumenConsulta {
  total: number;
  porEstado: Record<string, number>;
  fiscales: number;
  conError: number;
  tasaExito: number;
}

const TIPOS = [
  { value: '31', label: '31 — Crédito fiscal' },
  { value: '32', label: '32 — Consumo' },
  { value: '33', label: '33 — Nota de débito' },
  { value: '34', label: '34 — Nota de crédito' },
  { value: '41', label: '41 — Compras' },
  { value: '43', label: '43 — Gastos menores' },
  { value: '44', label: '44 — Régimen especial' },
  { value: '45', label: '45 — Gubernamental' },
  { value: '46', label: '46 — Exportación' },
  { value: '47', label: '47 — Pago exterior' },
];

function dop(cents: number | null) {
  if (cents == null) return '—';
  return (cents / 100).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' });
}
function fecha(f: string | null) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-DO', {
    timeZone: 'America/Santo_Domingo', day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function ConsultaNcfClient() {
  const [modo, setModo] = useState<'rango' | 'encf'>('rango');
  const [tipo, setTipo] = useState('32');
  const [desde, setDesde] = useState('1');
  const [hasta, setHasta] = useState('100');
  const [encf, setEncf] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaConsulta[] | null>(null);
  const [resumen, setResumen] = useState<ResumenConsulta | null>(null);
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const [titulo, setTitulo] = useState('');

  async function consultar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true); setError(null);
    try {
      const qs = modo === 'encf'
        ? `encf=${encodeURIComponent(encf.trim())}`
        : `tipo=${tipo}&desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
      const res = await fetch(`/api/contabilidad/consulta-ncf?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo consultar');
      setFilas(json.filas); setResumen(json.resumen);
      setTitulo(modo === 'encf' ? encf.trim().toUpperCase() : `Comprobantes E${tipo} del ${desde} al ${hasta}`);
    } catch (err) {
      setError((err as Error).message); setFilas(null); setResumen(null);
    } finally {
      setCargando(false);
    }
  }

  const visibles = filas?.filter(f => !soloProblemas || ESTADOS_ERROR.includes(f.estado)) ?? [];

  // Conteos por veredicto — es lo que la contadora necesita de un vistazo.
  const porVeredicto = (v: Veredicto) =>
    filas?.filter(f => ESTADO_NCF_META[f.estado]?.veredicto === v).length ?? 0;

  function exportarCsv() {
    if (!visibles.length) return;
    const head = ['Comprobante', '¿Se declara?', 'Resultado', 'Qué pasó', 'Fecha', 'Cliente', 'RNC', 'Monto DOP'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      head.join(','),
      ...visibles.map(f => {
        const m = ESTADO_NCF_META[f.estado];
        return [
          f.encf, VEREDICTO_META[m.veredicto].label, m.label,
          f.motivo ?? m.queSignifica, fecha(f.fecha),
          f.cliente ?? '', f.rncComprador ?? '',
          f.montoTotal != null ? (f.montoTotal / 100).toFixed(2) : '',
        ].map(esc).join(',');
      }),
    ].join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `comprobantes-${modo === 'encf' ? encf : `E${tipo}-${desde}-${hasta}`}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* ── Buscador ─────────────────────────────────────────────────────── */}
      <form onSubmit={consultar} className="bg-white border border-gray-200 rounded-xl p-4 print:hidden">
        <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
          {(['rango', 'encf'] as const).map(m => (
            <button key={m} type="button" onClick={() => setModo(m)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                modo === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {m === 'rango' ? 'Revisar un rango' : 'Buscar un comprobante'}
            </button>
          ))}
        </div>

        {modo === 'rango' ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">Tipo de comprobante</span>
              <select value={tipo} onChange={e => setTipo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[210px] bg-white">
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">Del número</span>
              <input type="number" min={1} value={desde} onChange={e => setDesde(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">Al número</span>
              <input type="number" min={1} value={hasta} onChange={e => setHasta(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28" />
            </label>
            <button type="submit" disabled={cargando}
              className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Revisar
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">Número de comprobante</span>
              <input value={encf} onChange={e => setEncf(e.target.value)} placeholder="E320000000094"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono w-56" />
            </label>
            <button type="submit" disabled={cargando || !encf.trim()}
              className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Buscar
            </button>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">
          Aparecen todos los números del rango, incluidos los que nunca se usaron — con la explicación de qué pasó con cada uno.
        </p>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* ── Resumen en lenguaje de contabilidad ──────────────────────────── */}
      {resumen && filas && (
        <>
          <div className="hidden print:block mb-3">
            <h2 className="text-lg font-bold">{titulo}</h2>
            <p className="text-xs text-gray-500">
              Consultado el {new Date().toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', dateStyle: 'long' })}
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta label="Sí se declaran" valor={porVeredicto('declarar')}
                     nota="Válidos en la DGII" tono="ok" />
            <Tarjeta label="No se declaran" valor={porVeredicto('no-declarar')}
                     nota="Nunca llegaron o fueron anulados" tono="muted" />
            <Tarjeta label="Aún no" valor={porVeredicto('esperar')}
                     nota="Esperando respuesta de la DGII" tono="warn" />
            <Tarjeta label="Hay que revisar" valor={porVeredicto('revisar')}
                     nota="Requieren atención de soporte" tono={porVeredicto('revisar') > 0 ? 'error' : 'muted'} />
          </div>

          {/* Frase de cierre — la respuesta corta */}
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-sm text-teal-900">
            De los <strong>{resumen.total.toLocaleString('es-DO')}</strong> números revisados,{' '}
            <strong>{porVeredicto('declarar').toLocaleString('es-DO')}</strong> son comprobantes válidos que van en tu declaración.
            {porVeredicto('no-declarar') > 0 && (
              <> Otros <strong>{porVeredicto('no-declarar').toLocaleString('es-DO')}</strong> no se declaran (nunca llegaron a la DGII, se anularon o siguen sin usar).</>
            )}
            {porVeredicto('revisar') > 0 && (
              <> Y <strong>{porVeredicto('revisar')}</strong> necesitan revisión — avísale a soporte.</>
            )}
          </div>
        </>
      )}

      {/* ── Ayuda ─────────────────────────────────────────────────────────── */}
      {filas && (
        <div className="bg-white border border-gray-200 rounded-xl print:hidden">
          <button onClick={() => setAyudaAbierta(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            ¿Qué significa cada resultado?
            <ChevronDown className={`w-4 h-4 transition-transform ${ayudaAbierta ? 'rotate-180' : ''}`} />
          </button>
          {ayudaAbierta && (
            <div className="px-4 pb-4 grid sm:grid-cols-2 gap-3 border-t border-gray-100 pt-3">
              {(Object.keys(ESTADO_NCF_META) as EstadoNcf[]).map(k => {
                const m = ESTADO_NCF_META[k];
                return (
                  <div key={k} className="text-sm">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border mb-1 ${VEREDICTO_META[m.veredicto].cls}`}>
                      {m.label}
                    </span>
                    <p className="text-gray-600">{m.queSignifica}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{m.queHacer}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Resultados ────────────────────────────────────────────────────── */}
      {filas && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900">
              {visibles.length.toLocaleString('es-DO')} comprobante{visibles.length === 1 ? '' : 's'}
            </h3>
            <div className="flex items-center gap-4 print:hidden">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input type="checkbox" checked={soloProblemas} onChange={e => setSoloProblemas(e.target.checked)}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                Ver solo los que tuvieron problema
              </label>
              <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium">
                <Printer className="w-4 h-4" /> Imprimir
              </button>
              <button onClick={exportarCsv} disabled={!visibles.length}
                className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-800 disabled:opacity-40 font-medium">
                <Download className="w-4 h-4" /> Excel
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[880px]">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Comprobante</th>
                  <th className="px-4 py-2.5 text-left">¿Se declara?</th>
                  <th className="px-4 py-2.5 text-left">Resultado</th>
                  <th className="px-4 py-2.5 text-left">Fecha</th>
                  <th className="px-4 py-2.5 text-left">Cliente</th>
                  <th className="px-4 py-2.5 text-right">Monto</th>
                  <th className="px-4 py-2.5 text-left">Qué pasó</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibles.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    {soloProblemas ? 'Ningún comprobante con problemas en este rango. Todo en orden ✅' : 'Sin resultados.'}
                  </td></tr>
                ) : visibles.map(f => {
                  const m = ESTADO_NCF_META[f.estado];
                  const v = VEREDICTO_META[m.veredicto];
                  return (
                    <tr key={f.encf} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-3 font-mono text-xs text-gray-900 whitespace-nowrap">{f.encf}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${v.cls}`}>
                          {v.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{m.label}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fecha(f.fecha)}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {f.cliente ?? <span className="text-gray-300">—</span>}
                        {f.rncComprador && <span className="block text-xs text-gray-400 font-mono">{f.rncComprador}</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 whitespace-nowrap">{dop(f.montoTotal)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-sm">
                        <p>{f.motivo ?? m.queSignifica}</p>
                        <p className="text-gray-400 mt-0.5">{m.queHacer}</p>
                        <div className="flex flex-wrap gap-3 mt-1.5 print:hidden">
                          {f.documentoId && (
                            <Link href={`/dashboard/facturas/${f.documentoId}`} className="text-teal-600 hover:underline font-medium">
                              Ver factura
                            </Link>
                          )}
                          {f.urlVerificacion && (
                            <a href={f.urlVerificacion} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-teal-600 hover:underline font-medium">
                              Verificar en la DGII <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Tarjeta({
  label, valor, nota, tono,
}: { label: string; valor: number; nota: string; tono: 'ok' | 'warn' | 'error' | 'muted' }) {
  const cls = { ok: 'text-emerald-600', warn: 'text-amber-600', error: 'text-red-600', muted: 'text-gray-400' }[tono];
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${cls}`}>{valor.toLocaleString('es-DO')}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{nota}</p>
    </div>
  );
}
