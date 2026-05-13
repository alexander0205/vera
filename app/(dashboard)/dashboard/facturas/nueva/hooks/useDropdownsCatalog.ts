'use client';

import { useEffect, useState } from 'react';

export interface AlmacenItem    { id: number; nombre: string }
export interface ListaPrecioItem { id: number; nombre: string; tipo: string; porcentaje: number }
export interface VendedorItem    { id: number; nombre: string }

/**
 * Carga los catálogos de almacenes, listas de precios y vendedores al montar.
 */
export function useDropdownsCatalog() {
  const [almacenes, setAlmacenes]         = useState<AlmacenItem[]>([]);
  const [listasPrecios, setListasPrecios] = useState<ListaPrecioItem[]>([]);
  const [vendedores, setVendedores]       = useState<VendedorItem[]>([]);

  useEffect(() => {
    fetch('/api/almacenes').then(r => r.json()).then(d => setAlmacenes(d.almacenes ?? [])).catch(() => {});
    fetch('/api/listas-precios').then(r => r.json()).then(d => setListasPrecios(d.listasPrecios ?? [])).catch(() => {});
    fetch('/api/vendedores').then(r => r.json()).then(d => setVendedores(d.vendedores ?? [])).catch(() => {});
  }, []);

  return {
    almacenes, setAlmacenes,
    listasPrecios, setListasPrecios,
    vendedores, setVendedores,
  };
}
