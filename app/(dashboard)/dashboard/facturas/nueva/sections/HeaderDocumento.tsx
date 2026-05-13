'use client';

import { useEffect } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Settings } from 'lucide-react';
import { CATEGORIAS_ECF } from '@/lib/ecf/categorias';
import type { EmpresaPerfil, SecuenciaInfo } from '../utils/types';

interface Props {
  empresa: EmpresaPerfil | null;
  categoriaId: string;
  setCategoriaId: (v: string) => void;
  tipoEcf: string;
  onChangeTipo: (t: string) => void;
  secuencia: SecuenciaInfo | null;
  onEditarNcf: () => void;
}

export function HeaderDocumento({
  empresa, categoriaId, setCategoriaId, tipoEcf, onChangeTipo,
  secuencia, onEditarNcf,
}: Props) {
  const categoriaActual = CATEGORIAS_ECF.find(c => c.id === categoriaId) ?? CATEGORIAS_ECF[0];
  const tiposCategoria  = categoriaActual.tipos;

  // Si tipoEcf actual no pertenece a la categoría activa, auto-seleccionar el primer tipo.
  // Esto cubre el edge case donde Radix Select no refleja el cambio sincronizado.
  useEffect(() => {
    if (!tiposCategoria.some(t => t.codigo === tipoEcf)) {
      onChangeTipo(tiposCategoria[0].codigo);
    }
  }, [categoriaId, tipoEcf, tiposCategoria, onChangeTipo]);

  return (
    <div className="px-4 pt-6 pb-5 md:px-8 md:pt-8 md:pb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-5 md:gap-6">
      {/* Logo + company name */}
      <div className="flex items-center gap-4">
        {empresa?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={empresa.logo}
            alt="Logo"
            className="h-[45px] max-w-[140px] object-contain shrink-0"
          />
        ) : (
          <a
            href="/dashboard/configuracion"
            className="w-[140px] h-[45px] border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-teal-400 transition-colors shrink-0"
            title="Subir logo en Configuración"
          >
            <span className="text-[10px] text-gray-600 text-center leading-tight px-1">
              Colocar mi logo<br />178 x 51 pixeles
            </span>
          </a>
        )}
        <div className="min-w-0">
          <p className="text-lg md:text-xl font-semibold text-gray-800 truncate">
            {empresa?.nombreComercial ?? empresa?.razonSocial ?? 'Tu empresa'}
          </p>
          {empresa?.rnc && (
            <p className="text-xs text-gray-600 mt-0.5">RNC: {empresa.rnc}</p>
          )}
        </div>
      </div>

      {/* Tipo eCF dropdown + NCF */}
      <div className="md:text-right md:shrink-0">
        <Select
          value={categoriaId}
          onValueChange={(catId) => {
            const cat = CATEGORIAS_ECF.find(c => c.id === catId) ?? CATEGORIAS_ECF[0];
            setCategoriaId(catId);
            onChangeTipo(cat.tipos[0].codigo);
          }}
        >
          <SelectTrigger className="w-auto md:ml-auto border-0 bg-transparent text-gray-600 hover:text-gray-600 text-xs h-7 pr-1 shadow-none focus:ring-0 md:justify-end gap-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {CATEGORIAS_ECF.map(cat => (
              <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tipoEcf} onValueChange={onChangeTipo}>
          <SelectTrigger className="w-auto md:ml-auto border-0 bg-transparent text-teal-700 font-medium text-sm h-8 pr-1 shadow-none focus:ring-0 md:justify-end gap-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {tiposCategoria.map(t => (
              <SelectItem key={t.codigo} value={t.codigo}>{t.etiqueta}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap items-center gap-2 md:justify-end mt-1">
          {!secuencia?.sinNcf && (
            <span className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">NCF</span>
          )}
          {secuencia === null ? (
            <span className="font-mono text-lg md:text-xl text-gray-300 animate-pulse">Cargando…</span>
          ) : secuencia.sinNcf ? (
            <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded px-2 py-0.5 font-medium">Numeración automática · Sin comprobante fiscal</span>
          ) : secuencia.encf ? (
            <span className="font-mono text-lg md:text-xl text-gray-800 font-bold break-all">{secuencia.encf}</span>
          ) : secuencia.sinSecuencia ? (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">Sin secuencias — configura en Secuencias NCF</span>
          ) : secuencia.agotada ? (
            <span className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">Secuencias agotadas</span>
          ) : secuencia.vencida ? (
            <span className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">Secuencias vencidas</span>
          ) : (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">Sin secuencias disponibles</span>
          )}
          {!secuencia?.sinNcf && (
            <button
              type="button"
              onClick={onEditarNcf}
              aria-label="Configurar secuencia NCF"
              className="text-gray-600 hover:text-gray-800 p-2 -m-2"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
        </div>
        {secuencia?.disponibles !== undefined && secuencia.disponibles < 50 && secuencia.disponibles > 0 && (
          <p className="text-xs text-amber-500 mt-0.5 md:text-right">{secuencia.disponibles} NCF restantes</p>
        )}
      </div>
    </div>
  );
}
