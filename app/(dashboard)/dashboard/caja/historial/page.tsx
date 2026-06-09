'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, CheckCircle, AlertTriangle, Loader2, Printer } from 'lucide-react';
import { fmtDOP } from '@/lib/utils/format';

interface TurnoHistorial {
  id: number;
  numeroCierre: string | null;
  cajero: string | null;
  cajeroEmail: string;
  montoAperturaCentavos: number;
  efectivoContadoCentavos: number | null;
  montoEsperadoCentavos: number | null;
  diferenciaCentavos: number | null;
  aperturaAt: string;
  aprobadoAt: string | null;
  cierreObs: string | null;
  aprobacionObs: string | null;
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString('es-DO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function duracion(desde: string, hasta: string | null) {
  if (!hasta) return '—';
  const mins = Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function HistorialPage() {
  const [loading, setLoading]   = useState(true);
  const [turnos, setTurnos]     = useState<TurnoHistorial[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const limit = 20;

  const fetchHistorial = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({
      limit: String(limit),
      offset: String((page - 1) * limit),
    });
    const res = await fetch(`/api/caja/historial?${sp}`).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setTurnos(data.turnos ?? []);
      setTotal(data.total ?? 0);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => { fetchHistorial(); }, [fetchHistorial]);

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <section className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Historial de caja</h1>
        <p className="text-sm text-gray-500 mt-0.5">Turnos cerrados y aprobados</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      ) : turnos.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-12 text-center space-y-2">
          <Wallet className="h-10 w-10 text-gray-300 mx-auto" />
          <p className="font-semibold text-gray-600">Sin turnos cerrados aún</p>
          <p className="text-sm text-gray-400">Los turnos aparecerán aquí una vez cerrados y aprobados.</p>
        </div>
      ) : (
        <>
          {/* Tabla desktop */}
          <div className="hidden md:block bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cierre</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cajero</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Apertura</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Duración</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Esperado</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contado</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {turnos.map(t => {
                  const diff = t.diferenciaCentavos ?? 0;
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-mono text-xs text-gray-600">{t.numeroCierre ?? `#${t.id}`}</p>
                        {t.aprobadoAt && (
                          <p className="text-xs text-gray-400 mt-0.5">{fmtDatetime(t.aprobadoAt)}</p>
                        )}
                        <button
                          onClick={() => window.open(`/caja/imprimir/${t.id}`, '_blank')}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-teal-600 hover:text-teal-700 hover:underline"
                        >
                          <Printer className="h-3 w-3" /> Imprimir
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 truncate max-w-[140px]">{t.cajero ?? t.cajeroEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {fmtDatetime(t.aperturaAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {duracion(t.aperturaAt, t.aprobadoAt)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {fmtDOP(t.montoEsperadoCentavos ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {fmtDOP(t.efectivoContadoCentavos ?? 0)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {diff === 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <CheckCircle className="h-3.5 w-3.5" /> Cuadra
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums ${diff > 0 ? 'text-sky-700' : 'text-red-700'}`}>
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            {diff > 0 ? '+' : ''}{fmtDOP(diff)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cards mobile */}
          <div className="md:hidden space-y-3">
            {turnos.map(t => {
              const diff = t.diferenciaCentavos ?? 0;
              return (
                <div key={t.id} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{t.cajero ?? t.cajeroEmail}</p>
                      <p className="text-xs font-mono text-gray-400 mt-0.5">{t.numeroCierre ?? `#${t.id}`}</p>
                      <button
                        onClick={() => window.open(`/caja/imprimir/${t.id}`, '_blank')}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-teal-600 hover:underline"
                      >
                        <Printer className="h-3 w-3" /> Imprimir
                      </button>
                    </div>
                    {diff === 0 ? (
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <AlertTriangle className={`h-5 w-5 ${diff > 0 ? 'text-sky-500' : 'text-red-500'}`} />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Esperado</p>
                      <p className="font-bold tabular-nums">{fmtDOP(t.montoEsperadoCentavos ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Contado</p>
                      <p className="font-bold tabular-nums">{fmtDOP(t.efectivoContadoCentavos ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Apertura</p>
                      <p className="text-xs text-gray-700">{fmtDatetime(t.aperturaAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Duración</p>
                      <p className="text-xs text-gray-700">{duracion(t.aperturaAt, t.aprobadoAt)}</p>
                    </div>
                  </div>
                  {diff !== 0 && (
                    <div className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${diff > 0 ? 'bg-sky-50 text-sky-700' : 'bg-red-50 text-red-700'}`}>
                      Diferencia: {diff > 0 ? '+' : ''}{fmtDOP(diff)}
                      {t.cierreObs && <span className="font-normal ml-1 opacity-75">— {t.cierreObs}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Paginación */}
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>{total} turnos en total</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="px-3 py-1.5 text-gray-500">{page} / {pages}</span>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
