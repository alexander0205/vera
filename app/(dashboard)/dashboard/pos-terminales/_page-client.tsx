'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';

interface Ref { id: number; nombre: string; }
interface Terminal {
  id: number;
  nombre: string;
  almacenId: number;
  almacenNombre: string | null;
  impresoraId: number | null;
  listaPreciosId: number | null;
  listaNombre: string | null;
  tipoEcf: string;
  activo: boolean;
}

interface ProductoAsig {
  id: number;
  nombre: string;
  referencia: string | null;
  controlaInventario: boolean;
  visiblePos: boolean;
  asignado: boolean;
  stockActual: number;
}

const EMPTY = { nombre: '', almacenId: 0, impresoraId: 0, listaPreciosId: 0, tipoEcf: 'sin-ncf' };

export default function TerminalesClient({
  terminalesIniciales, almacenes, impresoras, listas,
}: {
  terminalesIniciales: Terminal[];
  almacenes: Ref[];
  impresoras: Ref[];
  listas: Ref[];
}) {
  const router = useRouter();
  const [terminales, setTerminales] = useState<Terminal[]>(terminalesIniciales);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY, almacenId: almacenes[0]?.id ?? 0 });
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  function nueva() {
    setEditId(null);
    setForm({ ...EMPTY, almacenId: almacenes[0]?.id ?? 0 });
    setAbierto(true);
  }
  function editar(t: Terminal) {
    setEditId(t.id);
    setForm({
      nombre: t.nombre,
      almacenId: t.almacenId,
      impresoraId: t.impresoraId ?? 0,
      listaPreciosId: t.listaPreciosId ?? 0,
      tipoEcf: t.tipoEcf,
    });
    setAbierto(true);
  }

  async function guardar() {
    if (!form.nombre.trim()) { toast.error('Nombre requerido'); return; }
    if (!form.almacenId)     { toast.error('Almacén requerido'); return; }
    setGuardando(true);
    const body = {
      nombre: form.nombre.trim(),
      almacenId: form.almacenId,
      impresoraId: form.impresoraId || null,
      listaPreciosId: form.listaPreciosId || null,
      tipoEcf: form.tipoEcf,
    };
    const url = editId ? `/api/pos/terminales/${editId}` : '/api/pos/terminales';
    const res = await fetch(url, {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setGuardando(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error ?? 'No se pudo guardar');
      return;
    }
    toast.success(editId ? 'Terminal actualizada' : 'Terminal creada');
    setAbierto(false);
    router.refresh();
    const data = await res.json();
    setTerminales((prev) => {
      const enriched: Terminal = {
        ...data.terminal,
        almacenNombre: almacenes.find((a) => a.id === data.terminal.almacenId)?.nombre ?? null,
        listaNombre: listas.find((l) => l.id === data.terminal.listaPreciosId)?.nombre ?? null,
      };
      return editId ? prev.map((t) => (t.id === editId ? enriched : t)) : [...prev, enriched];
    });
  }

  async function desactivar(id: number) {
    if (!confirm('¿Desactivar esta terminal?')) return;
    const res = await fetch(`/api/pos/terminales/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('No se pudo desactivar'); return; }
    setTerminales((prev) => prev.map((t) => (t.id === id ? { ...t, activo: false } : t)));
    toast.success('Terminal desactivada');
  }

  // ── Asignación de productos al almacén de la terminal ──────────────────────
  const [asignT, setAsignT] = useState<Terminal | null>(null);
  const [prodsAsig, setProdsAsig] = useState<ProductoAsig[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busq, setBusq] = useState('');
  const [cargAsig, setCargAsig] = useState(false);
  const [guardAsig, setGuardAsig] = useState(false);

  async function abrirAsignacion(t: Terminal) {
    setAsignT(t); setBusq(''); setCargAsig(true);
    const res = await fetch(`/api/pos/asignaciones?almacenId=${t.almacenId}`);
    if (res.ok) {
      const data = await res.json();
      const ps: ProductoAsig[] = data.productos ?? [];
      setProdsAsig(ps);
      setSel(new Set(ps.filter((p) => p.asignado).map((p) => p.id)));
    } else { toast.error('No se pudo cargar'); }
    setCargAsig(false);
  }

  function toggleSel(id: number) {
    setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function guardarAsignacion() {
    if (!asignT) return;
    setGuardAsig(true);
    const res = await fetch('/api/pos/asignaciones', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ almacenId: asignT.almacenId, productIds: [...sel] }),
    });
    setGuardAsig(false);
    if (!res.ok) { toast.error('No se pudo guardar'); return; }
    const r = await res.json();
    if (r.noRemovibles?.length) {
      toast.warning(`Guardado. No se quitaron (tienen stock): ${r.noRemovibles.join(', ')}`);
    } else {
      toast.success('Productos del punto de venta actualizados');
    }
    setAsignT(null);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">Terminales de punto de venta</h1>
          <p className="text-sm text-gray-500">Cada caja física con su almacén, impresora y lista de precios fijos.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/pos" className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Abrir POS</Link>
          <button onClick={nueva} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">Nueva terminal</button>
        </div>
      </div>

      {almacenes.length === 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Necesitas al menos un almacén. Créalo en Inventario → Almacenes.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2.5">Nombre</th>
              <th className="px-4 py-2.5">Almacén</th>
              <th className="px-4 py-2.5">Lista</th>
              <th className="px-4 py-2.5">Comprobante</th>
              <th className="px-4 py-2.5">Estado</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {terminales.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin terminales. Crea la primera.</td></tr>
            ) : terminales.map((t) => (
              <tr key={t.id} className="border-t border-gray-100">
                <td className="px-4 py-2.5 font-medium">{t.nombre}</td>
                <td className="px-4 py-2.5 text-gray-600">{t.almacenNombre ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{t.listaNombre ?? 'Base'}</td>
                <td className="px-4 py-2.5 text-gray-600">{t.tipoEcf}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${t.activo ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {t.activo ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => abrirAsignacion(t)} className="mr-3 text-gray-700">Productos</button>
                  <button onClick={() => editar(t)} className="mr-3 text-blue-600">Editar</button>
                  {t.activo && <button onClick={() => desactivar(t.id)} className="text-red-600">Desactivar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-base font-medium">{editId ? 'Editar terminal' : 'Nueva terminal'}</h2>

            <label className="block text-xs text-gray-500">Nombre</label>
            <input
              value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Caja Cafetería 1"
              className="mb-3 mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />

            <label className="block text-xs text-gray-500">Almacén (fijo)</label>
            <select
              value={form.almacenId} onChange={(e) => setForm({ ...form, almacenId: Number(e.target.value) })}
              className="mb-3 mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>

            <label className="block text-xs text-gray-500">Lista de precios (opcional)</label>
            <select
              value={form.listaPreciosId} onChange={(e) => setForm({ ...form, listaPreciosId: Number(e.target.value) })}
              className="mb-3 mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value={0}>Precio base</option>
              {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>

            <label className="block text-xs text-gray-500">Impresora (opcional)</label>
            <select
              value={form.impresoraId} onChange={(e) => setForm({ ...form, impresoraId: Number(e.target.value) })}
              className="mb-3 mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value={0}>Default del equipo</option>
              {impresoras.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>

            <label className="block text-xs text-gray-500">Comprobante por defecto</label>
            <select
              value={form.tipoEcf} onChange={(e) => setForm({ ...form, tipoEcf: e.target.value })}
              className="mb-5 mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="sin-ncf">Ticket (sin NCF)</option>
              <option value="32">Factura de consumo (e32)</option>
              <option value="31">Crédito fiscal (e31)</option>
            </select>

            <div className="flex justify-end gap-2">
              <button onClick={() => setAbierto(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {asignT && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setAsignT(null)}>
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-medium">Productos de {asignT.nombre}</h2>
            <p className="mb-3 text-xs text-gray-500">Marca los productos que se venden en este punto de venta (almacén {asignT.almacenNombre ?? asignT.almacenId}).</p>

            <input
              value={busq} onChange={(e) => setBusq(e.target.value)} placeholder="Buscar producto…"
              className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />

            <div className="flex-1 overflow-auto rounded-lg border border-gray-100">
              {cargAsig ? (
                <p className="p-4 text-sm text-gray-500">Cargando…</p>
              ) : prodsAsig.filter((p) => p.nombre.toLowerCase().includes(busq.toLowerCase())).map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-3 py-2 text-sm hover:bg-gray-50">
                  <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggleSel(p.id)} />
                  <span className="flex-1">{p.nombre}{p.referencia ? <span className="text-gray-400"> · {p.referencia}</span> : null}</span>
                  {p.controlaInventario && <span className="text-xs text-gray-400">stock {p.stockActual}</span>}
                </label>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-gray-500">{sel.size} seleccionados</span>
              <div className="flex gap-2">
                <button onClick={() => setAsignT(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancelar</button>
                <button onClick={guardarAsignacion} disabled={guardAsig} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                  {guardAsig ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
