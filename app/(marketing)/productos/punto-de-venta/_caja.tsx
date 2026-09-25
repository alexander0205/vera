'use client';

/**
 * Una caja de mentira que se usa de verdad.
 *
 * Toca productos, ve el carrito crecer con su ITBIS y cobra. Al cobrar no sale
 * un «gracias»: sale lo que el sistema hace de verdad en ese mismo acto —emite
 * el comprobante fiscal, descuenta el inventario, asienta la venta y, si fue a
 * crédito, la manda a la cartera—. Eso es lo que separa a esta caja de una
 * calculadora con tickets.
 *
 * Los cuatro pasos aparecen con retraso a propósito: en el mostrador ocurren en
 * un segundo, pero contados de golpe no se leen.
 */

import { useEffect, useRef, useState } from 'react';

type Articulo = { nombre: string; precio: number; sigla: string; tono: string };

const CATALOGO: Articulo[] = [
  { nombre: 'Desayuno grande', precio: 100, sigla: 'DG', tono: 'bg-[#eef6ee] text-[#2f7a4a]' },
  { nombre: 'Jugo natural', precio: 40, sigla: 'JN', tono: 'bg-[#fdf3e7] text-[#a5651a]' },
  { nombre: 'Galleta', precio: 25, sigla: 'GA', tono: 'bg-[#eef1fe] text-[#2a48c4]' },
  { nombre: 'Agua', precio: 20, sigla: 'AG', tono: 'bg-[#eaf4fb] text-[#1d6f9e]' },
  { nombre: 'Sándwich', precio: 150, sigla: 'SA', tono: 'bg-[#fdeef1] text-[#a62c48]' },
  { nombre: 'Café', precio: 60, sigla: 'CA', tono: 'bg-[#f3efe9] text-[#6b533a]' },
];

const ITBIS = 0.18;
const peso = (n: number) => `RD$${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Lo que pasa al cobrar. Uno por uno, con su respiro. */
const AL_COBRAR = [
  'Comprobante fiscal emitido y aceptado por la DGII',
  'Inventario descontado, artículo por artículo',
  'Asiento contable de la venta, en el diario',
  'Ticket impreso o enviado por WhatsApp',
] as const;

export function CajaDemo() {
  const [carrito, setCarrito] = useState<Record<string, number>>({});
  const [cobrado, setCobrado] = useState(false);
  const [pasos, setPasos] = useState(0);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lineas = Object.entries(carrito);
  const subtotal = lineas.reduce((s, [nombre, cant]) => {
    const a = CATALOGO.find(x => x.nombre === nombre)!;
    return s + a.precio * cant;
  }, 0);
  const itbis = subtotal * ITBIS;

  useEffect(() => {
    if (!cobrado || pasos >= AL_COBRAR.length) return;
    reloj.current = setTimeout(() => setPasos(p => p + 1), 700);
    return () => { if (reloj.current) clearTimeout(reloj.current); };
  }, [cobrado, pasos]);

  function agregar(a: Articulo) {
    if (cobrado) return;
    setCarrito(c => ({ ...c, [a.nombre]: (c[a.nombre] ?? 0) + 1 }));
  }

  function limpiar() {
    if (reloj.current) clearTimeout(reloj.current);
    setCarrito({});
    setCobrado(false);
    setPasos(0);
  }

  return (
    <div className="grid min-w-0 gap-3.5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      {/* ── El catálogo ────────────────────────────────────────────────── */}
      <div className="min-w-0 rounded-2xl border border-[#e7edfb] bg-white p-4">
        <p className="m-0 mb-3 text-[10.5px] font-semibold uppercase tracking-[.16em] text-[#666d80]">
          Toca para vender
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {CATALOGO.map(a => (
            <button
              key={a.nombre}
              type="button"
              onClick={() => agregar(a)}
              disabled={cobrado}
              className="flex min-w-0 cursor-pointer flex-col gap-2 rounded-xl border border-[#e7edfb] p-3 text-left transition hover:-translate-y-0.5 hover:border-zero-200 disabled:cursor-default disabled:opacity-50"
            >
              <span className={`grid h-[52px] place-items-center rounded-lg font-[family-name:var(--font-display)] text-[17px] font-semibold ${a.tono}`}>
                {a.sigla}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold text-[#102a72]">{a.nombre}</span>
                <span className="block text-[11.5px] tabular-nums text-[#5c6373]">{peso(a.precio)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── El carrito ─────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col rounded-2xl border border-[#e7edfb] bg-[#fbfcff] p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-[10.5px] font-semibold uppercase tracking-[.16em] text-[#666d80]">
            Venta en curso
          </p>
          {(lineas.length > 0 || cobrado) && (
            <button type="button" onClick={limpiar} className="cursor-pointer text-[11px] font-semibold text-zero-600">
              Empezar otra
            </button>
          )}
        </div>

        {lineas.length === 0 && !cobrado && (
          <p className="m-0 mt-6 text-pretty text-center text-[12.5px] leading-[1.5] text-[#a8aebd]">
            Toca un producto para agregarlo.
          </p>
        )}

        {lineas.length > 0 && (
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {lineas.map(([nombre, cant]) => {
              const a = CATALOGO.find(x => x.nombre === nombre)!;
              return (
                <li key={nombre} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                  <span className="min-w-0 truncate text-[#3b4252]">
                    <span className="tabular-nums text-[#666d80]">{cant}×</span> {nombre}
                  </span>
                  <span className="shrink-0 tabular-nums text-[#102a72]">{peso(a.precio * cant)}</span>
                </li>
              );
            })}
          </ul>
        )}

        {lineas.length > 0 && (
          <div className="mt-auto pt-4">
            <div className="flex items-baseline justify-between gap-2 text-[12px] text-[#5c6373]">
              <span>Subtotal</span><span className="tabular-nums">{peso(subtotal)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2 text-[12px] text-[#5c6373]">
              <span>ITBIS 18 %</span><span className="tabular-nums">{peso(itbis)}</span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between gap-2 border-t border-[#e7edfb] pt-2.5">
              <span className="text-[12.5px] font-semibold text-[#102a72]">Total</span>
              <span className="font-[family-name:var(--font-display)] text-[20px] font-semibold tabular-nums tracking-[-.03em] text-[#102a72]">
                {peso(subtotal + itbis)}
              </span>
            </div>

            {!cobrado ? (
              <button
                type="button"
                onClick={() => setCobrado(true)}
                className="mt-3.5 flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-zero-600 text-[13.5px] font-semibold text-white transition hover:bg-zero-700"
              >
                Cobrar {peso(subtotal + itbis)}
              </button>
            ) : (
              /* Lo que pasó al cobrar. Es el argumento entero de la página. */
              <ul className="m-0 mt-3.5 flex list-none flex-col gap-2 p-0">
                {AL_COBRAR.slice(0, pasos).map(paso => (
                  <li key={paso} className="flex items-start gap-2 text-[11.5px] leading-[1.45] text-[#1f8a56]">
                    <span aria-hidden>✓</span>
                    <span className="min-w-0 text-[#3b4252]">{paso}</span>
                  </li>
                ))}
                {pasos < AL_COBRAR.length && (
                  <li className="text-[11.5px] text-[#a8aebd]">procesando…</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
