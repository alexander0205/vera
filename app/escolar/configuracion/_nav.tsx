'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BellRing, Coins, DownloadCloud, Layers, Tag } from 'lucide-react';

/**
 * Sub-navegación de Configuración escolar, con rutas de verdad.
 *
 * Antes era estado de React y las cinco pestañas vivían en el mismo componente.
 * Eso tenía tres costes: no se podía enlazar a una pestaña, el botón de atrás
 * salía del módulo entero, y sobre todo cada pestaña montaba sus peticiones
 * aunque nadie la estuviera mirando — abrir Configuración pedía la estructura,
 * los conceptos, las tarifas Y el snapshot de SIGERD de una vez.
 *
 * Con rutas, cada pestaña solo carga lo suyo cuando se entra en ella.
 */

export const TABS = [
  { href: '/escolar/configuracion/estructura', label: 'Estructura', icon: Layers,
    hint: 'Períodos, servicios (tandas), grados y secciones.' },
  { href: '/escolar/configuracion/conceptos', label: 'Conceptos', icon: Tag,
    hint: 'Qué se cobra: tipo, ciclo de cobro y recordatorios.' },
  { href: '/escolar/configuracion/tarifas', label: 'Tarifas', icon: Coins,
    hint: 'Cuánto cuesta cada concepto por servicio, grado o sección.' },
  // "Documentos" se mudó a /escolar/documentos (menú principal, junto al
  // constructor de formularios): se usa mucho más seguido que el resto de
  // esta configuración y no tenía sentido dejarlo enterrado en una pestaña.
  { href: '/escolar/configuracion/avisos', label: 'Avisos', icon: BellRing,
    hint: 'Por dónde le escribe el colegio a los tutores: WhatsApp y SMS.' },
  // SIGERD vive aquí y no en el menú principal: traer datos del MINERD se hace
  // al montar el colegio y una vez al año, no a diario.
  { href: '/escolar/configuracion/sigerd', label: 'SIGERD', icon: DownloadCloud,
    hint: 'Traer del MINERD la estructura y los estudiantes.' },
];

export function ConfiguracionNav() {
  const pathname = usePathname();
  const activa = TABS.find((t) => pathname.startsWith(t.href)) ?? TABS[0];

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración escolar</h1>
        <p className="mt-1 text-sm text-gray-500">Solo administradores. {activa.hint}</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => {
          const on = t.href === activa.href;
          return (
            <Link key={t.href} href={t.href} prefetch
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                on ? 'border-zero-600 text-zero-700' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}
