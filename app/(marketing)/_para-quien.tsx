'use client';

/**
 * «Para quién es», por industria y de una en una.
 *
 * Antes eran seis tarjetas con foto en rejilla, y tres de las fotos tenían a la
 * misma persona con el mismo polo —de mesero, de cajero y de almacenista—, una
 * al lado de la otra. Además todas llevaban a /precios, así que el dueño de un
 * restaurante que tocaba «Restaurantes» caía en una tabla de precios genérica.
 *
 * Ahora se elige la industria y se ve UNA imagen, lo que esa industria usa de
 * Zero y el enlace a la página que le toca. Las distribuidoras llevan la
 * captura de su cartera en vez de foto: es la empresa de demostración, que es
 * justo una distribuidora.
 *
 * Pestañas de verdad (`tablist`/`tab`/`tabpanel`) con flechas de teclado; en el
 * teléfono la fila de pestañas rueda de lado en vez de apilar seis tarjetas.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { Cheque, Flecha } from './_piezas';
import { BotonPrueba } from './_llamados';

type Industria = {
  clave: string;
  titulo: string;
  corto: string;
  dolor: string;
  /** Lo que usa de Zero. El colegio lleva más: su tramo trae todos los módulos. */
  usa: string[];
  href: string;
  enlace: string;
  imagen: { src: string; ancho: number; alto: number; posicion: string; esCaptura?: boolean };
};

const INDUSTRIAS: Industria[] = [
  {
    clave: 'restaurantes',
    titulo: 'Restaurantes y cafeterías',
    corto: 'Restaurantes',
    dolor: 'La comanda va en papel y la factura se hace después.',
    usa: ['Mesas y comandas, con su mesero', 'Caja con turnos y cuadre al cierre', 'El comprobante sale al cobrar la mesa'],
    href: '/productos/punto-de-venta',
    enlace: 'Ver el punto de venta',
    imagen: { src: '/home/fotos/11-cafeteria.png', ancho: 2172, alto: 724, posicion: '36% 50%' },
  },
  {
    clave: 'comercios',
    titulo: 'Tiendas, colmados y comercios',
    corto: 'Comercios',
    dolor: 'Vendes rápido y el inventario se queda atrás.',
    usa: ['Venta rápida, escaneando el código de barras', 'Inventario que baja con cada venta', 'El fiao, con su cuenta por cobrar'],
    href: '/productos/punto-de-venta',
    enlace: 'Ver el punto de venta',
    imagen: { src: '/home/fotos/31-colmado.png', ancho: 1254, alto: 1254, posicion: '50% 42%' },
  },
  {
    clave: 'distribuidoras',
    titulo: 'Distribuidoras y mayoristas',
    corto: 'Distribuidoras',
    dolor: 'Vendes a crédito y cobrar se vuelve otro trabajo.',
    usa: ['Quién te debe, cuánto y desde cuándo', 'Stock por almacén con aviso de mínimo', 'Compras al suplidor con su costo real'],
    href: '/productos/erp#cobros',
    enlace: 'Ver cuentas por cobrar',
    imagen: { src: '/home/capturas/demo-cartera.png', ancho: 1440, alto: 900, posicion: '0% 0%', esCaptura: true },
  },
  {
    clave: 'servicios',
    titulo: 'Servicios y agencias',
    corto: 'Servicios',
    dolor: 'Igualas mensuales que se facturan a mano y cobros que se olvidan.',
    usa: ['Facturas recurrentes que salen solas cada mes', 'Cotización que se vuelve factura en un clic', 'Link de pago para cobrar con tarjeta'],
    href: '/productos/erp#facturacion',
    enlace: 'Ver facturación',
    imagen: { src: '/home/fotos/33-agencia.png', ancho: 1254, alto: 1254, posicion: '50% 40%' },
  },
  {
    clave: 'contadores',
    titulo: 'Contadores y firmas',
    corto: 'Contadores',
    dolor: 'Llevas varias empresas, cada una en un sistema distinto.',
    usa: ['Todas tus empresas con el mismo usuario, cada una con sus libros', 'Libro diario, mayor y estados financieros', 'El 606, el 607 y el 608 armados'],
    href: '/productos/contabilidad',
    enlace: 'Ver contabilidad',
    imagen: { src: '/home/fotos/35-contadora-abierto.png', ancho: 1448, alto: 1086, posicion: '50% 45%' },
  },
  {
    clave: 'colegios',
    titulo: 'Colegios',
    corto: 'Colegios',
    dolor: 'Mensualidades, mora y cobranza que dependen de una libreta.',
    // El tramo de colegio trae TODOS los módulos (lib/config/plans.ts): se dice
    // aquí con nombre, no con un «y más».
    usa: [
      'Mensualidades, mora y un link de pago para cada familia',
      'Punto de venta para la cafetería',
      'Facturación e-CF de cada cobro ante la DGII',
      'Contabilidad y nómina del personal, incluidas',
    ],
    href: '/colegios',
    enlace: 'Ver Zero para colegios',
    imagen: { src: '/home/fotos/12-familia.png', ancho: 1086, alto: 1448, posicion: '50% 30%' },
  },
];

export function ParaQuien() {
  const [activa, setActiva] = useState(0);
  const base = useId();
  const pestanas = useRef<(HTMLButtonElement | null)[]>([]);
  const ind = INDUSTRIAS[activa];

  /** Flechas, Inicio y Fin: el patrón de pestañas que espera un lector de pantalla. */
  function teclado(e: React.KeyboardEvent, i: number) {
    const destino =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % INDUSTRIAS.length :
      e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + INDUSTRIAS.length) % INDUSTRIAS.length :
      e.key === 'Home' ? 0 :
      e.key === 'End' ? INDUSTRIAS.length - 1 : null;
    if (destino === null) return;
    e.preventDefault();
    setActiva(destino);
    pestanas.current[destino]?.focus();
  }

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,.62fr)_minmax(0,2fr)] lg:gap-6">
      <div
        role="tablist"
        aria-label="Industrias"
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {INDUSTRIAS.map((x, i) => {
          const on = i === activa;
          return (
            <button
              key={x.clave}
              ref={el => { pestanas.current[i] = el; }}
              id={`${base}-pestana-${x.clave}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${base}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActiva(i)}
              onKeyDown={e => teclado(e, i)}
              className={`shrink-0 snap-start cursor-pointer rounded-xl border px-4 py-3 text-left transition-colors duration-200 lg:w-full ${
                on
                  ? 'border-zero-600 bg-zero-600 text-white'
                  : 'border-[#e3e7f2] bg-white text-[#102a72] hover:border-zero-200'
              }`}
            >
              <span className="block whitespace-nowrap font-[family-name:var(--font-display)] text-[14px] font-semibold tracking-[-.015em] lg:whitespace-normal">
                <span className="lg:hidden">{x.corto}</span>
                <span className="hidden lg:inline">{x.titulo}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        id={`${base}-panel`}
        role="tabpanel"
        aria-labelledby={`${base}-pestana-${ind.clave}`}
        className="grid min-w-0 overflow-hidden rounded-3xl border border-[#e7edfb] bg-white md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]"
      >
        {/* `key` fuerza a montar de nuevo: así el fundido corre en cada cambio. */}
        <div key={ind.clave} className="relative min-h-[220px] animate-[zero-aparece_.45s_cubic-bezier(.2,.7,.2,1)_both] bg-[#eef2fb] motion-reduce:animate-none md:min-h-[360px]">
          <Image
            src={ind.imagen.src}
            alt={ind.imagen.esCaptura ? 'Cuentas por cobrar de una distribuidora en Zero, por antigüedad' : ''}
            fill
            sizes="(min-width: 1024px) 480px, (min-width: 768px) 50vw, 100vw"
            className="object-cover"
            style={{ objectPosition: ind.imagen.posicion }}
          />
        </div>

        <div key={`${ind.clave}-texto`} className="flex min-w-0 animate-[zero-aparece_.45s_cubic-bezier(.2,.7,.2,1)_both] flex-col p-6 motion-reduce:animate-none sm:p-8">
          <p className="m-0 font-[family-name:var(--font-display)] text-[clamp(1.25rem,2.6vw,1.5rem)] font-semibold leading-[1.2] tracking-[-.03em] text-balance text-[#102a72]">
            {ind.titulo}
          </p>
          <p className="m-0 mt-2.5 text-pretty text-[14.5px] leading-[1.6] text-[#5c6373]">«{ind.dolor}»</p>
          <p className="m-0 mt-5 text-[10.5px] font-semibold uppercase tracking-[.16em] text-zero-600">Lo que usa de Zero</p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
            {ind.usa.map(u => (
              <li key={u} className="flex min-w-0 items-start gap-2.5 text-[14px] leading-[1.5] text-[#3b4252]">
                <Cheque tamano={12} color="#3658e1" grosor={3.4} />
                <span className="min-w-0">{u}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 md:mt-auto md:pt-6">
            <BotonPrueba familia={ind.clave === 'colegios' ? 'colegio' : 'ecf'} tamano="mediano" />
            <Link
              href={ind.href}
              className="inline-flex items-center gap-2 text-[14px] font-semibold text-zero-600 transition hover:text-[#102a72]"
            >
              {ind.enlace}
              <Flecha tamano={13} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
