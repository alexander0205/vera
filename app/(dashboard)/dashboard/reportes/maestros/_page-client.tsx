'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronRight, Tags, Loader2, Calendar } from 'lucide-react';

interface MaestroOpt { id: number; nombre: string; }
interface Fila { valorId: number; valor: string; count: number; total: number; }

const fmtDOP = (cts: number) =>
  `RD$${(cts / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function inicioDeMes() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
}

export default function ReporteMaestrosClient() {
  const [maestros, setMaestros]   = useState<MaestroOpt[]>([]);
  const [maestroId, setMaestroId] = useState<string>('');
  const [desde, setDesde]         = useState(inicioDeMes());
  const [hasta, setHasta]         = useState(new Date().toISOString().slice(0, 10));
  const [filas, setFilas]         = useState<Fila[]>([]);
  const [totalGeneral, setTotalGeneral]   = useState(0);
  const [totalFacturas, setTotalFacturas] = useState(0);
  const [loading, setLoading]     = useState(false);

  // Catálogo de maestros de factura
  useEffect(() => {
    fetch('/api/facturas/maestros')
      .then(r => r.json())
      .then(d => {
        const list: MaestroOpt[] = (d.maestros ?? []).map((m: MaestroOpt) => ({ id: m.id, nombre: m.nombre }));
        setMaestros(list);
        if (list.length && !maestroId) setMaestroId(String(list[0].id));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargar = useCallback(async () => {
    if (!maestroId) return;
    setLoading(true);
    try {
      const sp = new URLSearchParams({ maestroId, desde, hasta });
      const d  = await fetch(`/api/reportes/maestros?${sp}`).then(r => r.json());
      setFilas(d.filas ?? []);
      setTotalGeneral(d.totalGeneral ?? 0);
      setTotalFacturas(d.totalFacturas ?? 0);
    } finally {
      setLoading(false);
    }
  }, [maestroId, desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const maxTotal = Math.max(...filas.map(f => f.total), 1);

  return (
    <section className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2">
        <Link href="/dashboard/reportes" className="hover:text-teal-600">Reportes</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-teal-600 font-medium">Ventas por clasificación</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ventas por clasificación</h1>
        <p className="text-sm text-gray-500 mt-1">
          Totales de venta agrupados por los valores de un maestro de factura. Excluye anuladas.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Tags className="h-4 w-4 text-gray-400" />
          <select
            value={maestroId}
            onChange={(e) => setMaestroId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {maestros.length === 0 && <option value="">Sin maestros de factura</option>}
            {maestros.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
          <Calendar className="h-4 w-4 text-gray-400" />
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="bg-transparent border-0 focus:outline-none text-sm" />
          <span className="text-gray-400">—</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="bg-transparent border-0 focus:outline-none text-sm" />
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Total vendido (clasificado)</p>
          <p className="text-lg font-bold text-gray-900">{fmtDOP(totalGeneral)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Facturas clasificadas</p>
          <p className="text-lg font-bold text-gray-900">{totalFacturas}</p>
        </div>
      </div>

      {/* Tabla con barras */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Desglose por valor</h2>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-teal-600" />}
        </div>
        {filas.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">
            {loading ? 'Cargando…' : 'Sin facturas clasificadas en este rango.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left">Valor</th>
                <th className="px-4 py-2.5 text-right">Facturas</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-left w-1/3">Participación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.map(f => (
                <tr key={f.valorId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{f.valor}</td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{f.count}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 tabular-nums">{fmtDOP(f.total)}</td>
                  <td className="px-4 py-3">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(f.total / maxTotal) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td className="px-4 py-3 font-semibold text-gray-700">Total</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-700 tabular-nums">{totalFacturas}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900 tabular-nums">{fmtDOP(totalGeneral)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </section>
  );
}
