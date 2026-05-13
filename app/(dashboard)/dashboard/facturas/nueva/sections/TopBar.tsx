'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, ChevronDown, Settings } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type {
  AlmacenItem, ListaPrecioItem, VendedorItem,
} from '../hooks/useDropdownsCatalog';

interface Props {
  showAlmacen: boolean;
  setShowAlmacen: (v: boolean) => void;
  showListaPrecios: boolean;
  setShowListaPrecios: (v: boolean) => void;
  showVendedor: boolean;
  setShowVendedor: (v: boolean) => void;
  toggleOpcion: (key: string, value: boolean) => void;
  almacenes: AlmacenItem[];
  listasPrecios: ListaPrecioItem[];
  vendedores: VendedorItem[];
  almacenId: number | null;
  setAlmacenId: (v: number | null) => void;
  setAlmacenNombre: (v: string) => void;
  listaPreciosId: number | null;
  setListaPreciosId: (v: number | null) => void;
  setListaPreciosNombre: (v: string) => void;
  vendedorId: number | null;
  setVendedorId: (v: number | null) => void;
  setVendedorNombre: (v: string) => void;
  onOpenNuevoAlmacen: () => void;
  onOpenNuevaLista: () => void;
  onOpenNuevoVendedor: () => void;
}

export function NavBar({
  showAlmacen, setShowAlmacen,
  showListaPrecios, setShowListaPrecios,
  showVendedor, setShowVendedor,
  toggleOpcion,
}: Pick<Props, 'showAlmacen' | 'setShowAlmacen' | 'showListaPrecios' | 'setShowListaPrecios' | 'showVendedor' | 'setShowVendedor' | 'toggleOpcion'>) {
  const personalizarRef = useRef<HTMLDivElement>(null);
  const [showPersonalizar, setShowPersonalizar] = useState(false);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (personalizarRef.current && !personalizarRef.current.contains(e.target as Node)) {
        setShowPersonalizar(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
      <Button variant="ghost" size="sm" asChild className="text-gray-600 hover:text-gray-900 px-2 sm:px-3">
        <Link href="/dashboard/facturas">
          <ArrowLeft className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Volver</span>
        </Link>
      </Button>
      <h1 className="text-base sm:text-lg font-semibold text-gray-700 flex-1 sm:flex-none truncate">Nueva factura</h1>

      <div className="relative ml-auto" ref={personalizarRef}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Personalizar opciones"
          className="flex items-center gap-2 text-sm"
          onClick={() => setShowPersonalizar(v => !v)}
        >
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">Personalizar opciones</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
        {showPersonalizar && (
          <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-52">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Opciones disponibles</p>
            {[
              { key: 'almacen',     label: 'Almacén',         state: showAlmacen,      setter: setShowAlmacen },
              { key: 'listaPrecios', label: 'Lista de Precio', state: showListaPrecios, setter: setShowListaPrecios },
              { key: 'vendedor',    label: 'Vendedor',         state: showVendedor,     setter: setShowVendedor },
            ].map(({ key, label, state, setter }) => (
              <label key={key} className="flex items-center justify-between py-2 cursor-pointer hover:bg-gray-50 rounded px-2 -mx-2">
                <span className="text-sm text-gray-700">{label}</span>
                <input
                  type="checkbox"
                  checked={state}
                  onChange={e => {
                    setter(e.target.checked);
                    toggleOpcion(key, e.target.checked);
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TopBar({
  showAlmacen, showListaPrecios, showVendedor,
  almacenes, listasPrecios, vendedores,
  almacenId, setAlmacenId, setAlmacenNombre,
  listaPreciosId, setListaPreciosId, setListaPreciosNombre,
  vendedorId, setVendedorId, setVendedorNombre,
  onOpenNuevoAlmacen, onOpenNuevaLista, onOpenNuevoVendedor,
}: Props) {
  if (!showAlmacen && !showListaPrecios && !showVendedor) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 md:px-6 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:items-center lg:gap-8 gap-3">
        {showAlmacen && (
          <div className="space-y-1 lg:min-w-[160px]">
            <Label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Almacén</Label>
            <Select
              value={almacenId?.toString() ?? ''}
              onValueChange={(v) => {
                if (v === '__nuevo') { onOpenNuevoAlmacen(); return; }
                const alm = almacenes.find(a => a.id.toString() === v);
                setAlmacenId(alm?.id ?? null);
                setAlmacenNombre(alm?.nombre ?? '');
              }}
            >
              <SelectTrigger className="h-10 md:h-9 text-sm">
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {almacenes.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.nombre}</SelectItem>)}
                <SelectItem value="__nuevo" className="text-teal-700 font-medium">+ Nuevo almacén</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {showListaPrecios && (
          <div className="space-y-1 lg:min-w-[160px]">
            <Label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Lista de precios</Label>
            <Select
              value={listaPreciosId?.toString() ?? '__none'}
              onValueChange={(v) => {
                if (v === '__nuevo') { onOpenNuevaLista(); return; }
                if (v === '__none') { setListaPreciosId(null); setListaPreciosNombre(''); return; }
                const lista = listasPrecios.find(l => l.id.toString() === v);
                setListaPreciosId(lista?.id ?? null);
                setListaPreciosNombre(lista?.nombre ?? '');
              }}
            >
              <SelectTrigger className="h-10 md:h-9 text-sm">
                <SelectValue placeholder="General" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">General</SelectItem>
                {listasPrecios.map(l => (
                  <SelectItem key={l.id} value={l.id.toString()}>
                    {l.nombre}{l.tipo === 'porcentaje' && l.porcentaje > 0 ? ` (${(l.porcentaje / 100).toFixed(2)}%)` : ''}
                  </SelectItem>
                ))}
                <SelectItem value="__nuevo" className="text-teal-700 font-medium">+ Nueva lista</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {showVendedor && (
          <div className="space-y-1 lg:min-w-[160px]">
            <Label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Vendedor</Label>
            <Select
              value={vendedorId?.toString() ?? ''}
              onValueChange={(v) => {
                if (v === '__nuevo') { onOpenNuevoVendedor(); return; }
                const ven = vendedores.find(v2 => v2.id.toString() === v);
                setVendedorId(ven?.id ?? null);
                setVendedorNombre(ven?.nombre ?? '');
              }}
            >
              <SelectTrigger className="h-10 md:h-9 text-sm">
                <SelectValue placeholder="Buscar..." />
              </SelectTrigger>
              <SelectContent>
                {vendedores.map(v => <SelectItem key={v.id} value={v.id.toString()}>{v.nombre}</SelectItem>)}
                <SelectItem value="__nuevo" className="text-teal-700 font-medium">+ Nuevo vendedor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
