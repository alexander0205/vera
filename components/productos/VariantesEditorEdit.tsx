'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Layers, Plus, X, RotateCcw } from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Eje { nombre: string; valores: string[]; }

/** Forma que emite el editor (la consume PUT /api/productos/[id]). */
export interface VariantesEditPayload {
  variantAtributos: { nombre: string; valores: string[] }[];
  variants: {
    id?: number;
    atributos: Record<string, string>;
    nombre: string;
    precio?: number;      // DOP; ausente = hereda del padre
    stockActual: number;  // objetivo en almacén por defecto
    removed?: boolean;
  }[];
}

/** Datos iniciales cargados de GET /api/productos/[id]/variants. */
export interface VariantesEditInitial {
  variantAtributos: { nombre: string; valores: string[] }[];
  variants: {
    id: number;
    atributos: Record<string, string>;
    nombre: string;
    stockActual: number;          // stock en el almacén consultado (por defecto)
    precioOverrideDOP: number | null;
  }[];
}

// Fila interna: los valores van alineados por ÍNDICE de eje (no por nombre), así
// renombrar un eje no rompe el vínculo — el objeto `atributos` se arma al emitir.
interface Row {
  id?: number;
  valores: string[];   // valores[i] = valor del eje i
  precio: string;      // '' = hereda del padre
  stock: string;
  removed: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const nombreDe = (valores: string[]) => valores.filter(Boolean).join(' · ');

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Editor de variantes EXISTENTES (modo edición del producto). A diferencia de
 * VariantesEditor (crear, cartesiano), aquí la identidad es por `id`: se pueden
 * renombrar ejes/valores, editar precio/stock, quitar (soft-delete) y agregar
 * variantes puntuales, preservando el stock y las ventas de cada variante.
 * Emite el payload por `onChange`; el padre lo manda en el PUT.
 */
export function VariantesEditorEdit({ initial, basePrecioDOP, onChange }: {
  initial: VariantesEditInitial;
  basePrecioDOP: number;
  onChange: (p: VariantesEditPayload) => void;
}) {
  const [ejes, setEjes] = useState<Eje[]>(() =>
    initial.variantAtributos.map(e => ({ nombre: e.nombre, valores: [...e.valores] })),
  );
  const [rows, setRows] = useState<Row[]>(() =>
    initial.variants.map(v => ({
      id:      v.id,
      valores: initial.variantAtributos.map(e => v.atributos[e.nombre] ?? ''),
      precio:  v.precioOverrideDOP != null ? String(v.precioOverrideDOP) : '',
      stock:   String(v.stockActual ?? 0),
      removed: false,
    })),
  );
  const [valorInput, setValorInput] = useState<Record<number, string>>({});
  // Selección para "agregar variante": un valor por eje.
  const [nuevoSel, setNuevoSel] = useState<string[]>([]);

  // Emitir payload al padre ante cualquier cambio.
  useEffect(() => {
    const variantAtributos = ejes
      .filter(e => e.nombre.trim() && e.valores.length > 0)
      .map(e => ({ nombre: e.nombre.trim(), valores: e.valores }));
    onChange({
      variantAtributos,
      variants: rows.map(r => {
        const atributos: Record<string, string> = {};
        ejes.forEach((e, i) => { if (e.nombre.trim() && r.valores[i]) atributos[e.nombre.trim()] = r.valores[i]; });
        const precioNum = parseFloat(r.precio);
        const stockNum  = parseInt(r.stock, 10);
        return {
          ...(r.id ? { id: r.id } : {}),
          atributos,
          nombre: nombreDe(ejes.map((_, i) => r.valores[i])),
          ...(r.precio.trim() && !isNaN(precioNum) ? { precio: Math.max(0, precioNum) } : {}),
          stockActual: isNaN(stockNum) ? 0 : Math.max(0, stockNum),
          ...(r.removed ? { removed: true } : {}),
        };
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ejes, rows]);

  // ── Ejes ──────────────────────────────────────────────────────────────────
  function renombrarEje(idx: number, nombre: string) {
    setEjes(prev => prev.map((e, i) => (i === idx ? { ...e, nombre } : e)));
  }
  function renombrarValor(idx: number, viejo: string, nuevo: string) {
    const val = nuevo.trim();
    if (!val) return;
    setEjes(prev => prev.map((e, i) =>
      i === idx ? { ...e, valores: e.valores.map(v => (v === viejo ? val : v)) } : e));
    // Cascada: las filas que usaban el valor viejo pasan al nuevo.
    setRows(prev => prev.map(r =>
      r.valores[idx] === viejo ? { ...r, valores: r.valores.map((v, i) => (i === idx ? val : v)) } : r));
  }
  function agregarValor(idx: number) {
    const raw = (valorInput[idx] ?? '').trim();
    if (!raw) return;
    setEjes(prev => prev.map((e, i) =>
      i === idx && !e.valores.includes(raw) ? { ...e, valores: [...e.valores, raw] } : e));
    setValorInput(prev => ({ ...prev, [idx]: '' }));
  }
  function quitarValor(idx: number, valor: string) {
    // Bloquear si alguna fila activa lo usa (evita variantes sin valor).
    const enUso = rows.some(r => !r.removed && r.valores[idx] === valor);
    if (enUso) return;
    setEjes(prev => prev.map((e, i) =>
      i === idx ? { ...e, valores: e.valores.filter(v => v !== valor) } : e));
  }

  // ── Variantes ───────────────────────────────────────────────────────────────
  const combosExistentes = useMemo(
    () => new Set(rows.filter(r => !r.removed).map(r => r.valores.join('│'))),
    [rows],
  );
  const ejesValidos = ejes.filter(e => e.nombre.trim() && e.valores.length > 0);
  const puedeAgregar = ejesValidos.length > 0
    && ejes.every((e, i) => !(e.nombre.trim() && e.valores.length > 0) || !!nuevoSel[i])
    && !combosExistentes.has(ejes.map((_, i) => nuevoSel[i] ?? '').join('│'));

  function agregarVariante() {
    const valores = ejes.map((e, i) => (e.nombre.trim() && e.valores.length > 0 ? (nuevoSel[i] ?? '') : ''));
    if (valores.some((v, i) => ejes[i].nombre.trim() && ejes[i].valores.length > 0 && !v)) return;
    if (combosExistentes.has(valores.join('│'))) return;
    setRows(prev => [...prev, { valores, precio: '', stock: '0', removed: false }]);
    setNuevoSel([]);
  }
  function setRow(idx: number, patch: Partial<Row>) {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-4">
      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
        <Layers className="h-4 w-4 text-teal-600" />
        Variantes del producto
      </div>

      {/* Ejes: renombrar eje, renombrar/agregar/quitar valores */}
      <div className="space-y-3">
        {ejes.map((eje, idx) => (
          <div key={idx} className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
            <Input
              className="bg-white font-medium"
              placeholder="Nombre del eje (ej. Talla)"
              value={eje.nombre}
              onChange={(e) => renombrarEje(idx, e.target.value)}
            />
            {eje.valores.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {eje.valores.map(v => (
                  <span key={v} className="inline-flex items-center gap-1 bg-teal-100 text-teal-800 text-xs font-medium pl-1 pr-1.5 py-0.5 rounded-full">
                    <input
                      className="bg-transparent outline-none w-[7ch] px-1 text-center"
                      defaultValue={v}
                      onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== v) renombrarValor(idx, v, e.target.value); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      title="Editar valor"
                    />
                    <button type="button" onClick={() => quitarValor(idx, v)} className="hover:text-teal-950" title="Quitar valor (si no está en uso)">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Input
                className="bg-white"
                placeholder="Agregar valor (ej. XL) y Enter"
                value={valorInput[idx] ?? ''}
                onChange={(e) => setValorInput(prev => ({ ...prev, [idx]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarValor(idx); } }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => agregarValor(idx)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Tabla de variantes */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {rows.filter(r => !r.removed).length} activas
          {rows.some(r => r.removed) && ` · ${rows.filter(r => r.removed).length} por quitar`}
        </p>
        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          <div className="grid grid-cols-[1fr_5.5rem_6rem_2rem] gap-2 px-3 py-2 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase">
            <span>Variante</span>
            <span className="text-right">Stock</span>
            <span className="text-right">Precio</span>
            <span />
          </div>
          {rows.map((r, idx) => (
            <div
              key={r.id ?? `nueva-${idx}`}
              className={`grid grid-cols-[1fr_5.5rem_6rem_2rem] gap-2 px-3 py-2 items-center ${r.removed ? 'opacity-40' : ''}`}
            >
              <span className={`text-sm text-gray-800 ${r.removed ? 'line-through' : ''}`}>
                {nombreDe(ejes.map((_, i) => r.valores[i])) || '—'}
                {!r.id && <span className="ml-1.5 text-[10px] text-emerald-600 font-semibold">nueva</span>}
              </span>
              <Input
                type="number" min={0} step={1} placeholder="0"
                className="h-8 text-right"
                value={r.stock}
                disabled={r.removed}
                onChange={(e) => setRow(idx, { stock: e.target.value })}
              />
              <Input
                type="number" min={0} step={0.01} placeholder="base"
                className="h-8 text-right"
                value={r.precio}
                disabled={r.removed}
                onChange={(e) => setRow(idx, { precio: e.target.value })}
              />
              <button
                type="button"
                onClick={() => (r.id ? setRow(idx, { removed: !r.removed }) : setRows(prev => prev.filter((_, i) => i !== idx)))}
                className={`p-1 rounded ${r.removed ? 'text-gray-500 hover:bg-gray-100' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
                title={r.id ? (r.removed ? 'Restaurar' : 'Quitar variante') : 'Descartar'}
              >
                {r.removed ? <RotateCcw className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400">
          Precio vacío = usa el precio base (RD${basePrecioDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })}). El stock ajusta el almacén por defecto.
        </p>
      </div>

      {/* Agregar variante */}
      {ejesValidos.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
          {ejes.map((e, i) => (
            (e.nombre.trim() && e.valores.length > 0) ? (
              <div key={i} className="space-y-1">
                <Label className="text-[11px] text-gray-500">{e.nombre}</Label>
                <select
                  className="block border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                  value={nuevoSel[i] ?? ''}
                  onChange={(ev) => setNuevoSel(prev => { const n = [...prev]; n[i] = ev.target.value; return n; })}
                >
                  <option value="">—</option>
                  {e.valores.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            ) : null
          ))}
          <Button type="button" variant="outline" size="sm" disabled={!puedeAgregar} onClick={agregarVariante}>
            <Plus className="h-4 w-4 mr-1" /> Agregar variante
          </Button>
        </div>
      )}
    </div>
  );
}
