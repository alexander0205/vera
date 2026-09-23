/**
 * El molde de las páginas de producto: ERP, Punto de Venta, Nómina y CRM.
 *
 * Las cuatro cuentan lo mismo con distinto contenido —qué es, qué hace, qué
 * cuesta y cómo se prueba—, así que el armazón vive aquí. Con una copia por
 * página, el retoque de una se queda sin hacer en las otras tres, que es
 * exactamente lo que pasó con la portada y la de colegios antes de
 * `_bloques.tsx`.
 *
 * Regla al escribir el contenido que se le pasa: **solo lo que el sistema hace
 * hoy**. Las maquetas de estas landings prometían cosas que no existen —vender
 * sin internet, lotes con vencimiento, conteo físico, pago masivo al banco,
 * gestión de sucursales— y cada una de esas se quedó fuera a propósito. Una
 * promesa de más aquí es una devolución en la segunda semana.
 */

import Image from 'next/image';
import Link from 'next/link';
import { LazoZero } from '@/lib/marca/isotipo';
import { CONTACTO, Cheque, Contenedor, Flecha, IconoWhatsApp } from './_piezas';
import { Antetitulo, BotonPrimario, BotonSecundario, Encabezado, Titulo } from './_bloques';

export type PuntoDeProducto = {
  titulo: string;
  detalle: string;
  icono: (p: { className?: string }) => React.ReactElement;
};

/** Encabezado de una página de producto, con su captura debajo. */
export function HeroProducto({
  antetitulo, titulo, bajada, pie, captura, alt, accion = 'Empieza gratis', href = '/sign-up',
}: {
  antetitulo: string;
  titulo: string;
  bajada: string;
  /** La línea chica de debajo de los botones: precio, prueba, lo que aplique. */
  pie?: string;
  /**
   * La captura del producto. Opcional a propósito: más vale un encabezado sin
   * imagen que una pantalla vacía. La de nómina llegó con el panel en blanco y
   * poner eso debajo del titular dice lo contrario de lo que promete.
   */
  captura?: string;
  alt?: string;
  accion?: string;
  href?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#f4f8ff_0%,#edf3ff_42%,#ffffff_100%)]">
      <Contenedor className="relative pt-14 sm:pt-[60px]">
        <div className="mx-auto max-w-[820px] text-center">
          <Antetitulo>{antetitulo}</Antetitulo>
          <h1 className="m-0 mt-4 font-[family-name:var(--font-display)] text-[clamp(2.1rem,5.4vw,3.25rem)] font-semibold leading-[1.06] tracking-[-.045em] text-balance text-[#102a72]">
            {titulo}
          </h1>
          <p className="mx-auto mt-5 max-w-[620px] text-pretty text-[17px] leading-[1.6] text-[#4a5164]">
            {bajada}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <BotonPrimario href={href}>{accion}</BotonPrimario>
            <BotonSecundario href="/contacto">Habla con ventas</BotonSecundario>
          </div>
          {pie && <p className="mt-4 text-[13px] text-[#8a90a0]">{pie}</p>}
        </div>

        {captura && (
        <div className="relative mx-auto mt-10 max-w-[940px] sm:mt-[52px]">
          <Image
            src={captura}
            alt={alt ?? ''}
            width={924}
            height={578}
            priority
            className="w-full rounded-2xl border border-[#dfe6f7] bg-white shadow-[0_50px_90px_-40px_rgba(16,42,114,.55)]"
          />
        </div>
        )}
      </Contenedor>
    </section>
  );
}

/** Sección de tarjetas: la columna de texto a la izquierda, la rejilla al lado. */
export function SeccionProducto({
  id, antetitulo, titulo, detalle, puntos, columnas = 3, captura, alt,
}: {
  id?: string;
  antetitulo: string;
  titulo: string;
  detalle?: string;
  puntos: readonly PuntoDeProducto[];
  columnas?: 2 | 3;
  captura?: string;
  alt?: string;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <Contenedor className="pt-16 sm:pt-[82px]">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,2fr)] lg:gap-12">
          <Encabezado antetitulo={antetitulo} titulo={titulo} detalle={detalle} />
          <div className="min-w-0">
            <ul className={`m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 ${columnas === 3 ? 'xl:grid-cols-3' : ''}`}>
              {puntos.map(p => (
                <li
                  key={p.titulo}
                  className="flex min-w-0 gap-3.5 rounded-[15px] border border-[#e7edfb] bg-white p-5 transition hover:-translate-y-0.5 hover:border-zero-200 hover:shadow-[0_22px_40px_-28px_rgba(16,42,114,.45)]"
                >
                  <span className="grid size-[38px] shrink-0 place-items-center rounded-xl bg-[#edf1fe] text-zero-600">
                    <p.icono className="size-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-pretty font-[family-name:var(--font-display)] text-[14.5px] font-semibold tracking-[-.015em] text-[#102a72]">
                      {p.titulo}
                    </span>
                    <span className="mt-1.5 block text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">
                      {p.detalle}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {captura && (
              <Image
                src={captura}
                alt={alt ?? ''}
                width={924}
                height={578}
                className="mt-3.5 w-full rounded-2xl border border-[#e2e8f7] bg-white shadow-[0_26px_50px_-30px_rgba(16,42,114,.45)]"
              />
            )}
          </div>
        </div>
      </Contenedor>
    </section>
  );
}

/**
 * Sección de una sola idea: el texto a un lado y la pantalla al otro.
 *
 * `invertida` la pone a la izquierda. Se alternan a propósito — cuatro bloques
 * seguidos con la imagen del mismo lado se leen como una tabla y el ojo deja de
 * bajar.
 */
export function SeccionConImagen({
  id, antetitulo, titulo, detalle, lineas, captura, alt, invertida = false,
}: {
  id?: string;
  antetitulo: string;
  titulo: string;
  detalle?: string;
  lineas?: readonly string[];
  captura: string;
  alt: string;
  invertida?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <Contenedor className="pt-16 sm:pt-[82px]">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className={`min-w-0 ${invertida ? 'lg:order-2' : ''}`}>
            <Antetitulo>{antetitulo}</Antetitulo>
            <Titulo className="mt-3.5">{titulo}</Titulo>
            {detalle && (
              <p className="m-0 mt-3.5 text-pretty text-[15px] leading-[1.6] text-[#5c6373]">{detalle}</p>
            )}
            {lineas && (
              <ul className="m-0 mt-5 flex list-none flex-col gap-2.5 p-0">
                {lineas.map(l => (
                  <li key={l} className="flex min-w-0 items-start gap-2.5 text-[13px] leading-[1.55] text-[#3b4252]">
                    <Cheque tamano={12} color="#3658e1" grosor={3.4} />
                    <span className="min-w-0">{l}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Image
            src={captura}
            alt={alt}
            width={1440}
            height={900}
            className={`min-w-0 rounded-2xl border border-[#e2e8f7] bg-white shadow-[0_34px_60px_-34px_rgba(16,42,114,.5)] ${invertida ? 'lg:order-1' : ''}`}
          />
        </div>
      </Contenedor>
    </section>
  );
}

/** Franja clara con una lista de verdades cortas. Para lo que no es tarjeta. */
export function FranjaProducto({
  antetitulo, titulo, detalle, lineas,
}: {
  antetitulo: string;
  titulo: string;
  detalle?: string;
  lineas: readonly string[];
}) {
  return (
    <section>
      <Contenedor className="pt-16 sm:pt-[82px]">
        <div className="grid items-center gap-8 rounded-3xl border border-[#e7edfb] bg-[#f5f8ff] p-7 sm:p-11 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
          <div className="min-w-0">
            <Antetitulo>{antetitulo}</Antetitulo>
            <Titulo className="mt-3.5">{titulo}</Titulo>
            {detalle && (
              <p className="m-0 mt-3.5 text-pretty text-[15px] leading-[1.6] text-[#5c6373]">{detalle}</p>
            )}
          </div>
          <ul className="m-0 flex min-w-0 list-none flex-col gap-2.5 p-0">
            {lineas.map(l => (
              <li key={l} className="flex min-w-0 items-start gap-2.5 text-[13px] leading-[1.55] text-[#3b4252]">
                <Cheque tamano={12} color="#3658e1" grosor={3.4} />
                <span className="min-w-0">{l}</span>
              </li>
            ))}
          </ul>
        </div>
      </Contenedor>
    </section>
  );
}

/** El bloque oscuro del final: qué sigue y por dónde escribirnos. */
export function CierreProducto({
  antetitulo, titulo, detalle, nota, accion = 'Empieza gratis', href = '/sign-up',
}: {
  antetitulo: string;
  titulo: string;
  detalle: string;
  /** La tarjeta de al lado: lo que hace falta del lado del cliente. */
  nota: { titulo: string; detalle: string };
  accion?: string;
  href?: string;
}) {
  return (
    <section>
      <Contenedor className="pb-4 pt-16 sm:pt-[82px]">
        <div className="relative overflow-hidden rounded-3xl bg-[#0b1a46] p-7 sm:p-12">
          <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-14 opacity-[.07]">
            <LazoZero alto={290} color="#ffffff" />
          </div>
          <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(280px,1.3fr)_minmax(240px,.85fr)]">
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[.2em] text-white/55">{antetitulo}</p>
              <h2 className="m-0 mt-3.5 font-[family-name:var(--font-display)] text-[clamp(1.75rem,3.4vw,2.125rem)] font-semibold leading-[1.1] tracking-[-.045em] text-balance text-white">
                {titulo}
              </h2>
              <p className="m-0 mt-3.5 max-w-[520px] text-pretty text-[15px] leading-[1.6] text-white/70">{detalle}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <BotonPrimario href={href}>{accion}</BotonPrimario>
                <a
                  href={CONTACTO.whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-[52px] items-center gap-2.5 rounded-xl border border-white/20 px-[26px] font-[family-name:var(--font-display)] text-[15px] font-semibold text-white transition hover:-translate-y-0.5 hover:border-white/40"
                >
                  <IconoWhatsApp tamano={16} />
                  O escríbenos por WhatsApp
                </a>
              </div>
            </div>
            <div className="min-w-0 rounded-2xl border border-white/12 bg-white/[.06] p-6">
              <p className="m-0 text-[12.5px] font-semibold text-white">{nota.titulo}</p>
              <p className="m-0 mt-2 text-pretty text-[12.5px] leading-[1.55] text-white/70">{nota.detalle}</p>
              <p className="m-0 mt-4 text-[12.5px] tabular-nums text-white/60">{CONTACTO.telefono}</p>
              <p className="m-0 text-[12.5px] text-white/60">{CONTACTO.ventas}</p>
            </div>
          </div>
        </div>
      </Contenedor>
    </section>
  );
}

/** La línea de precio de una página de producto, con su enlace a /precios. */
export function PrecioProducto({ texto }: { texto: React.ReactNode }) {
  return (
    <section>
      <Contenedor className="pt-16 sm:pt-[82px]">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-[#e7edfb] bg-white p-6 sm:p-7">
          <p className="m-0 min-w-0 flex-[1_1_320px] text-pretty text-[14.5px] leading-[1.55] text-[#3b4252]">
            {texto}
          </p>
          <Link
            href="/precios"
            className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-zero-600 transition hover:text-[#102a72]"
          >
            Ver todos los planes
            <Flecha tamano={14} />
          </Link>
        </div>
      </Contenedor>
    </section>
  );
}
