'use client';

import { useEffect, useState } from 'react';
import { Store, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface AlmacenAsig {
  id: number;
  nombre: string;
  asignado: boolean;
  stockActual: number;
}

/**
 * "Almacenes donde se vende" — asigna el producto a los puntos de venta (almacenes).
 * Se auto-oculta si el usuario no tiene pos:configurar (GET responde 403).
 * `visiblePos` activa el aviso anti-huérfano (visible en POS pero sin almacén).
 */
export default function AlmacenesPosSection({ productoId, visiblePos }: { productoId: number; visiblePos: boolean }) {
  const [almacenes, setAlmacenes] = useState<AlmacenAsig[] | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [oculto, setOculto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/pos/asignaciones?productId=${productoId}`);
      if (!res.ok) { setOculto(true); return; }
      const data = await res.json();
      const alms: AlmacenAsig[] = data.almacenes ?? [];
      setAlmacenes(alms);
      setSel(new Set(alms.filter((a) => a.asignado).map((a) => a.id)));
    })();
  }, [productoId]);

  if (oculto) return null;

  function toggle(id: number) {
    setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function guardar() {
    setGuardando(true);
    const res = await fetch('/api/pos/asignaciones', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: productoId, almacenIds: [...sel] }),
    });
    setGuardando(false);
    if (!res.ok) { toast.error('No se pudo guardar'); return; }
    const r = await res.json();
    if (r.noRemovibles?.length) {
      toast.warning(`Guardado. No se quitaron de: ${r.noRemovibles.join(', ')} (tienen stock).`);
    } else {
      toast.success('Puntos de venta actualizados');
    }
    setAlmacenes((prev) => prev?.map((a) => ({ ...a, asignado: sel.has(a.id) })) ?? null);
  }

  const huerfano = visiblePos && sel.size === 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <Store className="h-4.5 w-4.5 text-gray-500" />
        <h2 className="text-sm font-medium text-gray-900">Almacenes donde se vende (POS)</h2>
      </div>
      <p className="mb-3 text-xs text-gray-500">El producto aparece en la caja de cada almacén marcado.</p>

      {huerfano && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Este producto está marcado como visible en POS pero no está en ningún almacén → no aparecerá en ninguna caja. Asígnale al menos uno.</span>
        </div>
      )}

      {almacenes === null ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : almacenes.length === 0 ? (
        <p className="text-sm text-gray-400">No hay almacenes. Crea uno en Inventario → Almacenes.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {almacenes.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50">
                <input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} />
                <span className="flex-1">{a.nombre}</span>
                {a.stockActual > 0 && <span className="text-xs text-gray-400">stock {a.stockActual}</span>}
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={guardar} disabled={guardando} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
