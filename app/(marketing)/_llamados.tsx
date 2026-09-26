/**
 * Los llamados a la acción del sitio: todos llevan a PROBAR, y dicen cuánto.
 *
 * Antes el botón decía «Empieza gratis» sin decir hasta cuándo, y el segundo
 * llevaba a un formulario. Ahora:
 *
 *  - El principal dice los días de prueba de la familia de la que se está
 *    hablando: 15 en facturación, 30 en colegio. El número sale de
 *    `diasDePrueba()` (lib/config/suscripcion.ts), que es el mismo que se le
 *    pasa a Stripe como `trial_period_days`: si el botón dijera otra cosa, el
 *    cliente se quedaría fuera antes de lo prometido.
 *  - Debajo va lo que quita el miedo a probar, también leído de la perilla:
 *    «Sin tarjeta» solo mientras la prueba no la pida.
 *  - El segundo camino es WhatsApp, que es por donde escribe el dueño de un
 *    negocio dominicano, no un formulario de contacto.
 *  - En el teléfono los botones grandes van a todo lo ancho: apilados con su
 *    ancho natural quedaban uno más corto que el otro, y a lo ancho se tocan
 *    con el pulgar sin apuntar.
 *
 * Un solo sitio para los textos: el día que la prueba cambie de días o pida
 * tarjeta, cambian todos los botones del sitio a la vez.
 */

import Link from 'next/link';
import { PRUEBA, diasDePrueba } from '@/lib/config/suscripcion';
import { CONTACTO, Cheque, Flecha, IconoWhatsApp } from './_piezas';

export type Familia = 'ecf' | 'colegio';

/** «Prueba 15 días gratis» / «Prueba 30 días gratis». */
export const textoPrueba = (familia: Familia = 'ecf') => `Prueba ${diasDePrueba(familia)} días gratis`;

/** Lo que se promete alrededor de la prueba, verdadero por construcción. */
export function garantiasDePrueba(): string[] {
  return [...(PRUEBA.pideTarjeta ? [] : ['Sin tarjeta']), 'Sin contrato mínimo'];
}

/** El botón principal: lleva al registro y dice los días. */
export function BotonPrueba({
  familia = 'ecf', texto, tono = 'azul', tamano = 'grande', className = '',
}: {
  familia?: Familia;
  texto?: string;
  /** `claro` para ponerlo sobre un fondo azul marino. */
  tono?: 'azul' | 'claro';
  tamano?: 'grande' | 'mediano';
  className?: string;
}) {
  const alto = tamano === 'grande' ? 'h-[52px] w-full px-7 text-[15px] sm:w-auto' : 'h-11 px-5 text-[14px]';
  const color = tono === 'claro'
    ? 'bg-white text-[#102a72] hover:bg-[#eef2fe]'
    : 'bg-zero-600 text-white shadow-[0_18px_34px_-18px_rgba(54,88,225,.75)] hover:bg-zero-700';
  return (
    <Link
      href="/sign-up"
      className={`flex items-center justify-center gap-2.5 rounded-xl font-[family-name:var(--font-display)] font-semibold transition hover:-translate-y-0.5 active:translate-y-0 ${alto} ${color} ${className}`}
    >
      {texto ?? textoPrueba(familia)}
      <Flecha tamano={tamano === 'grande' ? 15 : 13} />
    </Link>
  );
}

/** El segundo camino: WhatsApp, en vez de un formulario. */
export function BotonWhatsApp({
  tono = 'claro', tamano = 'grande', texto = 'Escríbenos por WhatsApp', className = '',
}: {
  /** `claro` sobre fondo blanco; `oscuro` sobre azul marino. */
  tono?: 'claro' | 'oscuro';
  tamano?: 'grande' | 'mediano';
  texto?: string;
  className?: string;
}) {
  const alto = tamano === 'grande' ? 'h-[52px] w-full px-6 text-[15px] sm:w-auto' : 'h-11 px-4 text-[14px]';
  const color = tono === 'oscuro'
    ? 'border border-white/25 text-white hover:border-white/50'
    : 'border border-[#dce3f2] bg-white text-[#102a72] hover:border-zero-300';
  return (
    <a
      href={CONTACTO.whatsappHref}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-center gap-2.5 rounded-xl font-[family-name:var(--font-display)] font-semibold transition hover:-translate-y-0.5 active:translate-y-0 ${alto} ${color} ${className}`}
    >
      <span className={tono === 'oscuro' ? 'text-[#4be38a]' : 'text-[#1faa59]'}><IconoWhatsApp tamano={17} /></span>
      {texto}
    </a>
  );
}

/** La línea de debajo de los botones: sin tarjeta, sin contrato, y lo que se sume. */
export function GarantiasPrueba({
  extra = [], tono = 'claro', centrado = false, className = '',
}: {
  extra?: string[];
  tono?: 'claro' | 'oscuro';
  centrado?: boolean;
  className?: string;
}) {
  return (
    <ul className={`m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-[13px] ${centrado ? 'justify-center' : ''} ${tono === 'oscuro' ? 'text-white/75' : 'text-[#5c6373]'} ${className}`}>
      {[...garantiasDePrueba(), ...extra].map(g => (
        <li key={g} className="flex items-center gap-1.5 whitespace-nowrap">
          <Cheque tamano={11} color={tono === 'oscuro' ? '#7ee2a8' : '#12925a'} grosor={3.4} />
          {g}
        </li>
      ))}
    </ul>
  );
}

/**
 * Un llamado en línea, para cerrar una sección que acaba de convencer: el
 * recorrido, una industria. Pregunta corta, botón y garantías.
 */
export function LlamadoEnLinea({
  titulo, familia = 'ecf', className = '',
}: {
  titulo: string;
  familia?: Familia;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-4 rounded-2xl border border-[#dfe6f8] bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 ${className}`}>
      <div className="min-w-0">
        <p className="m-0 font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-[-.025em] text-balance text-[#102a72]">{titulo}</p>
        <GarantiasPrueba className="mt-2" />
      </div>
      <BotonPrueba familia={familia} tamano="mediano" className="shrink-0" />
    </div>
  );
}
