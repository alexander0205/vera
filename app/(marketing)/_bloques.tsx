/**
 * Las piezas que repiten la portada y la página de colegios: el antetítulo, el
 * título de sección, la columna que encabeza cada bloque y los dos botones.
 *
 * Viven aquí y no dentro de una página porque las dos tienen la misma
 * arquitectura —columna de texto a la izquierda, rejilla a la derecha— y
 * duplicarlas era garantizar que se separaran en el primer retoque.
 */

import Link from 'next/link';
import { Flecha } from './_piezas';

export function Antetitulo({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[11px] font-semibold uppercase tracking-[.2em] text-zero-600">{children}</p>;
}

export function Titulo({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`m-0 font-[family-name:var(--font-display)] text-[clamp(1.75rem,3.4vw,2.125rem)] font-semibold leading-[1.12] tracking-[-.04em] text-balance text-[#102a72] ${className}`}>
      {children}
    </h2>
  );
}

/** La columna izquierda que encabeza casi todas las secciones. */
export function Encabezado({
  antetitulo, titulo, detalle, enlace,
}: {
  antetitulo: string;
  titulo: React.ReactNode;
  detalle?: string;
  enlace?: { texto: string; href: string };
}) {
  return (
    <div className="min-w-0">
      <Antetitulo>{antetitulo}</Antetitulo>
      <Titulo className="mt-3.5">{titulo}</Titulo>
      {detalle && <p className="mt-3.5 text-pretty text-[14.5px] leading-[1.65] text-[#5c6373]">{detalle}</p>}
      {enlace && (
        <Link
          href={enlace.href}
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-zero-600 transition hover:text-[#102a72]"
        >
          {enlace.texto}
          <Flecha tamano={14} />
        </Link>
      )}
    </div>
  );
}

export function BotonPrimario({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`flex h-[52px] items-center justify-center gap-2.5 rounded-xl bg-zero-600 px-7 font-[family-name:var(--font-display)] text-[15px] font-semibold text-white shadow-[0_18px_34px_-18px_rgba(54,88,225,.75)] transition hover:-translate-y-0.5 hover:bg-zero-700 ${className}`}
    >
      {children}
      <Flecha tamano={15} />
    </Link>
  );
}

export function BotonSecundario({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`flex h-[52px] items-center justify-center rounded-xl border border-[#dce3f2] bg-white px-[26px] font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#102a72] transition hover:-translate-y-0.5 hover:border-zero-300 ${className}`}
    >
      {children}
    </Link>
  );
}

/**
 * Tarjeta de módulo: icono a la izquierda, nombre y una línea de qué hace.
 *
 * Con `href` es un enlace a la página del módulo. Sin él, es una tarjeta muda
 * —la usan las páginas de producto, donde el visitante YA está dentro y
 * mandarlo a la misma página sería un enlace que no lleva a ningún lado—.
 */
export function TarjetaModulo({
  icono: Icono, titulo, detalle, href, className = '',
}: {
  icono: (p: { className?: string }) => React.ReactElement;
  titulo: string;
  detalle: string;
  href?: string;
  /** Clases del `<li>`: la portada las usa para la fila que rueda en el teléfono. */
  className?: string;
}) {
  const contenido = (
    <>
      <span className="grid size-[38px] shrink-0 place-items-center rounded-xl bg-[#edf1fe] text-zero-600">
        <Icono className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block text-pretty font-[family-name:var(--font-display)] text-[14.5px] font-semibold tracking-[-.015em] text-[#102a72]">{titulo}</span>
        <span className="mt-1.5 block text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">{detalle}</span>
      </span>
    </>
  );

  const clases = 'flex min-w-0 gap-3.5 rounded-[15px] border border-[#e7edfb] bg-white p-5 transition hover:-translate-y-0.5 hover:border-zero-200 hover:shadow-[0_22px_40px_-28px_rgba(16,42,114,.45)]';

  return (
    <li className={`min-w-0 ${className}`}>
      {href
        ? <Link href={href} className={`${clases} h-full`}>{contenido}</Link>
        : <span className={`${clases} h-full`}>{contenido}</span>}
    </li>
  );
}
