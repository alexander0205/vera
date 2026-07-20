'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Search, AlertTriangle, CheckCircle2, XCircle, Clock, Ban,
  FileWarning, ExternalLink, Download, Loader2, HelpCircle,
} from 'lucide-react';
import type { FilaConsulta, ResumenConsulta, EstadoNcf } from '@/lib/contabilidad/secuencias';

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

const META: Record<EstadoNcf, { label: string; cls: string; Icon: React.ElementType }> = {
  ACEPTADO:             { label: 'Aceptado',             cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  ACEPTADO_CONDICIONAL: { label: 'Aceptado condicional', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  EN_PROCESO:           { label: 'En proceso',           cls: 'bg-blue-50 text-blue-700 border-blue-200',          Icon: Clock },
  RECHAZADO:            { label: 'Rechazado',            cls: 'bg-red-50 text-red-700 border-red-200',             Icon: XCircle },
  ANULADO:              { label: 'Anulado',              cls: 'bg-gray-100 text-gray-600 border-gray-200',         Icon: Ban },
  RESERVADO:            { label: 'Reservado',            cls: 'bg-amber-50 text-amber-700 border-amber-200',       Icon: Clock },
  FALLIDO:              { label: 'Fallido',              cls: 'bg-red-50 text-red-700 border-red-200',             Icon: XCircle },
  NO_GENERADO:          { label: 'No generado',          cls: 'bg-orange-50 text-orange-700 border-orange-200',    Icon: FileWarning },
  EN_DGII_SIN_REGISTRO: { label: 'En DGII sin registro', cls: 'bg-red-100 text-red-800 border-red-300',            Icon: AlertTriangle },
  SIN_USAR:             { label: 'Sin usar',             cls: 'bg-gray-50 text-gray-500 border-gray-200',          Icon: HelpCircle },
};

const ESTADOS_ERROR: EstadoNcf[] = ['RECHAZADO', 'FALLIDO', 'NO_GENERADO', 'EN_DGII_SIN_REGISTRO'];

function dop(cents: number | null) {
  if (cents == null) return '—';
  return (cents / 100).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' });
}
function fecha(f: string | Date | null) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: 'short', year: 'numeric' });
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
  const [soloErrores, setSoloErrores] = useState(false);

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
    } catch (err) {
      setError((err as Error).message); setFilas(null); setResumen(null);
    } finally {
      setCargando(false);
    }
  }

  const visibles = filas?.filter(f => !soloErrores || ESTADOS_ERROR.includes(f.estado)) ?? [];

  function exportarCsv() {
    if (!filas?.length) return;
    const head = ['e-NCF', 'Estado', 'Motivo', 'Fecha', 'Cliente', 'RNC', 'Monto DOP', 'TrackId'];
    const linea = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      head.join(','),
      ...visibles.map(f => [
        f.encf, META[f.estado].label, f.motivo ?? '', f.fecha ? fecha(f.fecha) : '',
        f.cliente ?? '', f.rncComprador ?? '',
        f.montoTotal != null ? (f.montoTotal / 100).toFixed(2) : '', f.trackId ?? '',
      ].map(linea).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `consulta-ncf-${modo === 'encf' ? encf : `E${tipo}-${desde}-${hasta}`}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Buscador */}
      <form onSubmit={consultar} className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
          {(['rango', 'encf'] as const).map(m => (
            <button key={m} type="button" onClick={() => setModo(m)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                modo === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {m === 'rango' ? 'Por rango' : 'Por e-NCF'}
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
              <span className="text-xs font-medium text-gray-500">Desde</span>
              <input type="number" min={1} value={desde} onChange={e => setDesde(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">Hasta</span>
              <input type="number" min={1} value={hasta} onChange={e => setHasta(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28" />
            </label>
            <button type="submit" disabled={cargando}
              className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Consultar
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
          Se consultan hasta 1.000 números por vez. Los que no existen también aparecen, con su motivo.
        </p>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Métricas */}
      {resumen && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi label="Números consultados" valor={resumen.total.toLocaleString('es-DO')} />
          <Kpi label="Válidos en DGII" valor={resumen.fiscales.toLocaleString('es-DO')} tono="ok" />
          <Kpi label="Con problema" valor={resumen.conError.toLocaleString('es-DO')} tono={resumen.conError > 0 ? 'error' : 'muted'} />
          <Kpi label="Tasa de éxito" valor={`${Math.round(resumen.tasaExito * 100)}%`}
               tono={resumen.tasaExito >= 0.95 ? 'ok' : resumen.tasaExito >= 0.8 ? 'warn' : 'error'} />
          <Kpi label="Sin usar" valor={(resumen.porEstado['SIN_USAR'] ?? 0).toLocaleString('es-DO')} tono="muted" />
        </div>
      )}

      {/* Desglose por estado */}
      {resumen && Object.keys(resumen.porEstado).length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Desglose por estado</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(resumen.porEstado)
              .sort((a, b) => b[1] - a[1])
              .map(([est, n]) => {
                const m = META[est as EstadoNcf] ?? META.SIN_USAR;
                return (
                  <span key={est} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${m.cls}`}>
                    <m.Icon className="w-3.5 h-3.5" />
                    {m.label}
                    <span className="font-bold">{n}</span>
                  </span>
                );
              })}
          </div>
        </div>
      )}

      {/* Resultados */}
      {filas && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Resultados ({visibles.length.toLocaleString('es-DO')})
            </h3>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input type="checkbox" checked={soloErrores} onChange={e => setSoloErrores(e.target.checked)}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                Solo con errores
              </label>
              <button onClick={exportarCsv} disabled={!visibles.length}
                className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-800 disabled:opacity-40 font-medium">
                <Download className="w-4 h-4" /> Excel
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">e-NCF</th>
                  <th className="px-4 py-2.5 text-left">Estado</th>
                  <th className="px-4 py-2.5 text-left">Fecha</th>
                  <th className="px-4 py-2.5 text-left">Cliente</th>
                  <th className="px-4 py-2.5 text-right">Monto</th>
                  <th className="px-4 py-2.5 text-left">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibles.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    {soloErrores ? 'Ningún comprobante con errores en este rango. ✅' : 'Sin resultados.'}
                  </td></tr>
                ) : visibles.map(f => {
                  const m = META[f.estado] ?? META.SIN_USAR;
                  return (
                    <tr key={f.encf} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-3 font-mono text-xs text-gray-900 whitespace-nowrap">{f.encf}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${m.cls}`}>
                          <m.Icon className="w-3.5 h-3.5" /> {m.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fecha(f.fecha)}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {f.cliente ?? <span className="text-gray-300">—</span>}
                        {f.rncComprador && <span className="block text-xs text-gray-400 font-mono">{f.rncComprador}</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 whitespace-nowrap">{dop(f.montoTotal)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-md">
                        {f.motivo && <p className="mb-1">{f.motivo}</p>}
                        <div className="flex flex-wrap gap-3">
                          {f.documentoId && (
                            <Link href={`/dashboard/facturas/${f.documentoId}`} className="text-teal-600 hover:underline font-medium">
                              Ver factura
                            </Link>
                          )}
                          {f.urlVerificacion && (
                            <a href={f.urlVerificacion} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-teal-600 hover:underline font-medium">
                              Verificar en DGII <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {f.proveedor && !f.documentoId && (
                            <span className="text-gray-400">
                              Proveedor: {f.proveedor.estado}
                              {f.proveedor.enviadoEn ? ` · enviado ${fecha(f.proveedor.enviadoEn)}` : ' · nunca enviado'}
                            </span>
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

function Kpi({ label, valor, tono = 'default' }: { label: string; valor: string; tono?: 'default' | 'ok' | 'warn' | 'error' | 'muted' }) {
  const cls = {
    default: 'text-gray-900', ok: 'text-emerald-600', warn: 'text-amber-600',
    error: 'text-red-600', muted: 'text-gray-400',
  }[tono];
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${cls}`}>{valor}</p>
    </div>
  );
}
