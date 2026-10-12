'use client';

/**
 * «¿Cuáles de estas frases dijiste este mes?» — y ahora se contesta.
 *
 * La sección hacía una pregunta que la página no dejaba responder: seis cajas
 * quietas y, al lado, «si son dos o más…». Aquí cada frase se marca; debajo
 * sale el módulo que la resuelve, con su enlace, y al pasar de una el
 * diagnóstico cambia. Quien marca tres ya se contó a sí mismo por qué necesita
 * esto, que es mejor que cualquier cosa que le digamos nosotros.
 *
 * Accesible por teclado: cada frase es un botón con `aria-pressed`, y el
 * enlace al módulo va FUERA del botón —un enlace dentro de un botón no se
 * puede activar ni leer bien—. El resumen se anuncia con `aria-live`.
 */

import Link from 'next/link';
import { useState } from 'react';
import { Cheque, Flecha } from './_piezas';
import { BotonPrueba } from './_llamados';

type Frase = { frase: string; modulo: string; resuelve: string; href: string };

const FRASES: Frase[] = [
  {
    frase: 'Tengo cuatro programas y ninguno habla con el otro.',
    modulo: 'Una sola base',
    resuelve: 'Facturación, inventario, caja, contabilidad y nómina escriben sobre los mismos datos.',
    href: '/productos/erp',
  },
  {
    frase: 'La nómina me la hace alguien afuera, en una hoja de cálculo.',
    modulo: 'Nómina',
    resuelve: 'TSS, AFP, SFS, ISR y regalía calculados, cada corrida con su asiento.',
    href: '/productos/nomina',
  },
  {
    frase: 'Vendo y después descubro que ese producto ya no estaba.',
    modulo: 'Inventario',
    resuelve: 'Cada venta descuenta del almacén y el sistema avisa al llegar al mínimo.',
    href: '/productos/erp#inventario',
  },
  {
    frase: 'Mando las facturas por correo, una por una.',
    modulo: 'Facturación e-CF',
    resuelve: 'Al emitir, el PDF le sale solo al cliente, a nombre de tu empresa.',
    href: '/productos/erp#facturacion',
  },
  {
    frase: 'No sé quién me debe sin ponerme a sumar.',
    modulo: 'Cuentas por cobrar',
    resuelve: 'Quién debe, cuánto y desde cuándo, con link de pago para cobrarle.',
    href: '/productos/erp#cobros',
  },
  {
    frase: 'El 606 y el 607 los armo a mano cada mes.',
    modulo: 'Contabilidad',
    resuelve: 'El 606, el 607 y el 608 salen de lo que ya registraste.',
    href: '/productos/contabilidad',
  },
];

function diagnostico(n: number): { titulo: string; detalle: string } {
  if (n === 0) return { titulo: 'Ninguna marcada todavía.', detalle: 'Si dos o más te suenan, aquí te decimos qué tienen en común.' };
  if (n === 1) return { titulo: 'Una.', detalle: 'Eso lo resuelve un módulo. Si hay otra que se te pasó, márcala también.' };
  return {
    titulo: `${n} de ${FRASES.length}. El problema no es la factura.`,
    detalle: 'Es que el dinero de tu negocio está repartido en pedazos que no se hablan. Eso es lo que Zero junta.',
  };
}

export function FrasesDelDueno() {
  const [marcadas, setMarcadas] = useState<ReadonlySet<number>>(new Set());

  function alternar(i: number) {
    setMarcadas(antes => {
      const nuevo = new Set(antes);
      if (nuevo.has(i)) nuevo.delete(i); else nuevo.add(i);
      return nuevo;
    });
  }

  const { titulo, detalle } = diagnostico(marcadas.size);

  return (
    <div className="min-w-0">
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {FRASES.map((f, i) => {
          const on = marcadas.has(i);
          return (
            <li
              key={f.frase}
              className={`flex min-w-0 flex-col rounded-2xl border bg-white transition-[border-color,box-shadow] duration-300 ${
                on ? 'border-zero-600 shadow-[0_18px_36px_-26px_rgba(54,88,225,.6)]' : 'border-[#e3e7f2] hover:border-zero-200'
              }`}
            >
              <button
                type="button"
                aria-pressed={on}
                onClick={() => alternar(i)}
                className="flex min-w-0 cursor-pointer items-start gap-3 rounded-2xl p-5 text-left"
              >
                <span
                  aria-hidden
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors duration-200 ${
                    on ? 'border-zero-600 bg-zero-600' : 'border-[#cfd6e8] bg-white'
                  }`}
                >
                  {on && <Cheque tamano={11} color="#ffffff" grosor={3.6} />}
                </span>
                <span className="min-w-0 text-pretty text-[15px] leading-[1.5] text-[#102a72]">«{f.frase}»</span>
              </button>

              {/* Lo que la resuelve. Se despliega con altura animada por
                  rejilla (0fr → 1fr), que no necesita medir nada. */}
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                  on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <p className="m-0 border-t border-[#eef1f8] px-5 pb-4 pt-3 text-pretty text-[13px] leading-[1.55] text-[#4a5164]">
                    <span className="font-semibold text-zero-600">{f.modulo}.</span> {f.resuelve}{' '}
                    <Link
                      href={f.href}
                      tabIndex={on ? 0 : -1}
                      className="inline-flex items-center gap-1 font-semibold text-zero-600 underline-offset-2 hover:underline"
                    >
                      Ver cómo
                      <Flecha tamano={11} />
                    </Link>
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div
        aria-live="polite"
        className={`mt-5 flex flex-col gap-4 rounded-2xl p-5 transition-colors duration-300 sm:flex-row sm:items-center sm:justify-between sm:p-6 ${
          marcadas.size >= 2 ? 'sobre-oscuro bg-[#0b1a46] text-white' : 'bg-[#f5f8ff] text-[#102a72]'
        }`}
      >
        <div className="min-w-0">
          <p className="m-0 font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-[-.025em]">{titulo}</p>
          <p className={`m-0 mt-1 text-pretty text-[13.5px] leading-[1.55] ${marcadas.size >= 2 ? 'text-white/75' : 'text-[#4a5164]'}`}>
            {detalle}
          </p>
        </div>
        {marcadas.size >= 2 && (
          <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3">
            <BotonPrueba tono="claro" tamano="mediano" />
            <a
              href="#recorrido"
              className="inline-flex items-center gap-2 text-[14px] font-semibold text-white/85 underline-offset-4 transition hover:text-white hover:underline"
            >
              Ver cómo se conectan
              <Flecha tamano={13} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
