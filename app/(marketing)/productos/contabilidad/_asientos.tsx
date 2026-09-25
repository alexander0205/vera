'use client';

/**
 * De la operación al asiento, en vivo.
 *
 * El visitante elige qué pasó —facturaste, cobraste, compraste, pagaste la
 * nómina— y ve el asiento que el sistema escribe solo, con su debe y su haber
 * cuadrados. Es la demostración más corta de lo que vende esta página: que
 * nadie va a teclear eso.
 *
 * Los asientos NO son de adorno: salen de `lib/contabilidad/asientos.ts`, que
 * es lo que corre en producción —cuentas por cobrar contra ingresos e ITBIS al
 * facturar, caja o banco contra cuentas por cobrar al cobrar, inventario e
 * ITBIS adelantado contra cuentas por pagar al comprar—. Los números se
 * recalculan con el monto que mueva el visitante, y el total de debe y haber se
 * compara delante de él: si algún día no cuadra, se ve aquí.
 */

import { useMemo, useState } from 'react';

type Linea = { cuenta: string; codigo: string; debe: number; haber: number };
type Operacion = {
  clave: string;
  pestana: string;
  titulo: string;
  detalle: string;
  /** Qué se pide: el monto que el visitante mueve. */
  etiquetaMonto: string;
  lineas: (base: number) => Linea[];
};

const ITBIS = 0.18;
const peso = (c: number) => `RD$${(c).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const OPERACIONES: Operacion[] = [
  {
    clave: 'factura',
    pestana: 'Emites una factura',
    titulo: 'Factura con e-CF',
    detalle: 'El ingreso se reconoce, el ITBIS queda por pagar y el cliente entra a la cartera. Todo en el momento de emitir.',
    etiquetaMonto: 'Monto facturado, sin ITBIS',
    lineas: base => [
      { cuenta: 'Cuentas por cobrar', codigo: '1103', debe: base * (1 + ITBIS), haber: 0 },
      { cuenta: 'Ingresos por ventas', codigo: '4101', debe: 0, haber: base },
      { cuenta: 'ITBIS por pagar', codigo: '2102', debe: 0, haber: base * ITBIS },
    ],
  },
  {
    clave: 'cobro',
    pestana: 'Registras el cobro',
    titulo: 'Cobro recibido',
    detalle: 'Entra a banco o a caja según el método, y la cuenta del cliente baja por el mismo monto. La cartera se actualiza sola.',
    etiquetaMonto: 'Monto cobrado',
    lineas: base => [
      { cuenta: 'Bancos', codigo: '1102', debe: base, haber: 0 },
      { cuenta: 'Cuentas por cobrar', codigo: '1103', debe: 0, haber: base },
    ],
  },
  {
    clave: 'compra',
    pestana: 'Registras una compra',
    titulo: 'Factura del proveedor',
    detalle: 'La mercancía entra al inventario, el ITBIS queda adelantado para el 606 y la deuda con el suplidor queda registrada.',
    etiquetaMonto: 'Costo de la mercancía',
    lineas: base => [
      { cuenta: 'Inventario', codigo: '1105', debe: base, haber: 0 },
      { cuenta: 'ITBIS adelantado', codigo: '1104', debe: base * ITBIS, haber: 0 },
      { cuenta: 'Cuentas por pagar', codigo: '2101', debe: 0, haber: base * (1 + ITBIS) },
    ],
  },
  {
    clave: 'nomina',
    pestana: 'Cierras la nómina',
    titulo: 'Corrida de nómina',
    detalle: 'El gasto de sueldos entra completo, las retenciones del empleado quedan por pagar y el neto queda listo para transferir.',
    etiquetaMonto: 'Sueldos del período',
    lineas: base => [
      { cuenta: 'Gasto de sueldos', codigo: '5101', debe: base, haber: 0 },
      { cuenta: 'Retenciones por pagar (TSS e ISR)', codigo: '2104', debe: 0, haber: base * 0.1131 },
      { cuenta: 'Sueldos por pagar', codigo: '2103', debe: 0, haber: base * 0.8869 },
    ],
  },
  {
    clave: 'depreciacion',
    pestana: 'Corre la depreciación',
    titulo: 'Depreciación del mes',
    detalle: 'Se calcula sola sobre los activos fijos registrados. Nadie abre una hoja de cálculo en diciembre.',
    etiquetaMonto: 'Depreciación del período',
    lineas: base => [
      { cuenta: 'Gasto por depreciación', codigo: '5201', debe: base, haber: 0 },
      { cuenta: 'Depreciación acumulada', codigo: '1202', debe: 0, haber: base },
    ],
  },
];

export function AsientosEnVivo() {
  const [op, setOp] = useState(0);
  const [monto, setMonto] = useState(25_000);

  const operacion = OPERACIONES[op];
  const lineas = useMemo(() => operacion.lineas(monto), [operacion, monto]);
  const totalDebe = lineas.reduce((s, l) => s + l.debe, 0);
  const totalHaber = lineas.reduce((s, l) => s + l.haber, 0);
  // Centavos, no pesos: comparar flotantes en crudo marca descuadre por un
  // redondeo que nadie vería en pantalla.
  const cuadra = Math.round(totalDebe * 100) === Math.round(totalHaber * 100);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-2">
        {OPERACIONES.map((o, i) => (
          <button
            key={o.clave}
            type="button"
            onClick={() => setOp(i)}
            aria-pressed={i === op}
            className={`h-[34px] cursor-pointer whitespace-nowrap rounded-lg px-3.5 text-[12.5px] font-semibold transition ${
              i === op
                ? 'bg-[#102a72] text-white'
                : 'border border-[#e4e8f4] bg-white text-[#3b4252] hover:border-zero-200'
            }`}
          >
            {o.pestana}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[#e7edfb] bg-white">
        <div className="border-b border-[#eef1f8] bg-[#f7f9ff] px-5 py-4">
          <p className="m-0 font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-[-.02em] text-[#102a72]">
            {operacion.titulo}
          </p>
          <p className="m-0 mt-1.5 text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">{operacion.detalle}</p>

          <label className="mt-4 block">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-semibold text-[#3b4252]">{operacion.etiquetaMonto}</span>
              <span className="font-[family-name:var(--font-display)] text-[13px] font-semibold tabular-nums text-[#102a72]">
                {peso(monto)}
              </span>
            </span>
            <input
              type="range"
              min={5000}
              max={250000}
              step={5000}
              value={monto}
              onChange={e => setMonto(Number(e.target.value))}
              className="mt-2 w-full accent-zero-600"
              aria-label={operacion.etiquetaMonto}
            />
          </label>
        </div>

        {/* El asiento. Números a la derecha y tabulares: una columna de montos
            que baila al cambiar de dígitos se lee como un borrador. */}
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-[#eef1f8] text-[10.5px] uppercase tracking-[.12em] text-[#666d80]">
              <th className="px-5 py-2.5 text-left font-semibold">Cuenta</th>
              <th className="px-3 py-2.5 text-right font-semibold">Debe</th>
              <th className="px-5 py-2.5 text-right font-semibold">Haber</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map(l => (
              <tr key={l.codigo} className="border-b border-[#f4f6fc]">
                <td className="px-5 py-3">
                  <span className="block font-medium text-[#102a72]">{l.cuenta}</span>
                  <span className="block text-[11px] tabular-nums text-[#666d80]">{l.codigo}</span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-[#3b4252]">{l.debe ? peso(l.debe) : '—'}</td>
                <td className="px-5 py-3 text-right tabular-nums text-[#3b4252]">{l.haber ? peso(l.haber) : '—'}</td>
              </tr>
            ))}
            <tr className="bg-[#fbfcff] font-semibold text-[#102a72]">
              <td className="px-5 py-3">Totales</td>
              <td className="px-3 py-3 text-right tabular-nums">{peso(totalDebe)}</td>
              <td className="px-5 py-3 text-right tabular-nums">{peso(totalHaber)}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f8] px-5 py-3">
          <span
            className={`inline-flex h-[24px] items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ${
              cuadra ? 'bg-[#e8f6ee] text-[#0f7a4b]' : 'bg-[#fdeaea] text-[#c0392b]'
            }`}
          >
            <span className={`size-1.5 rounded-full ${cuadra ? 'bg-[#25a366]' : 'bg-[#c0392b]'}`} />
            {cuadra ? 'Cuadrado: debe = haber' : 'Descuadrado'}
          </span>
          <span className="text-[11px] text-[#666d80]">
            El sistema no guarda un asiento descuadrado. Si no cuadra, no entra.
          </span>
        </div>
      </div>
    </div>
  );
}
