'use client';

import Link from 'next/link';
import type { EmpresaPerfil } from '../utils/types';

interface Props {
  empresa: EmpresaPerfil | null;
  /** Opcional: link "Cambiar empresa" debajo del nombre/RNC. */
  showCambiarEmpresa?: boolean;
  /** Tamaño del logo: 'sm' (h-10) o 'md' (h-12). */
  logoSize?: 'sm' | 'md';
}

/**
 * Bloque reutilizable: logo (o placeholder dashed) + nombre comercial + RNC.
 * Compartido entre CompactHeader (facturas) y empresa card (facturas recurrentes).
 */
export function EmpresaBlock({ empresa, showCambiarEmpresa = false, logoSize = 'sm' }: Props) {
  const sizeCls = logoSize === 'md' ? 'h-12 max-w-[120px]' : 'h-10 max-w-[100px]';
  const placeholderH = logoSize === 'md' ? 'h-12' : 'h-10';

  return (
    <div className="flex items-center gap-3 min-w-0">
      {empresa?.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={empresa.logo}
          alt="Logo"
          className={`${sizeCls} object-contain shrink-0`}
        />
      ) : (
        <Link
          href="/dashboard/configuracion"
          className={`w-[80px] ${placeholderH} border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center hover:border-teal-400 transition-colors shrink-0`}
          title="Subir logo en Configuración"
        >
          <span className="text-[9px] text-gray-500 text-center leading-tight px-1">Logo</span>
        </Link>
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 leading-tight truncate">
          {empresa?.nombreComercial ?? empresa?.razonSocial ?? 'Tu empresa'}
        </p>
        {empresa?.rnc && (
          <p className="text-[11px] text-gray-500 leading-tight mt-0.5">RNC: {empresa.rnc}</p>
        )}
        {showCambiarEmpresa && (
          <Link
            href="/dashboard/configuracion"
            className="text-[11px] text-teal-700 hover:text-teal-800 hover:underline leading-tight mt-1 inline-block"
          >
            Cambiar empresa
          </Link>
        )}
      </div>
    </div>
  );
}
