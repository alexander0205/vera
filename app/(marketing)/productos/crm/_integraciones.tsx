/**
 * El catálogo de integraciones de Zero CRM, por categoría.
 *
 * Sale de `lib/agentes/crm-integraciones.ts`, el mismo origen que la versión en
 * texto, `capacidades.json` y el MCP público. Sin logotipos a propósito: un
 * logotipo se lee como alianza, y aquí no la hay.
 */

import { CATALOGO_INTEGRACIONES } from '@/lib/agentes/crm-integraciones';
import { Contenedor } from '../../_piezas';
import { Antetitulo, Titulo } from '../../_bloques';
import { EtiquetaEstado } from './_subpagina';

export function CatalogoIntegraciones() {
  const total = CATALOGO_INTEGRACIONES.reduce((n, c) => n + c.sistemas.length, 0);
  return (
    <section aria-label="Catálogo de integraciones">
      <Contenedor className="pt-16 sm:pt-[82px]">
        <Antetitulo>Catálogo</Antetitulo>
        <Titulo className="mt-3.5">Con qué se puede conectar.</Titulo>
        <p className="m-0 mt-3.5 max-w-[720px] text-pretty text-[15px] leading-[1.6] text-[#5c6373]">
          {total} sistemas en {CATALOGO_INTEGRACIONES.length} categorías. Cada uno dice su estado. Los nombres son de sus dueños: nombrarlos no implica alianza ni certificación.
        </p>

        <div className="mt-8 flex flex-col gap-10">
          {CATALOGO_INTEGRACIONES.map(c => (
            <div key={c.clave} className="grid items-start gap-5 lg:grid-cols-[minmax(0,.72fr)_minmax(0,2fr)] lg:gap-12">
              <div className="min-w-0">
                <h3 className="m-0 font-[family-name:var(--font-display)] text-[18px] font-semibold tracking-[-.02em] text-[#102a72]">{c.titulo}</h3>
                <p className="m-0 mt-2 text-pretty text-[13px] leading-[1.55] text-[#5c6373]">{c.como}</p>
              </div>
              <ul className="m-0 grid min-w-0 list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2">
                {c.sistemas.map(s => (
                  <li key={s.nombre} className="flex min-w-0 flex-col rounded-[14px] border border-[#e7edfb] bg-white p-4">
                    <p className="m-0 text-pretty font-[family-name:var(--font-display)] text-[14px] font-semibold tracking-[-.015em] text-[#102a72]">{s.nombre}</p>
                    <p className="m-0 mt-1 text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">{s.detalle}</p>
                    <p className="m-0 mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <EtiquetaEstado estado={s.estado} />
                      {s.fuente && (
                        <a href={s.fuente} rel="noopener" className="text-[11.5px] font-medium text-zero-600 underline transition hover:text-[#102a72]">
                          Fuente oficial<span className="sr-only">: {s.nombre}</span>
                        </a>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Contenedor>
    </section>
  );
}
