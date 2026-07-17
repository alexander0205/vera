'use client';

/**
 * Componentes UI del formulario de factura.
 * Cada uno consume estado vía useFactura() del Provider.
 *
 * Diseño responsive:
 *   - Móvil (<md): cards apiladas, botón full-width, una columna
 *   - Desktop (md+): tabla horizontal, botón compacto, dos columnas
 */

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Loader2, AlertCircle, CheckCircle2, Search, X } from 'lucide-react';
import { useFactura } from '@/lib/factura/form';
import { fmtMoneda, type TasaItbis, type TipoPago } from '@/lib/factura/core';

// ─── ClienteSearch ────────────────────────────────────────────────────────────

interface ClienteResult {
  id:          number;
  razonSocial: string;
  rnc:         string | null;
  email:       string | null;
  /** Todos los dependientes del cliente. */
  dependientes?: string[];
}

/**
 * Buscador de clientes guardados.
 * Al seleccionar uno, llena automáticamente los campos del comprador
 * vía el Provider (useFactura). Reusable: solo importa.
 */
export function ClienteSearch() {
  const { setRncComprador, setRazonSocial, setEmailComprador } = useFactura();
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<ClienteResult[]>([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const timer                 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef            = useRef<HTMLDivElement>(null);

  // Cerrar al click fuera
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function handleInput(v: string) {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(`/api/clientes?q=${encodeURIComponent(v)}`);
        const data = await res.json();
        setResults(data.clientes ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  function select(c: ClienteResult) {
    setRncComprador(c.rnc ?? '');
    setRazonSocial(c.razonSocial);
    setEmailComprador(c.email ?? '');
    setQuery('');
    setOpen(false);
    setResults([]);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Buscar cliente <span className="text-gray-400 font-normal">(opcional)</span>
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Nombre, RNC o beneficiario del cliente..."
          className="w-full pl-10 pr-10 py-2.5 text-base md:text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
        ) : query ? (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            aria-label="Limpiar búsqueda"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-500">Sin resultados</div>
          ) : (
            results.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => select(c)}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0 truncate font-medium text-gray-900" title={c.razonSocial}>
                    {c.razonSocial}
                  </div>
                  <div className="shrink-0 font-mono text-xs text-gray-500">{c.rnc || '—'}</div>
                </div>
                {!!c.dependientes?.length && (
                  <div className="mt-1 border-t border-gray-200 pt-1">
                    {c.dependientes.map((d) => (
                      <div key={d} className="truncate text-xs text-blue-600" title={d}>{d}</div>
                    ))}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

/**
 * Datos del comprador.
 * Incluye el buscador de clientes guardados arriba + campos editables abajo.
 * Si seleccionas un cliente del buscador, los campos se rellenan automáticamente.
 * Puedes editarlos manualmente o dejarlos vacíos (consumidor final en tipo 32).
 */
export function FacturaHeader() {
  const { rncComprador, setRncComprador, razonSocial, setRazonSocial } = useFactura();
  return (
    <div className="space-y-3">
      <ClienteSearch />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            RNC / Cédula / Pasaporte <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={rncComprador}
            onChange={e => setRncComprador(e.target.value)}
            className="w-full px-3 py-2.5 text-base md:text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            placeholder="131988032 o PA123456"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Razón social <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={razonSocial}
            onChange={e => setRazonSocial(e.target.value)}
            className="w-full px-3 py-2.5 text-base md:text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            placeholder="Empresa SRL"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Items ────────────────────────────────────────────────────────────────────

export function FacturaItems() {
  const { items, addItem, removeItem, updateItem } = useFactura();

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700">Items</label>
        <button
          type="button"
          onClick={addItem}
          className="text-sm text-orange-600 hover:text-orange-700 flex items-center gap-1 px-2 py-1"
        >
          <Plus className="w-4 h-4" /> Agregar
        </button>
      </div>

      {/* ─── Móvil: cards ─────────────────────────────────────────────────── */}
      <div className="md:hidden space-y-3">
        {items.map((it, idx) => (
          <div key={it.id} className="border border-gray-200 rounded-md p-3 space-y-3 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Item #{idx + 1}</span>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  className="text-gray-400 hover:text-red-600 p-1"
                  aria-label="Eliminar item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <input
              type="text"
              value={it.nombre}
              onChange={e => updateItem(it.id, { nombre: e.target.value })}
              className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              placeholder="Nombre del producto o servicio"
            />

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Cant.</label>
                <input
                  type="number" inputMode="numeric" min="1" step="1"
                  value={it.cantidad}
                  onChange={e => updateItem(it.id, { cantidad: Number(e.target.value) || 1 })}
                  className="w-full px-2 py-2 text-base text-right border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Precio</label>
                <input
                  type="number" inputMode="decimal" min="0" step="0.01"
                  value={it.precio || ''}
                  onChange={e => updateItem(it.id, { precio: Number(e.target.value) || 0 })}
                  className="w-full px-2 py-2 text-base text-right border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">ITBIS</label>
                <select
                  value={it.tasaItbis}
                  onChange={e => updateItem(it.id, { tasaItbis: Number(e.target.value) as TasaItbis })}
                  className="w-full px-2 py-2 text-base border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                >
                  <option value={0.18}>18%</option>
                  <option value={0}>0%</option>
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-100">
              <span className="text-gray-500">Total línea</span>
              <span className="font-medium text-gray-900">
                {fmtMoneda(it.cantidad * it.precio * (1 + it.tasaItbis))}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Desktop: tabla ───────────────────────────────────────────────── */}
      <div className="hidden md:block border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Descripción</th>
              <th className="px-3 py-2 text-right font-medium w-20">Cant.</th>
              <th className="px-3 py-2 text-right font-medium w-32">Precio</th>
              <th className="px-3 py-2 text-right font-medium w-24">ITBIS</th>
              <th className="px-3 py-2 text-right font-medium w-32">Total</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map(it => (
              <tr key={it.id}>
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={it.nombre}
                    onChange={e => updateItem(it.id, { nombre: e.target.value })}
                    className="w-full px-2 py-1 border border-transparent hover:border-gray-300 focus:border-orange-500 rounded outline-none"
                    placeholder="Nombre del producto o servicio"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number" min="1" step="1"
                    value={it.cantidad}
                    onChange={e => updateItem(it.id, { cantidad: Number(e.target.value) || 1 })}
                    className="w-full px-2 py-1 text-right border border-transparent hover:border-gray-300 focus:border-orange-500 rounded outline-none"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number" min="0" step="0.01"
                    value={it.precio || ''}
                    onChange={e => updateItem(it.id, { precio: Number(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-right border border-transparent hover:border-gray-300 focus:border-orange-500 rounded outline-none"
                    placeholder="0.00"
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    value={it.tasaItbis}
                    onChange={e => updateItem(it.id, { tasaItbis: Number(e.target.value) as TasaItbis })}
                    className="w-full px-2 py-1 text-right border border-transparent hover:border-gray-300 focus:border-orange-500 rounded outline-none bg-white"
                  >
                    <option value={0.18}>18%</option>
                    <option value={0}>0%</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {fmtMoneda(it.cantidad * it.precio * (1 + it.tasaItbis))}
                </td>
                <td className="px-2 py-1 text-center">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

export function FacturaFooter() {
  const { tipoPago, setTipoPago, totales, enviando, emitir, previewAbierto } = useFactura();
  return (
    <div className="space-y-4 pt-4 border-t border-gray-200">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="w-full sm:w-auto">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de pago</label>
          <select
            value={tipoPago}
            onChange={e => setTipoPago(Number(e.target.value) as TipoPago)}
            className="w-full sm:w-auto px-3 py-2.5 text-base md:text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          >
            <option value={1}>Contado</option>
            <option value={2}>Crédito</option>
          </select>
        </div>

        <div className="text-right space-y-1 text-sm w-full sm:w-auto">
          <div className="flex justify-between sm:gap-8 text-gray-600">
            <span>Subtotal:</span><span>{fmtMoneda(totales.subtotal)}</span>
          </div>
          <div className="flex justify-between sm:gap-8 text-gray-600">
            <span>ITBIS:</span><span>{fmtMoneda(totales.totalItbis)}</span>
          </div>
          <div className="flex justify-between sm:gap-8 text-base font-semibold text-gray-900 pt-1 border-t border-gray-200">
            <span>Total:</span><span>{fmtMoneda(totales.montoTotal)}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={emitir}
        disabled={enviando || previewAbierto}
        className="w-full sm:w-auto sm:ml-auto sm:flex px-6 py-3 sm:py-2.5 bg-orange-600 text-white font-medium rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        Revisar y emitir
      </button>
    </div>
  );
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function FacturaMessages() {
  const { error, exito, previewAbierto } = useFactura();
  // Mientras la pre-factura está abierta, los errores se muestran adentro del modal.
  const visibleError = previewAbierto ? null : error;
  if (!visibleError && !exito) return null;
  return (
    <div className="space-y-2">
      {visibleError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{visibleError}</span>
        </div>
      )}
      {exito && (
        <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="break-all">
            Factura emitida: <strong>{exito.encf}</strong> — Estado: {exito.estado}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Preview / Pre-factura ────────────────────────────────────────────────────

/**
 * Modal de revisión antes de enviar a DGII.
 * Muestra cliente, items, totales y tipo de pago.
 * Botones: "Editar" (vuelve al form) / "Confirmar y emitir" (dispara API).
 */
export function FacturaPreview() {
  const {
    items, rncComprador, razonSocial, tipoPago, totales,
    enviando, error, previewAbierto, confirmar, cancelarPreview,
  } = useFactura();

  if (!previewAbierto) return null;

  const itemsValidos = items.filter(it => it.nombre.trim() && it.precio > 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={cancelarPreview}
    >
      <div
        className="bg-white w-full sm:max-w-2xl sm:rounded-lg max-h-[95vh] sm:max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-t-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header del modal */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">
            Pre-factura — Revisar antes de emitir
          </h2>
          <button
            type="button"
            onClick={cancelarPreview}
            className="p-1 text-gray-400 hover:text-gray-600"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">
          {/* Cliente */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Cliente
            </h3>
            {razonSocial.trim() ? (
              <div className="space-y-0.5">
                <p className="font-medium text-gray-900">{razonSocial}</p>
                {rncComprador.trim() && (
                  <p className="text-sm text-gray-600">RNC: {rncComprador}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">Consumidor final</p>
            )}
          </section>

          {/* Items */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Items ({itemsValidos.length})
            </h3>
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Descripción</th>
                    <th className="px-2 py-2 text-right font-medium">Cant.</th>
                    <th className="px-2 py-2 text-right font-medium hidden sm:table-cell">Precio</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {itemsValidos.map(it => (
                    <tr key={it.id}>
                      <td className="px-3 py-2 text-gray-900">{it.nombre}</td>
                      <td className="px-2 py-2 text-right text-gray-600">{it.cantidad}</td>
                      <td className="px-2 py-2 text-right text-gray-600 hidden sm:table-cell">
                        {fmtMoneda(it.precio)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900 font-medium">
                        {fmtMoneda(it.cantidad * it.precio * (1 + it.tasaItbis))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Totales */}
          <section className="border-t border-gray-200 pt-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal:</span>
              <span>{fmtMoneda(totales.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>ITBIS:</span>
              <span>{fmtMoneda(totales.totalItbis)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900 pt-1.5 border-t border-gray-100">
              <span>Total:</span>
              <span>{fmtMoneda(totales.montoTotal)}</span>
            </div>
          </section>

          {/* Tipo de pago */}
          <section className="text-sm">
            <span className="text-gray-500">Tipo de pago: </span>
            <span className="font-medium text-gray-900">
              {tipoPago === 1 ? 'Contado' : tipoPago === 2 ? 'Crédito' : 'Gratuito'}
            </span>
          </section>

          {/* Error de la API (si falla el envío) */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer del modal */}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 px-4 sm:px-6 py-3 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={cancelarPreview}
            disabled={enviando}
            className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={enviando}
            className="w-full sm:flex-1 px-4 py-2.5 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {enviando ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Emitiendo...</>
            ) : 'Confirmar y emitir'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Wrapper de conveniencia ──────────────────────────────────────────────────

export function FacturaForm() {
  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 sm:p-6 space-y-6">
        <FacturaHeader />
        <FacturaItems />
        <FacturaFooter />
        <FacturaMessages />
      </div>
      <FacturaPreview />
    </>
  );
}
