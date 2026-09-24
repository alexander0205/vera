'use client';

/**
 * El recorrido de una venta, paso por paso y tocable.
 *
 * La portada lo cuenta en seis tarjetas quietas; aquí se camina. Cada paso dice
 * QUÉ hace el usuario y qué escribe el sistema por su cuenta —el e-CF, el
 * movimiento de inventario, el asiento—, que es la diferencia entre un
 * facturador y esto.
 *
 * Avanza solo hasta que alguien toca un paso; desde ahí manda el visitante.
 * Con «menos movimiento» se queda quieto en el primero y se navega a mano.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

type Paso = {
  clave: string;
  rotulo: string;
  titulo: string;
  detalle: string;
  /** Lo que el sistema escribe solo en ese momento. */
  solo: readonly string[];
};

const PASOS: Paso[] = [
  {
    clave: 'cotizacion',
    rotulo: 'Cotizas',
    titulo: 'La cotización sale por correo',
    detalle: 'Se arma con tus productos y sus precios, con el descuento que apliques, y se manda desde el sistema.',
    solo: ['Queda guardada con su número', 'Se convierte en factura sin volver a escribirla'],
  },
  {
    clave: 'factura',
    rotulo: 'Facturas',
    titulo: 'El comprobante se emite ante la DGII',
    detalle: 'Firmado y enviado en el acto, con su e-NCF tomado de tu secuencia autorizada.',
    solo: [
      'e-CF firmado, enviado y acusado por la DGII',
      'El PDF sale al cliente por correo, con su XML',
      'El inventario baja por cada línea vendida',
    ],
  },
  {
    clave: 'cartera',
    rotulo: 'Esperas',
    titulo: 'La factura entra a la cartera',
    detalle: 'Con su fecha límite. Desde ahí sabes quién te debe, cuánto y desde cuándo, sin sumar nada a mano.',
    solo: ['Cuentas por cobrar actualizadas', 'Los días vencidos se cuentan solos'],
  },
  {
    clave: 'cobro',
    rotulo: 'Cobras',
    titulo: 'El cliente paga',
    detalle: 'Por transferencia, en caja o con el link de pago que le mandaste. El comprobante del depósito se adjunta ahí mismo.',
    solo: [
      'El cobro entra con su método y su banco',
      'La cartera baja por el monto cobrado',
      'Si fue link de pago, se concilia solo',
    ],
  },
  {
    clave: 'asiento',
    rotulo: 'Se asienta',
    titulo: 'La contabilidad ya está hecha',
    detalle: 'La venta y el cobro dejan su asiento cuadrado en el diario, con la cuenta que configuraste.',
    solo: ['Asiento de la venta y del cobro', 'Cuadre validado antes de guardar', 'El 607 se arma con esto'],
  },
  {
    clave: 'reportes',
    rotulo: 'Declaras',
    titulo: 'Los 606, 607 y 608 salen armados',
    detalle: 'Con lo que ya registraste durante el mes. No hay que volver a capturar nada para declarar.',
    solo: ['Formato de la DGII, listo para subir', 'Cuadra con tus libros porque sale de ellos'],
  },
];

const PASO_MS = 3200;

export function RecorridoDelDinero() {
  const [activo, setActivo] = useState(0);
  const [automatico, setAutomatico] = useState(true);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);

  const sinMovimiento = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    if (!automatico || sinMovimiento) return;
    reloj.current = setInterval(() => setActivo(a => (a + 1) % PASOS.length), PASO_MS);
    return () => { if (reloj.current) clearInterval(reloj.current); };
  }, [automatico, sinMovimiento]);

  const paso = PASOS[activo];

  return (
    <div className="min-w-0">
      {/* La línea del recorrido. En móvil se convierte en una fila que rueda. */}
      <ol className="m-0 flex list-none gap-1.5 overflow-x-auto p-0 pb-1">
        {PASOS.map((p, i) => {
          const on = i === activo;
          return (
            <li key={p.clave} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => { setAutomatico(false); setActivo(i); }}
                aria-current={on ? 'step' : undefined}
                className="w-full cursor-pointer text-left"
              >
                <span
                  className={`block h-1 rounded-full transition-all duration-500 ${
                    i <= activo ? 'bg-zero-600' : 'bg-[#e4e8f4]'
                  }`}
                />
                <span className={`mt-2 block whitespace-nowrap text-[11px] font-semibold uppercase tracking-[.12em] transition ${
                  on ? 'text-zero-600' : 'text-[#a8aebd]'
                }`}
                >
                  {i + 1}. {p.rotulo}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 grid gap-5 rounded-2xl border border-[#e7edfb] bg-white p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,.9fr)]">
        <div className="min-w-0">
          <p className="m-0 font-[family-name:var(--font-display)] text-[clamp(1.15rem,2.4vw,1.45rem)] font-semibold leading-[1.2] tracking-[-.03em] text-balance text-[#102a72]">
            {paso.titulo}
          </p>
          <p className="m-0 mt-3 text-pretty text-[13.5px] leading-[1.6] text-[#5c6373]">{paso.detalle}</p>
        </div>

        <div className="min-w-0 rounded-xl bg-[#f7f9ff] p-4">
          <p className="m-0 text-[10.5px] font-semibold uppercase tracking-[.16em] text-zero-600">
            Lo que hace el sistema solo
          </p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {paso.solo.map(s => (
              <li key={s} className="flex min-w-0 items-start gap-2 text-[12.5px] leading-[1.5] text-[#3b4252]">
                <span aria-hidden className="mt-[3px] text-zero-600">✓</span>
                <span className="min-w-0">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
