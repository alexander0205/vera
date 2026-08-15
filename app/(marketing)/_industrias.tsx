'use client';

/**
 * «Una plataforma. Cada industria.» — comparativa por sector.
 *
 * Las columnas rivales son CATEGORÍAS y no marcas ("un programa contable", "un
 * POS suelto", "Excel"). Poner nombres propios en una tabla de sí/no obliga a
 * mantenerla al día con productos ajenos que cambian sin avisarnos, y el
 * primer dato viejo convierte toda la tabla en algo que no se puede creer.
 *
 * Lo que se afirma de Zero sí es literal: todas las marcas de la columna
 * propia corresponden a módulos que existen hoy.
 */

import { useState } from 'react';
import { Cheque } from './_piezas';

const RIVALES = ['Programa contable', 'POS suelto', 'Excel'] as const;

/** `true` = lo tiene; los tres valores son de la categoría rival, no de Zero. */
const TABLA: Record<string, [string, [boolean, boolean, boolean]][]> = {
  Colegios: [
    ['Facturación electrónica (e-CF)', [true, false, false]],
    ['Matrículas y cuotas por estudiante', [false, false, false]],
    ['Portal de padres', [false, false, false]],
    ['Recordatorios por WhatsApp', [false, false, false]],
    ['Punto de venta en cafetería', [false, true, false]],
    ['Contabilidad y reportes 606/607', [true, false, false]],
    ['Todo en un solo sistema', [false, false, false]],
  ],
  Comercios: [
    ['Facturación electrónica (e-CF)', [true, true, false]],
    ['Punto de venta con turnos', [false, true, false]],
    ['Inventario y almacenes', [true, true, false]],
    ['Compras y gastos', [true, false, false]],
    ['Multi-sucursal', [false, false, false]],
    ['Contabilidad y reportes 606/607', [true, false, false]],
    ['Todo en un solo sistema', [false, false, false]],
  ],
  Servicios: [
    ['Facturación electrónica (e-CF)', [true, true, false]],
    ['Facturas recurrentes', [true, true, false]],
    ['Cuentas por cobrar', [true, false, false]],
    ['Cotizaciones', [true, false, false]],
    ['Cuadre y cierre de caja', [false, true, false]],
    ['Contabilidad y reportes 606/607', [true, false, false]],
    ['Todo en un solo sistema', [false, false, false]],
  ],
};

const SECTORES = Object.keys(TABLA);

export function ComparativaIndustrias() {
  const [sector, setSector] = useState(SECTORES[0]);

  return (
    <div>
      <div className="flex border-b border-[#edeff5]">
        {SECTORES.map(s => {
          const on = s === sector;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSector(s)}
              aria-pressed={on}
              className={`-mb-px h-11 flex-1 cursor-pointer border-b-2 text-[13.5px] transition ${
                on ? 'border-zero-600 font-semibold text-zero-600' : 'border-transparent font-medium text-gray-500 hover:text-[#3b4252]'
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* La rejilla de 5 columnas no cabe en un móvil: en vez de apilarla —una
          comparativa apilada deja de comparar— se desplaza en horizontal
          dentro de su propia caja. */}
      <div className="overflow-x-auto rounded-b-2xl border border-t-0 border-[#e9ebf3]">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[1.6fr_repeat(4,1fr)] border-b border-[#edeff5] bg-[#fafbfe]">
            <div className="px-4 py-3 text-[11.5px] font-semibold text-gray-500">Funcionalidad</div>
            <div className="border-x border-[#dce4fb] bg-[#edf1fe] px-2 py-3 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marca/zero-horizontal-azul.svg" alt="Zero" width={300} height={62} className="mx-auto h-[15px] w-auto" />
            </div>
            {RIVALES.map(r => (
              <div key={r} className="px-2 py-3 text-center text-[11.5px] font-semibold leading-tight text-gray-500">
                {r}
              </div>
            ))}
          </div>

          {TABLA[sector].map(([nombre, otros], i) => (
            <div
              key={nombre}
              className={`grid grid-cols-[1.6fr_repeat(4,1fr)] border-b border-[#f2f4fa] last:border-b-0 ${
                i % 2 ? 'bg-[#fcfdff]' : 'bg-white'
              }`}
            >
              <div className="px-4 py-3 text-[12.5px] text-[#3b4252]">{nombre}</div>
              <div className="grid place-items-center border-x border-[#e2e9fc] bg-[#f5f8ff] px-2 py-3">
                <span className="grid size-[19px] place-items-center rounded-full bg-zero-600">
                  <Cheque tamano={11} color="#fff" grosor={3.6} />
                </span>
              </div>
              {otros.map((tiene, j) => (
                <div key={RIVALES[j]} className="grid place-items-center px-2 py-3 text-[15px] text-[#4a5164]">
                  {tiene ? '✓' : <span className="text-gray-500">—</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
