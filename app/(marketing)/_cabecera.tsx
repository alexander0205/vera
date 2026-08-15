'use client';

/**
 * Cabecera del sitio público.
 *
 * Cliente por dos razones concretas: el menú del móvil necesita estado, y la
 * pestaña activa se resuelve con `usePathname` en vez de pasarla por props
 * desde cada página —que es donde se olvida y quedan las tres apagadas—.
 *
 * `usePathname` no obliga a envolver en <Suspense>; el que lo obliga es
 * `useSearchParams`, que aquí no hace falta.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoZero } from '@/components/marca-zero';
import { CONTACTO, Contenedor, IconoWhatsApp } from './_piezas';

const ENLACES = [
  { href: '/', texto: 'Inicio' },
  { href: '/precios', texto: 'Planes' },
  { href: '/contacto', texto: 'Contacto' },
] as const;

export function CabeceraMarketing() {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);

  // El menú del móvil se cierra al navegar. Sin esto queda encima de la página
  // nueva y parece que el enlace no hizo nada.
  useEffect(() => { setAbierto(false); }, [ruta]);

  // En contacto el botón principal ya no puede ser «ir a contacto»: ahí el
  // atajo útil es escribir por WhatsApp, que es la vía más rápida que tenemos.
  const enContacto = ruta === '/contacto';

  return (
    <header className="sticky top-0 z-50 border-b border-[#edeff5] bg-white/90 backdrop-blur-[14px]">
      <Contenedor>
        <div className="flex h-[68px] items-center gap-6">
          <Link href="/" aria-label="Zero — inicio" className="shrink-0">
            <LogoZero alto={25} />
          </Link>

          <nav className="hidden flex-1 items-center gap-7 md:flex">
            {ENLACES.map(e => {
              const activo = ruta === e.href;
              return (
                <Link
                  key={e.href}
                  href={e.href}
                  aria-current={activo ? 'page' : undefined}
                  className={`whitespace-nowrap text-[13.5px] transition ${
                    activo ? 'font-semibold text-zero-600' : 'font-medium text-[#3b4252] hover:text-zero-600'
                  }`}
                >
                  {e.texto}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto hidden items-center gap-4 md:flex">
            <Link href="/sign-in" className="whitespace-nowrap text-[13.5px] font-semibold text-[#3b4252] transition hover:text-zero-600">
              Iniciar sesión
            </Link>
            {enContacto ? (
              <a
                href={CONTACTO.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[11px] bg-zero-600 px-5 text-[13.5px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(54,88,225,.7)] transition hover:bg-zero-700"
              >
                <IconoWhatsApp />
                Escríbenos
              </a>
            ) : (
              <Link
                href="/sign-up"
                className="flex h-10 items-center whitespace-nowrap rounded-[11px] bg-zero-600 px-5 text-[13.5px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(54,88,225,.7)] transition hover:bg-zero-700"
              >
                Empieza gratis
              </Link>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAbierto(v => !v)}
            aria-expanded={abierto}
            aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
            className="ml-auto grid size-10 place-items-center rounded-[11px] border border-[#e4e8f4] text-[#3b4252] md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              {abierto ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />}
            </svg>
          </button>
        </div>
      </Contenedor>

      {abierto && (
        <div className="border-t border-[#edeff5] bg-white md:hidden">
          <Contenedor className="flex flex-col gap-1 py-3">
            {ENLACES.map(e => (
              <Link
                key={e.href}
                href={e.href}
                className={`rounded-xl px-3 py-2.5 text-sm transition ${
                  ruta === e.href ? 'bg-[#f5f8ff] font-semibold text-zero-600' : 'font-medium text-[#3b4252]'
                }`}
              >
                {e.texto}
              </Link>
            ))}
            <Link href="/sign-in" className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#3b4252]">
              Iniciar sesión
            </Link>
            <Link
              href="/sign-up"
              className="mt-1 flex h-11 items-center justify-center rounded-xl bg-zero-600 text-sm font-semibold text-white"
            >
              Empieza gratis
            </Link>
          </Contenedor>
        </div>
      )}
    </header>
  );
}
