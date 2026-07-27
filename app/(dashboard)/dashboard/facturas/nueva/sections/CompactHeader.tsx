'use client';

import { useEffect } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Settings } from 'lucide-react';
import { CATEGORIAS_ECF } from '@/lib/ecf/categorias';
import { useTiposDisponibles } from '@/lib/hooks/useTiposDisponibles';
import type { EmpresaPerfil, SecuenciaInfo } from '../utils/types';
import { EmpresaBlock } from './EmpresaBlock';

interface Props {
  empresa: EmpresaPerfil | null;
  categoriaId: string;
  setCategoriaId: (v: string) => void;
  tipoEcf: string;
  onChangeTipo: (t: string) => void;
  /** Oculta el dropdown de categoría (pantalla con categoría fija por ruta). */
  ocultarCategoria?: boolean;
  /** Muestra el código del tipo (e34/e33). Se oculta si la nota no tendrá e-CF real. */
  mostrarCodigoTipo?: boolean;
  /** Fuerza "Sin comprobante fiscal" en el bloque NCF (nota sobre factura sin e-CF). */
  sinComprobante?: boolean;
  secuencia: SecuenciaInfo | null;
  fechaEmision: string;
  /** Permite elegir la fecha de emisión (permiso facturas:fecha-personalizada). */
  puedeEditarFecha?: boolean;
  /** Actualiza la fecha de emisión (YYYY-MM-DD). Requerido si puedeEditarFecha. */
  onChangeFecha?: (v: string) => void;
  onEditarNcf: () => void;
}

/**
 * Compact single-row header. Logo + razón social on the left; tipo selectors,
 * NCF, fecha and status badge on the right. Wraps to multi-line on small
 * screens. Replaces the previous full-width HeaderDocumento.
 */
export function CompactHeader({
  empresa, categoriaId, setCategoriaId, tipoEcf, onChangeTipo,
  ocultarCategoria, mostrarCodigoTipo = true, sinComprobante = false,
  secuencia, fechaEmision, puedeEditarFecha = false, onChangeFecha, onEditarNcf,
}: Props) {
  // "Sin comprobante" efectivo: la secuencia es sin-ncf, o es una nota sobre una
  // factura sin e-CF (nunca tendrá e-NCF real).
  const sinNcfEfectivo = sinComprobante || !!secuencia?.sinNcf;
  const { tipoVisible } = useTiposDisponibles();
  const categoriaActual = CATEGORIAS_ECF.find(c => c.id === categoriaId) ?? CATEGORIAS_ECF[0];
  // Filtrar por secuencias disponibles (e31/e32/sin-ncf siempre). Fallback a la
  // lista completa si el filtro deja vacío (evita dropdown sin opciones).
  const tiposVisibles  = categoriaActual.tipos.filter(t => tipoVisible(t.codigo));
  const tiposCategoria = tiposVisibles.length ? tiposVisibles : categoriaActual.tipos;

  // Auto-correct tipoEcf when category change desyncs.
  useEffect(() => {
    if (!tiposCategoria.some(t => t.codigo === tipoEcf)) {
      onChangeTipo(tiposCategoria[0].codigo);
    }
  }, [categoriaId, tipoEcf, tiposCategoria, onChangeTipo]);

  const fechaFmt = (() => {
    if (!fechaEmision) return '—';
    const [y, m, d] = fechaEmision.split('-');
    return `${d}/${m}/${y}`;
  })();

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 md:px-5 md:py-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {/* Logo + company */}
        <EmpresaBlock empresa={empresa} />

        {/* Tipos selector — categoría (oculta si fija por ruta) + subtipo. El
            subtipo solo se muestra cuando la categoría tiene más de un tipo;
            con un solo tipo (NC/ND/Compras) se rotula el documento fijo.
            id: ancla para resaltar cuando el método de pago obliga tipo fiscal. */}
        <div id="tipo-comprobante-anchor" className="flex items-center gap-1 min-w-0 rounded-lg transition-shadow">
          {!ocultarCategoria && (
            <Select
              value={categoriaId}
              onValueChange={(catId) => {
                // Radix emite '' cuando el item seleccionado se desmonta — ignorar.
                if (!catId) return;
                const cat = CATEGORIAS_ECF.find(c => c.id === catId) ?? CATEGORIAS_ECF[0];
                setCategoriaId(catId);
                onChangeTipo(cat.tipos[0].codigo);
              }}
            >
              <SelectTrigger className="border-0 bg-transparent text-gray-700 hover:text-gray-900 text-sm font-medium h-8 px-2 shadow-none focus:ring-0 gap-1 w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS_ECF.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {ocultarCategoria && (
            <span className="text-sm font-semibold text-gray-800 px-1">{categoriaActual.label}</span>
          )}
          {tiposCategoria.length > 1 ? (
            <Select value={tipoEcf} onValueChange={(v) => { if (v) onChangeTipo(v); }}>
              <SelectTrigger className="border-0 bg-transparent text-teal-700 font-medium text-xs h-7 px-2 shadow-none focus:ring-0 gap-1 w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tiposCategoria.map(t => (
                  <SelectItem key={t.codigo} value={t.codigo}>{t.etiqueta}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : mostrarCodigoTipo ? (
            <span className="text-teal-700 font-medium text-xs px-2">{tiposCategoria[0]?.etiqueta}</span>
          ) : null}
        </div>

        {/* NCF block */}
        <div className="flex items-center gap-2 min-w-0">
          {!sinNcfEfectivo && (
            <span className="text-[11px] uppercase font-medium text-gray-500 tracking-wide">NCF</span>
          )}
          {sinNcfEfectivo ? (
            <span className="text-[11px] text-gray-600 bg-gray-100 border border-gray-200 rounded px-2 py-0.5 font-medium">Sin comprobante fiscal</span>
          ) : secuencia === null ? (
            <span className="font-mono text-sm text-gray-300 animate-pulse">Cargando…</span>
          ) : secuencia.encf ? (
            <span className="font-mono text-sm font-bold text-gray-900 break-all">{secuencia.encf}</span>
          ) : secuencia.sinSecuencia ? (
            <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">Sin secuencias</span>
          ) : secuencia.agotada ? (
            <span className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">Agotadas</span>
          ) : secuencia.vencida ? (
            <span className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">Vencidas</span>
          ) : (
            <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">Sin disponibles</span>
          )}
          {!sinNcfEfectivo && (
            <button
              type="button"
              onClick={onEditarNcf}
              aria-label="Configurar secuencia NCF"
              className="text-gray-400 hover:text-gray-700 p-1 -m-1"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Fecha — editable solo para roles con permiso y en sin-ncf (la fecha
            de un e-CF fiscal la fija la DGII, no el usuario). */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-gray-500">Fecha:</span>
          {puedeEditarFecha && sinNcfEfectivo ? (
            <input
              type="date"
              value={fechaEmision}
              onChange={(e) => onChangeFecha?.(e.target.value)}
              aria-label="Fecha de emisión"
              className="font-medium text-gray-900 border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
            />
          ) : (
            <span className="font-medium text-gray-900">{fechaFmt}</span>
          )}
        </div>

        {/* Estado */}
        <div className="ml-auto flex items-center gap-1.5 text-xs">
          <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
          <span className="font-medium text-gray-700">Sin emitir</span>
        </div>
      </div>

      {secuencia?.disponibles !== undefined && secuencia.disponibles < 50 && secuencia.disponibles > 0 && (
        <p className="text-[11px] text-amber-600 mt-2">{secuencia.disponibles} NCF restantes</p>
      )}
    </div>
  );
}
