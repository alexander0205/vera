'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Package, Plus, Search, Tag } from 'lucide-react';
import { fmtDOP } from '@/lib/utils/format';

/**
 * Elegir QUÉ se le cobra: un concepto del colegio o algo del catálogo de
 * productos y servicios.
 *
 * Era un `<select>` con los seis conceptos escolares y nada más. Pero el
 * colegio ya tiene su catálogo en Facturación —uniformes, libros, excursiones,
 * el curso de verano— y para cobrarle una excursión a un alumno había que ir a
 * Configuración, crear un concepto a mano con el mismo nombre, y volver. Dos
 * catálogos del mismo negocio, escritos distinto.
 *
 * Aquí se escribe y se busca en los dos a la vez. Al elegir un producto se crea
 * el concepto **enlazado a él** (`product_id`), así que la factura que salga de
 * ese cargo hereda su nombre y su ITBIS en vez de inventarlos.
 */

interface Concepto {
  id: number;
  nombre: string;
  tipo: string;
  activo?: boolean;
  productId?: number | null;
}

interface Producto {
  id: number;
  nombre: string;
  precio: number;
  tipo?: string | null;
}

const traer = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : { productos: [], items: [] }));

/** Minúsculas y sin tildes: quien teclea rápido no pone tildes. */
function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function ConceptoPicker({ conceptos, value, onChange, onConceptoCreado, disabled }: {
  /** Los conceptos del colegio, ya cargados por la pantalla. */
  conceptos: Concepto[];
  /** Id del concepto elegido, como texto. Vacío = nada elegido. */
  value: string;
  onChange: (conceptoId: string) => void;
  /** Se creó un concepto nuevo desde el catálogo: la pantalla debe recargarlos. */
  onConceptoCreado?: (concepto: Concepto) => void;
  disabled?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [creando, setCreando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const elegido = conceptos.find((c) => String(c.id) === value) ?? null;

  // El catálogo solo se consulta cuando hay algo escrito: son cientos de
  // productos y abrir el desplegable no es motivo para traerlos.
  const busca = q.trim().length >= 2;
  const { data: cat, isLoading } = useSWR<{ productos?: Producto[]; items?: Producto[] }>(
    abierto && busca ? `/api/productos?q=${encodeURIComponent(q.trim())}&limit=8` : null,
    traer,
  );
  const productos: Producto[] = cat?.productos ?? cat?.items ?? [];

  const filtrados = useMemo(() => {
    const n = normalizar(q.trim());
    return conceptos
      .filter((c) => c.activo !== false)
      .filter((c) => !n || normalizar(c.nombre).includes(n));
  }, [conceptos, q]);

  /**
   * Los productos que el colegio ya tiene como concepto no se ofrecen otra vez.
   *
   * Por id cuando están enlazados, y también POR NOMBRE: los conceptos que el
   * colegio escribió a mano antes de que existiera este buscador no apuntan a
   * ningún producto, así que «Uniforme Escolar» salía en las dos listas y
   * elegir el de abajo creaba un gemelo.
   */
  const yaEstan = useMemo(() => ({
    ids: new Set(conceptos.map((c) => c.productId).filter((v): v is number => v != null)),
    nombres: new Set(conceptos.map((c) => normalizar(c.nombre.trim()))),
  }), [conceptos]);
  const productosNuevos = productos.filter(
    (p) => !yaEstan.ids.has(p.id) && !yaEstan.nombres.has(normalizar(p.nombre.trim())),
  );

  useEffect(() => { if (!abierto) { setQ(''); setError(null); } }, [abierto]);

  /**
   * Trae el producto al colegio: crea el concepto enlazado y lo deja elegido.
   *
   * El tipo nace como «otro» —no es una mensualidad— y sin calendario: es un
   * cobro suelto. Si el colegio quiere cobrarlo todos los meses, lo configura
   * después en Conceptos, que es donde vive esa decisión.
   */
  async function usarProducto(p: Producto) {
    setCreando(p.id);
    setError(null);
    try {
      const res = await fetch('/api/administracion-escolar/conceptos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: p.nombre, tipo: 'otro', productId: p.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(res.status === 403
          ? 'No tienes permiso para agregar conceptos. Pídeselo a un administrador.'
          : data.error ?? 'No se pudo agregar el concepto');
      }
      const creado: Concepto = data.concepto ?? data;
      onConceptoCreado?.(creado);
      onChange(String(creado.id));
      setAbierto(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo agregar el concepto');
    } finally {
      setCreando(null);
    }
  }

  return (
    <div className="relative">
      <button type="button" disabled={disabled}
        onClick={() => setAbierto((a) => !a)}
        className={`flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm transition-colors ${
          disabled ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
            : 'border-gray-300 bg-white text-gray-900 hover:border-gray-400'
        }`}>
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <span className={`flex-1 truncate ${elegido ? '' : 'text-gray-400'}`}>
          {elegido?.nombre ?? 'Busca un concepto, producto o servicio…'}
        </span>
      </button>

      {abierto && (
        <>
          {/* Capa para cerrar al pinchar fuera. Va detrás de la lista. */}
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-100 p-2">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Escribe para buscar…"
                className="h-9 w-full rounded-md border border-gray-200 px-2.5 text-sm outline-none focus:border-zero-500" />
            </div>

            {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}

            <div className="max-h-72 overflow-y-auto py-1">
              {filtrados.length > 0 && (
                <>
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Conceptos del colegio
                  </p>
                  {filtrados.map((c) => (
                    <button key={c.id} type="button"
                      onClick={() => { onChange(String(c.id)); setAbierto(false); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                        String(c.id) === value ? 'bg-zero-50 text-zero-900' : 'text-gray-700'
                      }`}>
                      <Tag className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                      <span className="shrink-0 text-[11px] capitalize text-gray-400">{c.tipo}</span>
                    </button>
                  ))}
                </>
              )}

              {/* El catálogo de Facturación. Solo con algo escrito: es el mismo
                  catálogo del POS y traerlo entero no cabe en un desplegable. */}
              {busca && (
                <>
                  <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Productos y servicios
                  </p>
                  {isLoading ? (
                    <p className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando…
                    </p>
                  ) : productosNuevos.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-gray-400">Nada en el catálogo con ese nombre.</p>
                  ) : productosNuevos.map((p) => (
                    <button key={p.id} type="button" disabled={creando != null}
                      onClick={() => void usarProducto(p)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      <Package className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                      <span className="shrink-0 text-[11px] text-gray-400">{fmtDOP(p.precio)}</span>
                      {creando === p.id
                        ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zero-600" />
                        : <Plus className="h-3.5 w-3.5 shrink-0 text-zero-600" />}
                    </button>
                  ))}
                </>
              )}

              {!busca && filtrados.length === 0 && (
                <p className="px-3 py-3 text-sm text-gray-400">
                  Escribe para buscar también en productos y servicios.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
