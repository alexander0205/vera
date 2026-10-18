/**
 * La documentación del conector MCP (mcp.zero.com.do).
 *
 * Grupo de rutas aparte del sitio público a propósito: es otro sitio con otra
 * cabecera, y sin sesión. El proxy sirve este árbol en la raíz del subdominio
 * `mcp.` (`/` → `/conector`, `/herramientas` → `/conector/herramientas`), y
 * deja `/mcp` para el conector (`app/api/mcp`).
 *
 * Mismo molde visual que el sitio público (`app/(marketing)`: tipografía,
 * colores, contenedor), con una cabecera mínima. Ninguna página de aquí llama a
 * la base de datos: es contenido que sale del registro de herramientas.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoZero } from '@/components/marca-zero';
import { CONECTOR } from '@/lib/agentes/contenido';
import { SITIO_PUBLICO } from '@/lib/config/enlaces';
import { CONTACTO_SOPORTE, MCP_BASE, PAGINAS_DOCS } from '@/lib/mcp/conector';
import { Contenedor } from '../../(marketing)/_piezas';
import { NavegacionDocs } from './_nav';

export const metadata: Metadata = {
  /**
   * Base de todo enlace absoluto de los metadatos: sin ella `canonical`
   * saldría relativo al host por el que entró el robot, y esta documentación
   * es la misma en cualquiera de los alias del despliegue.
   */
  metadataBase: new URL(MCP_BASE),
  applicationName: 'Zero',
  authors: [{ name: 'Zero' }],
  publisher: 'Zero',
  openGraph: {
    type: 'website',
    siteName: 'Zero · Conector MCP',
    locale: 'es_DO',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-snippet': -1 },
  },
};

export default function LayoutDelConector({ children }: { children: React.ReactNode }) {
  return (
    // `sitio-publico` acota los estilos de foco de globals.css a las páginas
    // públicas: la aplicación tiene los suyos.
    // `overflow-x-clip` y NO `hidden`: `hidden` convierte este div en un
    // contenedor de scroll y la cabecera y el índice (`sticky`) dejan de
    // pegarse al desplazar la página.
    <div className="sitio-publico flex min-h-[100dvh] flex-col overflow-x-clip bg-white text-[#0f1118]">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-zero-600 focus:shadow-lg"
      >
        Saltar al contenido
      </a>

      {/* Fija solo desde `md`: en el teléfono son dos filas y fijarlas se comía un
          octavo de la pantalla mientras se lee. */}
      <header className="z-50 border-b border-[#edeff5] bg-white/90 backdrop-blur-[14px] md:sticky md:top-0">
        <Contenedor>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 md:h-[64px] md:flex-nowrap md:py-0">
            <Link href="/" aria-label="Conector MCP de Zero — inicio" className="flex shrink-0 items-center gap-2.5">
              <LogoZero alto={24} />
              <span className="rounded-md bg-[#edf1fe] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[.14em] text-zero-600">
                Conector MCP
              </span>
            </Link>

            <div className="order-3 w-full md:order-none md:w-auto md:flex-1">
              <NavegacionDocs />
            </div>

            <div className="ml-auto flex items-center gap-4 md:ml-0">
              <a
                href={CONECTOR.dondeSeCreaLaLlave}
                className="hidden whitespace-nowrap text-[13.5px] font-semibold text-[#3b4252] transition hover:text-zero-600 sm:inline"
              >
                Crear una llave
              </a>
              <a
                href={SITIO_PUBLICO}
                className="hidden whitespace-nowrap rounded-lg border border-[#dce3f2] px-3 py-1.5 text-[13px] font-semibold text-[#102a72] transition hover:border-zero-300 sm:inline-block"
              >
                zero.com.do
              </a>
            </div>
          </div>
        </Contenedor>
      </header>

      <main id="contenido" className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-[#edeff5] bg-[#f8faff]">
        <Contenedor className="py-10">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <LogoZero alto={22} />
              <p className="m-0 mt-3 max-w-[30ch] text-pretty text-[12.5px] leading-[1.6] text-[#666d80]">
                Zero es un producto de Yisrael Technology. Facturación electrónica, cobros, contabilidad,
                nómina y colegios en República Dominicana.
              </p>
            </div>
            <div>
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[.16em] text-[#666d80]">Documentación</p>
              <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 text-[13px]">
                {PAGINAS_DOCS.map((p) => (
                  <li key={p.ruta}>
                    <Link href={p.ruta} className="text-[#3b4252] hover:text-zero-600">{p.nombre}</Link>
                  </li>
                ))}
                <li><a href="/llms.txt" className="text-[#3b4252] hover:text-zero-600">llms.txt</a></li>
                <li><a href="/server.json" className="text-[#3b4252] hover:text-zero-600">server.json</a></li>
              </ul>
            </div>
            <div>
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[.16em] text-[#666d80]">Zero</p>
              <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 text-[13px]">
                <li><a href={`${SITIO_PUBLICO}/agentes`} className="text-[#3b4252] hover:text-zero-600">Zero para agentes de IA</a></li>
                <li><a href={`${SITIO_PUBLICO}/funciones`} className="text-[#3b4252] hover:text-zero-600">Todas las funciones</a></li>
                <li><a href={`${SITIO_PUBLICO}/terminos`} className="text-[#3b4252] hover:text-zero-600">Términos</a></li>
                <li><a href={`${SITIO_PUBLICO}/privacidad`} className="text-[#3b4252] hover:text-zero-600">Privacidad</a></li>
                <li><a href={`mailto:${CONTACTO_SOPORTE}`} className="text-[#3b4252] hover:text-zero-600">{CONTACTO_SOPORTE}</a></li>
              </ul>
            </div>
          </div>
        </Contenedor>
      </footer>
    </div>
  );
}
