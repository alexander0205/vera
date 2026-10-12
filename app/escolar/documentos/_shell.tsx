'use client';

import { usePathname } from 'next/navigation';
import { DocumentosNav } from './_nav';

/**
 * Decide si esta ruta lleva las pestañas (Requeridos/Formularios) o va a
 * pantalla completa.
 *
 * El editor (`/formularios/[id]/editor`) NO es una pestaña más: es una
 * herramienta aparte con su propia barra superior y su propio scroll interno
 * (ver FormularioBuilder), igual que el POS tiene su propio shell. Meterlo
 * dentro del `<section className="max-w-5xl p-6">` de las pestañas le
 * recortaría el ancho y le sumaría un padding que ya trae el suyo — y con dos
 * scrolls anidados, uno de ellos sobra.
 */
export function DocumentosShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const esEditor = /\/formularios\/[^/]+\/editor(\/|$)/.test(pathname);

  if (esEditor) {
    return <div className="h-full">{children}</div>;
  }

  return (
    <section className="mx-auto max-w-5xl space-y-5 p-6">
      <DocumentosNav />
      {children}
    </section>
  );
}
