'use client';

import type { EmpresaPerfil, Retencion } from '../utils/types';

interface Props {
  empresa: EmpresaPerfil | null;
  totales: { bruto: number; subtotal: number; descuento: number; itbis: number; total: number };
  retenciones: Retencion[];
  totalNeto: number;
}

export function TotalsBar({ empresa, totales, retenciones, totalNeto }: Props) {
  return (
    <div className="px-4 py-5 md:px-8 md:py-6 flex flex-col md:flex-row md:items-start md:justify-between gap-5 md:gap-6 border-b border-gray-100">
      {/* Firma */}
      {empresa?.firma ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={empresa.firma}
          alt="Firma autorizada"
          className="w-[178px] h-[51px] object-contain shrink-0"
        />
      ) : (
        <a
          href="/dashboard/configuracion"
          className="w-[178px] h-[51px] border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-teal-400 transition-colors shrink-0 group"
          title="Agregar firma en Configuración"
        >
          <span className="text-[10px] text-gray-600 group-hover:text-teal-500 text-center leading-tight px-2 transition-colors">
            Agregar firma<br />en Configuración
          </span>
        </a>
      )}

      <div className="w-full md:w-72 space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span>RD$ {totales.bruto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
        </div>
        {totales.descuento > 0 && (
          <div className="flex justify-between text-sm text-gray-500">
            <span>Descuento</span>
            <span>-RD$ {totales.descuento.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
          </div>
        )}
        {totales.itbis > 0 && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>ITBIS</span>
            <span>RD$ {totales.itbis.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
          </div>
        )}

        {retenciones.map((ret, idx) => (
          <div key={idx} className="flex justify-between text-sm text-red-500">
            <span>{ret.nombre} ({ret.porcentaje}%)</span>
            <span>-RD$ {ret.monto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
          </div>
        ))}

        <div className="flex justify-between text-xl font-bold text-gray-900 border-t border-gray-200 pt-3 mt-1">
          <span>Total</span>
          <span>RD$ {totalNeto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>
  );
}
