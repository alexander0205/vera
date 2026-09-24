'use client';

/**
 * Cabecera del sitio público.
 *
 * Cliente por tres razones concretas: el menú del móvil necesita estado, el
 * desplegable de «Producto» también, y la pestaña activa se resuelve con
 * `usePathname` en vez de pasarla por props desde cada página —que es donde se
 * olvida y quedan las tres apagadas—.
 *
 * `usePathname` no obliga a envolver en <Suspense>; el que lo obliga es
 * `useSearchParams`, que aquí no hace falta.
 *
 * El desplegable se abre de TRES formas —clic, teclado y, en escritorio, al
 * pasar el ratón— y se cierra con Escape, al tocar fuera y al navegar. La
 * maqueta lo abría solo al pasar el ratón: en un teléfono eso es un botón que
 * no hace nada, y con el teclado no hay forma de llegar.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoZero } from '@/components/marca-zero';
import { CONTACTO, Contenedor, Flecha, IconoWhatsApp, Iconos } from './_piezas';
import { ENLACE_CRM, ENLACE_ERP, MODULOS, SECCIONES } from './_menu';

/**
 * La barra: ERP con su desplegable, y estos cuatro sueltos.
 *
 * El CRM salió del desplegable de ERP a propósito. No es un módulo del ERP —es
 * otra aplicación, con su cuenta y su cobro— y tenerlo dentro lo hacía pasar
 * por uno más de los que vienen en el plan.
 */
const ENLACES = [
  { href: ENLACE_CRM, texto: 'CRM' },
  { href: '/colegios', texto: 'Colegios' },
  { href: '/precios', texto: 'Precios' },
  { href: '/guias', texto: 'Guías' },
  { href: '/contacto', texto: 'Contacto' },
] as const;

/**
 * Un enlace de ancla NO puede ser `Link`.
 *
 * Estando ya en la ruta de destino, el `Link` de Next cambia la URL y deja la
 * página donde estaba: el enlace parece roto. Un `<a>` pelado hace lo que se
 * espera, y desde otra página Next igual lo trata como navegación.
 */
function EnlaceAncla({
  href, className, children, onClick,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return <a href={href} className={className} onClick={onClick}>{children}</a>;
}

export function CabeceraMarketing() {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [producto, setProducto] = useState(false);
  /**
   * Abierto A PROPÓSITO (clic o teclado), no por haber pasado el ratón.
   *
   * Sin esta distinción el menú no se puede abrir con un clic: al llegar al
   * botón, el ratón ya lo abrió, y el clic —que alterna— lo cierra en el acto.
   * Fijado, el ratón no lo cierra al salir y el segundo clic sí lo cierra.
   */
  const [fijado, setFijado] = useState(false);
  const cajaProducto = useRef<HTMLDivElement>(null);
  const cerrarConRetraso = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Los dos menús se cierran al navegar. Sin esto quedan encima de la página
  // nueva y parece que el enlace no hizo nada.
  useEffect(() => { setAbierto(false); cerrarProducto(); }, [ruta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape y clic fuera. Un panel que solo se cierra volviendo a apretar el
  // botón deja tapada media pantalla en cuanto el visitante se distrae.
  useEffect(() => {
    if (!producto) return;

    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') cerrarProducto();
    }
    function alTocar(e: MouseEvent) {
      if (!cajaProducto.current?.contains(e.target as Node)) cerrarProducto();
    }

    document.addEventListener('keydown', alTeclear);
    document.addEventListener('mousedown', alTocar);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.removeEventListener('mousedown', alTocar);
    };
  }, [producto]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al salir del botón hacia el panel el ratón pasa por el hueco de en medio:
  // cerrar en ese instante hace que el menú se escape justo cuando lo vas a
  // usar. El respiro es corto y se cancela al volver a entrar.
  function cerrarProducto() {
    if (cerrarConRetraso.current) clearTimeout(cerrarConRetraso.current);
    setProducto(false);
    setFijado(false);
  }
  function entrar() {
    if (cerrarConRetraso.current) clearTimeout(cerrarConRetraso.current);
    setProducto(true);
  }
  function salir() {
    if (fijado) return;
    if (cerrarConRetraso.current) clearTimeout(cerrarConRetraso.current);
    cerrarConRetraso.current = setTimeout(() => setProducto(false), 140);
  }
  /** Clic o Enter: fija el panel abierto, o lo cierra si ya estaba fijado. */
  function alternar() {
    if (fijado) { cerrarProducto(); return; }
    if (cerrarConRetraso.current) clearTimeout(cerrarConRetraso.current);
    setProducto(true);
    setFijado(true);
  }
  useEffect(() => () => {
    if (cerrarConRetraso.current) clearTimeout(cerrarConRetraso.current);
  }, []);

  // En contacto el botón principal ya no puede ser «ir a contacto»: ahí el
  // atajo útil es escribir por WhatsApp, que es la vía más rápida que tenemos.
  const enContacto = ruta === '/contacto';
  const enPortada = ruta === '/';

  return (
    <header className="sticky top-0 z-50 border-b border-[#edeff5] bg-white/90 backdrop-blur-[14px]">
      <Contenedor>
        <div className="flex h-[68px] items-center gap-6">
          <Link href="/" aria-label="Zero — inicio" className="shrink-0">
            <LogoZero alto={25} />
          </Link>

          <nav className="hidden flex-1 items-center gap-7 md:flex">
            {/* ── ERP, con su desplegable ───────────────────────────────── */}
            <div
              ref={cajaProducto}
              className="relative flex h-[68px] items-center"
              onMouseEnter={entrar}
              onMouseLeave={salir}
            >
              <button
                type="button"
                onClick={alternar}
                aria-expanded={producto}
                aria-controls="menu-producto"
                // Se pinta activo solo con el panel abierto: «Producto» no es
                // una ruta, y encenderlo en la portada le dice al visitante que
                // está en una página que no existe.
                className={`flex items-center gap-1.5 whitespace-nowrap text-[13.5px] transition ${
                  producto ? 'font-semibold text-zero-600' : 'font-medium text-[#3b4252] hover:text-zero-600'
                }`}
              >
                ERP
                <svg
                  width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                  className={`transition-transform ${producto ? 'rotate-180' : ''}`}
                >
                  <path d="m6 9.5 6 6 6-6" />
                </svg>
              </button>

              {producto && (
                <div
                  id="menu-producto"
                  className="absolute left-[-22px] top-[62px] w-[640px] rounded-[18px] border border-[#e7eaf4] bg-white p-[18px] shadow-[0_34px_70px_-30px_rgba(16,42,114,.34)]"
                >
                  {/* El sistema completo primero: cuatro de los seis módulos
                      viven dentro de él y esta es la puerta grande. */}
                  <Link
                    href={ENLACE_ERP}
                    onClick={cerrarProducto}
                    className="flex items-center gap-2.5 rounded-[13px] bg-[#f4f7fe] px-3 py-2.5 transition hover:bg-[#edf1fe]"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-white text-zero-600">
                      <Iconos.base className="size-[15px]" />
                    </span>
                    <span className="text-[12.5px] font-semibold text-[#102a72]">Zero ERP</span>
                    <span className="min-w-0 truncate text-[11.5px] text-[#6b7280]">
                      Facturación, cobros, inventario y contabilidad
                    </span>
                    <Flecha tamano={13} className="ml-auto shrink-0 text-zero-600" />
                  </Link>

                  <p className="m-0 px-2 pb-2 pt-3 text-[10.5px] font-semibold uppercase tracking-[.16em] text-[#8a90a0]">
                    Dentro del ERP
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {MODULOS.map(m => (
                      <Link
                        key={m.href}
                        href={m.href}
                        onClick={cerrarProducto}
                        className="flex min-w-0 gap-3 rounded-[13px] p-3 transition hover:bg-[#f4f7fe]"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-[#edf1fe] text-zero-600">
                          <m.icono className="size-[17px]" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-pretty font-[family-name:var(--font-display)] text-[13.5px] font-semibold tracking-[-.015em] text-[#102a72]">
                            {m.titulo}
                          </span>
                          <span className="mt-1 block text-pretty text-[11.5px] leading-[1.45] text-[#6b7280]">
                            {m.detalle}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-1 border-t border-[#f0f3fa] pt-2">
                    {SECCIONES.map(s => (
                      <EnlaceAncla
                        key={s.href}
                        href={s.href}
                        onClick={cerrarProducto}
                        className="flex min-w-0 flex-col rounded-[13px] px-3 py-2.5 transition hover:bg-[#f4f7fe]"
                      >
                        <span className="text-[12.5px] font-semibold text-[#102a72]">{s.titulo}</span>
                        <span className="mt-0.5 text-pretty text-[11.5px] leading-[1.45] text-[#6b7280]">{s.detalle}</span>
                      </EnlaceAncla>
                    ))}
                  </div>

                </div>
              )}
            </div>

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
        // `max-h` + scroll: con los seis módulos dentro, la lista pasa del alto
        // de un teléfono y el botón de «Empieza gratis» quedaba fuera de
        // alcance, debajo del borde de la pantalla.
        <div className="max-h-[calc(100dvh-68px)] overflow-y-auto border-t border-[#edeff5] bg-white md:hidden">
          <Contenedor className="flex flex-col gap-1 py-3">
            <Link
              href="/"
              className={`rounded-xl px-3 py-2.5 text-sm transition ${
                enPortada ? 'bg-[#f5f8ff] font-semibold text-zero-600' : 'font-medium text-[#3b4252]'
              }`}
            >
              Inicio
            </Link>

            <p className="m-0 px-3 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[.16em] text-[#8a90a0]">
              Dentro del ERP
            </p>
            <Link
              href={ENLACE_ERP}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#102a72]"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-[#edf1fe] text-zero-600">
                <Iconos.base className="size-[15px]" />
              </span>
              Zero ERP
            </Link>
            {MODULOS.map(m => (
              <Link
                key={m.href}
                href={m.href}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-[#3b4252]"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-[#edf1fe] text-zero-600">
                  <m.icono className="size-[15px]" />
                </span>
                {m.titulo}
              </Link>
            ))}

            <div className="mt-2 border-t border-[#f0f3fa] pt-2" />
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
