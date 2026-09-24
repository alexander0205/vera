'use client';

/**
 * El ciclo de cobro de una mensualidad, con dos finales.
 *
 * Un colegio no pierde el dinero de golpe: lo pierde en cuotas que nadie
 * reclamó y en moras que nunca se aplicaron. Contarlo no basta —todo el mundo
 * dice «cobranza automática»—, así que aquí se camina el mes: qué pasa si la
 * familia paga a tiempo y qué pasa si se atrasa, con lo que el sistema hace
 * solo en cada fecha.
 *
 * El visitante elige el final. El que vive con moras sin cobrar entra por el
 * segundo y ahí se ve el dinero que hoy se queda en la calle.
 */

import { useState } from 'react';

type Hito = {
  cuando: string;
  titulo: string;
  detalle: string;
  tono?: 'normal' | 'alerta' | 'bueno';
};

const AL_DIA: Hito[] = [
  { cuando: 'Día 1', titulo: 'La mensualidad se emite sola', detalle: 'Se factura con su comprobante fiscal y el padre recibe el enlace de pago por WhatsApp y correo.' },
  { cuando: 'Día 25', titulo: 'Aviso antes de vencer', detalle: 'Sale solo, con el monto y la fecha. Nadie del colegio tuvo que acordarse.' },
  { cuando: 'Día 28', titulo: 'El padre paga desde el teléfono', detalle: 'Con tarjeta por el enlace, o subiendo el comprobante de su transferencia.', tono: 'bueno' },
  { cuando: 'El mismo día', titulo: 'Entra al sistema', detalle: 'El pago se registra, el saldo del estudiante baja y la contabilidad queda asentada.', tono: 'bueno' },
];

const SE_ATRASA: Hito[] = [
  { cuando: 'Día 1', titulo: 'La mensualidad se emite sola', detalle: 'Igual que siempre: facturada, con su enlace de pago enviado.' },
  { cuando: 'Día 25', titulo: 'Aviso antes de vencer', detalle: 'El primero de los tres, con el saldo pendiente.' },
  { cuando: 'Día 30', titulo: 'Vence y nadie pagó', detalle: 'El estudiante pasa a la lista de morosos, con sus días de atraso contados.', tono: 'alerta' },
  { cuando: 'Día 35', titulo: 'La mora se aplica sola', detalle: 'El recargo que configuró el colegio entra al cargo. No depende de que alguien se acuerde de aplicarlo.', tono: 'alerta' },
  { cuando: 'Día 36', titulo: 'Aviso con el recargo incluido', detalle: 'El padre recibe el nuevo monto y su enlace, por WhatsApp, SMS o correo.' },
  { cuando: 'Cuando paga', titulo: 'Se cobra completo', detalle: 'Mensualidad y mora, con su recibo. El colegio dejó de regalar ese dinero.', tono: 'bueno' },
];

const TONOS = {
  normal: { punto: 'bg-[#c7d0e6]', texto: 'text-[#102a72]' },
  alerta: { punto: 'bg-[#e0a23a]', texto: 'text-[#8a5a12]' },
  bueno: { punto: 'bg-[#25a366]', texto: 'text-[#1f6f4a]' },
} as const;

export function CicloDeCobro() {
  const [atrasa, setAtrasa] = useState(false);
  const hitos = atrasa ? SE_ATRASA : AL_DIA;

  return (
    <div className="min-w-0">
      <div className="inline-flex rounded-xl bg-[#eef1f8] p-1">
        {[
          { txt: 'La familia paga a tiempo', on: !atrasa, ir: () => setAtrasa(false) },
          { txt: 'La familia se atrasa', on: atrasa, ir: () => setAtrasa(true) },
        ].map(b => (
          <button
            key={b.txt}
            type="button"
            onClick={b.ir}
            aria-pressed={b.on}
            className={`h-[34px] cursor-pointer whitespace-nowrap rounded-lg px-3.5 text-[12.5px] font-semibold transition ${
              b.on ? 'bg-white text-zero-600 shadow-[0_1px_3px_rgba(15,17,24,.12)]' : 'text-[#5c6373]'
            }`}
          >
            {b.txt}
          </button>
        ))}
      </div>

      {/* La línea del mes. El borde izquierdo es el hilo; cada hito su punto. */}
      <ol className="m-0 mt-5 list-none border-l border-[#e4e8f4] p-0 pl-5">
        {hitos.map(h => {
          const tono = TONOS[h.tono ?? 'normal'];
          return (
            <li key={h.titulo} className="relative pb-5 last:pb-0">
              <span className={`absolute -left-[26px] top-1 size-2.5 rounded-full ring-4 ring-white ${tono.punto}`} />
              <span className="block text-[11px] font-semibold uppercase tracking-[.12em] text-[#a8aebd]">
                {h.cuando}
              </span>
              <span className={`mt-1 block font-[family-name:var(--font-display)] text-[14.5px] font-semibold tracking-[-.02em] ${tono.texto}`}>
                {h.titulo}
              </span>
              <span className="mt-1 block text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">{h.detalle}</span>
            </li>
          );
        })}
      </ol>

      <p className="m-0 mt-4 text-pretty text-[11.5px] leading-[1.5] text-[#8a90a0]">
        Las fechas, el recargo y por qué canales sale cada aviso los configura el colegio una vez.
      </p>
    </div>
  );
}
