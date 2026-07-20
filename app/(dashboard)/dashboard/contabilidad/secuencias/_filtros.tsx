'use client';

/** Filtros del libro de secuencias. Navega client-side (no recarga el layout). */
import { useRouter, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { Search, X } from 'lucide-react';

const ESTADOS = [
  { value: '',                     label: 'Todos los estados' },
  { value: 'ACEPTADO',             label: 'Aceptado' },
  { value: 'ACEPTADO_CONDICIONAL', label: 'Aceptado condicional' },
  { value: 'EN_PROCESO',           label: 'En proceso' },
  { value: 'RECHAZADO',            label: 'Rechazado' },
  { value: 'ANULADO',              label: 'Anulado' },
  { value: 'BORRADOR',             label: 'Reservado (borrador)' },
];

export function LibroFiltros({
  tipos,
  valores,
}: {
  tipos: string[];
  valores: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function aplicar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const qs = new URLSearchParams();
    for (const k of ['tipo', 'estado', 'q', 'desde', 'hasta']) {
      const v = String(fd.get(k) ?? '').trim();
      if (v) qs.set(k, v);
    }
    if (fd.get('errores')) qs.set('errores', '1');
    startTransition(() => router.push(`${pathname}?${qs.toString()}`));
  }

  const hayFiltros = Object.entries(valores).some(([, v]) => v);

  return (
    <form onSubmit={aplicar} className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 flex-1 min-w-[220px]">
          <span className="text-xs font-medium text-gray-500">Buscar</span>
          <input name="q" defaultValue={valores.q} placeholder="e-NCF, cliente o RNC…"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">Tipo</span>
          <select name="tipo" defaultValue={valores.tipo}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-[110px]">
            <option value="">Todos</option>
            {tipos.map(t => <option key={t} value={t}>e{t}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">Estado</span>
          <select name="estado" defaultValue={valores.estado}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-[170px]">
            {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">Desde</span>
          <input type="date" name="desde" defaultValue={valores.desde}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">Hasta</span>
          <input type="date" name="hasta" defaultValue={valores.hasta}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none pb-2">
          <input type="checkbox" name="errores" defaultChecked={valores.errores === '1'}
            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
          Solo con problemas
        </label>

        <button type="submit" disabled={pending}
          className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Search className="w-4 h-4" /> {pending ? 'Filtrando…' : 'Filtrar'}
        </button>

        {hayFiltros && (
          <button type="button" onClick={() => startTransition(() => router.push(pathname))}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 px-2 py-2">
            <X className="w-4 h-4" /> Limpiar
          </button>
        )}
      </div>
    </form>
  );
}
