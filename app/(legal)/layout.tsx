/**
 * Marco de los documentos legales (/terminos y /privacidad).
 *
 * Van en su propio grupo de rutas y no dentro de (dashboard) por dos razones:
 * tienen que abrir SIN sesión —Google exige poder leerlos desde su formulario
 * de verificación, y quien todavía no se ha registrado necesita leerlos antes
 * de aceptar— y no llevan barra lateral ni cambiador de empresa, que aquí solo
 * serían ruido.
 *
 * Una sola columna estrecha: son documentos para leer, no un panel.
 */

import Link from 'next/link';
import { LogoZero } from '@/components/marca-zero';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-white">
      <header className="border-b border-gray-100">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" aria-label="Zero — inicio">
            <LogoZero alto={26} />
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium text-gray-500">
            <Link href="/terminos" className="transition hover:text-zero-600">Términos</Link>
            <Link href="/privacidad" className="transition hover:text-zero-600">Privacidad</Link>
          </nav>
        </div>
      </header>

      {/* `max-w-2xl` y no el ancho completo: la línea de texto larga es lo que
          hace que un documento así no se lea. */}
      <main className="mx-auto max-w-2xl px-6 py-14">{children}</main>

      <footer className="border-t border-gray-100">
        <div className="mx-auto max-w-3xl px-6 py-8 text-[13px] text-gray-400">
          © {new Date().getFullYear()} Zero · Yisrael Technology LLC
        </div>
      </footer>
    </div>
  );
}
