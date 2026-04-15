import Link from 'next/link';
import { getUser } from '@/lib/db/queries';
import { SiteHeaderClient } from './site-header-client';

const NAV_LINKS = [
  { href: '/#caracteristicas', label: 'Características' },
  { href: '/pricing',          label: 'Precios' },
  { href: '/#como-funciona',   label: 'Cómo funciona' },
  { href: '/#contacto',        label: 'Contacto' },
];

export async function SiteHeader() {
  const user = await getUser();
  const isLoggedIn = !!user;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200/60 bg-white/80 backdrop-blur-lg">
      {/* Top bar — estado de sesión */}
      <div className="bg-gray-900 text-gray-300 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-8">
          <span className="hidden sm:block">
            Facturación electrónica certificada por la DGII
          </span>
          <div className="flex items-center gap-4 ml-auto">
            {isLoggedIn ? (
              <>
                <span className="text-gray-400">
                  {user.email}
                </span>
                <Link
                  href="/dashboard"
                  className="text-white font-medium hover:text-teal-300 transition-colors"
                >
                  Ir al dashboard →
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="hover:text-white transition-colors"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/sign-up"
                  className="bg-teal-600 text-white px-3 py-0.5 rounded-full font-medium hover:bg-teal-500 transition-colors"
                >
                  Crear cuenta
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Nav principal */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-lg bg-teal-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">E</span>
            </div>
            <span className="text-xl font-bold text-gray-900">
              Emite<span className="text-teal-600">DO</span>
            </span>
          </Link>

          {/* Links — desktop */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* CTA — desktop */}
          <div className="hidden md:flex items-center gap-3">
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-5 py-2.5 rounded-full transition-colors"
              >
                Ir al dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/sign-up"
                  className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-5 py-2.5 rounded-full transition-colors"
                >
                  Empezar gratis →
                </Link>
              </>
            )}
          </div>

          {/* Hamburger — mobile (Client Component) */}
          <SiteHeaderClient navLinks={NAV_LINKS} isLoggedIn={isLoggedIn} />
        </div>
      </nav>
    </header>
  );
}
