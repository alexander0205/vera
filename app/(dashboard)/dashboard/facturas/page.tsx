'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus, Download, Search, Filter, Mail, Ban, FileText,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

const ESTADOS = ['todos', 'BORRADOR', 'EN_PROCESO', 'ACEPTADO', 'ACEPTADO_CONDICIONAL', 'RECHAZADO', 'ANULADO'];
const ESTADO_BADGE: Record<string, string> = {
  ACEPTADO: 'bg-green-100 text-green-700',
  ACEPTADO_CONDICIONAL: 'bg-yellow-100 text-yellow-700',
  EN_PROCESO: 'bg-blue-100 text-blue-700',
  RECHAZADO: 'bg-red-100 text-red-700',
  BORRADOR: 'bg-gray-100 text-gray-600',
  ANULADO: 'bg-gray-100 text-gray-400 line-through',
};
const TIPO_LABELS: Record<string, string> = {
  '31': 'Créd. Fiscal', '32': 'Consumo', '33': 'Nota Débito',
  '34': 'Nota Crédito', '41': 'Compras', '43': 'Gastos Men.',
  '44': 'Reg. Único', '45': 'Gub.', '46': 'Export.', '47': 'Otros',
};

interface Doc {
  id: number; encf: string; tipoEcf: string; estado: string;
  razonSocialComprador: string | null; emailComprador: string | null;
  montoTotal: number; totalItbis: number; createdAt: string;
}

export default function FacturasPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [emailModal, setEmailModal] = useState<{ id: number; email: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const limit = 50;

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({
      limit: String(limit),
      offset: String((page - 1) * limit),
      ...(search && { search }),
      ...(estado !== 'todos' && { estado }),
      ...(desde && { desde }),
      ...(hasta && { hasta }),
    });
    const res = await fetch(`/api/facturas?${sp}`).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setDocs(data.docs ?? data);
      setTotal(data.total ?? data.length);
    }
    setLoading(false);
  }, [search, estado, desde, hasta, page]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  function toggleSelect(id: number) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(s => s.size === docs.length ? new Set() : new Set(docs.map(d => d.id)));
  }

  async function bulkAnular() {
    if (!confirm(`¿Anular ${selected.size} comprobante(s)?`)) return;
    const res = await fetch('/api/facturas/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'anular', ids: [...selected] }),
    });
    if (res.ok) {
      toast.success(`${selected.size} comprobante(s) anulados`);
      setSelected(new Set());
      fetchDocs();
    } else {
      toast.error('Error al anular');
    }
  }

  function exportCsv() {
    const sp = new URLSearchParams({
      ...(estado !== 'todos' && { estado }),
      ...(desde && { desde }),
      ...(hasta && { hasta }),
    });
    window.location.href = `/api/facturas/export?${sp}`;
  }

  async function sendEmail() {
    if (!emailModal) return;
    setEmailLoading(true);
    const res = await fetch(`/api/facturas/${emailModal.id}/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailModal.email }),
    });
    if (res.ok) {
      toast.success('Factura enviada por email');
      setEmailModal(null);
    } else {
      const d = await res.json();
      toast.error(d.error ?? 'Error enviando email');
    }
    setEmailLoading(false);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Facturas</h1>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-700">
            <Download className="h-4 w-4" /> CSV
          </button>
          <Link href="/dashboard/facturas/nueva"
            className="flex items-center gap-1.5 bg-teal-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-teal-700 font-medium">
            <Plus className="h-4 w-4" /> Nueva Factura
          </Link>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por e-NCF o cliente..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <select value={estado} onChange={e => { setEstado(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
          {ESTADOS.map(e => <option key={e} value={e}>{e === 'todos' ? 'Todos los estados' : e}</option>)}
        </select>
        <button onClick={() => setShowFilters(f => !f)}
          className={`flex items-center gap-1.5 text-sm border px-3 py-2 rounded-lg ${showFilters ? 'bg-teal-50 border-teal-300 text-teal-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
          <Filter className="h-4 w-4" /> Fechas
        </button>
      </div>

      {showFilters && (
        <div className="flex gap-3 items-center flex-wrap">
          <label className="text-sm text-gray-600">Desde:</label>
          <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <label className="text-sm text-gray-600">Hasta:</label>
          <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          {(desde || hasta) && (
            <button onClick={() => { setDesde(''); setHasta(''); }}
              className="text-sm text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">
              Limpiar
            </button>
          )}
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-teal-800">{selected.size} seleccionado(s)</span>
          <button onClick={bulkAnular}
            className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700 border border-red-200 px-3 py-1 rounded-lg hover:bg-red-50">
            <Ban className="h-3.5 w-3.5" /> Anular seleccionados
          </button>
          <button onClick={() => setSelected(new Set())}
            className="text-sm text-gray-500 hover:text-gray-700 ml-auto">
            Cancelar
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Cargando...</div>
        ) : docs.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No se encontraron comprobantes</p>
            <Link href="/dashboard/facturas/nueva"
              className="inline-flex items-center gap-1 mt-4 text-sm text-teal-600 hover:underline">
              <Plus className="h-4 w-4" /> Emitir primer comprobante
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={selected.size === docs.length && docs.length > 0}
                      onChange={toggleAll}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">e-NCF</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Monto</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Fecha</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {docs.map(doc => (
                  <tr key={doc.id} className={`hover:bg-gray-50 transition-colors ${selected.has(doc.id) ? 'bg-teal-50/50' : ''}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggleSelect(doc.id)}
                        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/facturas/${doc.id}`}
                        className="font-mono text-xs font-medium text-teal-700 hover:underline">
                        {doc.encf}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">
                      {TIPO_LABELS[doc.tipoEcf] ?? doc.tipoEcf}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-900 truncate max-w-[200px]">
                        {doc.razonSocialComprador ?? '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 text-sm">
                      {(doc.montoTotal / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[doc.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                        {doc.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-400 hidden lg:table-cell">
                      {new Date(doc.createdAt).toLocaleDateString('es-DO')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Link href={`/api/pdf/factura/${doc.id}`} target="_blank"
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Ver PDF">
                          <FileText className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          onClick={() => setEmailModal({ id: doc.id, email: doc.emailComprador ?? '' })}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Enviar por email">
                          <Mail className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{total} comprobantes en total</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-gray-700">Página {page} de {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Email modal */}
      {emailModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Enviar factura por email</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email del destinatario</label>
              <input
                type="email"
                value={emailModal.email}
                onChange={e => setEmailModal(m => m ? { ...m, email: e.target.value } : m)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="cliente@empresa.com"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setEmailModal(null)}
                className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={sendEmail} disabled={emailLoading || !emailModal.email}
                className="text-sm px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {emailLoading ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
