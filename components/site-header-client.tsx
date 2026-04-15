'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

interface Props {
  navLinks: { href: string; label: string }[];
  isLoggedIn: boolean;
}

export function SiteHeaderClient({ navLinks, isLoggedIn }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Botón hamburger */}
      <button
        className="md:hidden p-2 -mr-2 text-gray-600 hover:text-gray-900"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
      >
        {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {/* Panel móvil */}
      {open && (
        <div className="absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-lg md:hidden">
          <div className="px-4 py-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                {link.label}
              </Link>
            ))}

            <div className="pt-3 mt-3 border-t border-gray-100 space-y-2">
              {isLoggedIn ? (
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="block w-full text-center bg-teal-600 text-white text-sm font-medium px-4 py-2.5 rounded-full"
                >
                  Ir al dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/sign-in"
                    onClick={() => setOpen(false)}
                    className="block w-full text-center text-sm font-medium text-gray-700 px-4 py-2.5 rounded-full border border-gray-200"
                  >
                    Iniciar sesión
                  </Link>
                  <Link
                    href="/sign-up"
                    onClick={() => setOpen(false)}
                    className="block w-full text-center bg-teal-600 text-white text-sm font-medium px-4 py-2.5 rounded-full"
                  >
                    Empezar gratis →
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
