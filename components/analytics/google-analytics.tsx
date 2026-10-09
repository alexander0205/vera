'use client';

/**
 * La etiqueta de Google Analytics.
 *
 * Se monta a mano en los marcos de la web pública —marketing, legales y
 * acceso— y NO en el layout raíz. Ponerla en la raíz mediría también el panel,
 * el punto de venta y las pantallas con token, y ahí las URLs llevan dentro el
 * identificador de un cliente, el de una factura o el secreto de un enlace de
 * pago. Ver `lib/config/analytics.ts`.
 *
 * Sin `NEXT_PUBLIC_GA_ID` puesta no devuelve nada: en desarrollo y en las
 * vistas previas no se carga ni un byte de Google, y las visitas de prueba no
 * ensucian el informe de verdad.
 */

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { GA_ID, GA_ID_INVALIDO, caminoMedible, rutaMedible } from '@/lib/config/analytics';

type Ventana = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

/**
 * Fuera del componente y no en un `useRef`: al pasar de `/precios` a
 * `/privacidad` se cambia de marco, este componente se desmonta y se vuelve a
 * montar, y un `ref` habría vuelto a configurar la etiqueta a mitad de visita.
 */
let configurada = false;

export function GoogleAnalytics() {
  const camino = usePathname();

  useEffect(() => {
    if (!GA_ID || !camino || !caminoMedible(camino)) return;

    const w = window as Ventana;
    w.dataLayer = w.dataLayer ?? [];
    // El mismo apaño del fragmento oficial de Google: `gtag` no es más que un
    // empujón a `dataLayer`. Se define aquí y no en un script suelto para no
    // depender de cuál de los dos llegó antes — gtag.js vacía la cola cuando
    // termina de cargar, venga de donde venga.
    if (typeof w.gtag !== 'function') {
      w.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        w.dataLayer!.push(arguments);
      };
    }

    if (!configurada) {
      configurada = true;
      w.gtag('js', new Date());
      // `send_page_view: false` porque la vista la mandamos nosotros: con la
      // navegación del App Router la página no se recarga, así que la cuenta
      // automática se quedaría en la primera pantalla de toda la sesión.
      w.gtag('config', GA_ID, { send_page_view: false });
    }

    const ruta = rutaMedible(camino, window.location.search);
    w.gtag('event', 'page_view', {
      page_path: ruta,
      page_location: `${window.location.origin}${ruta}`,
      page_title: document.title,
    });
  }, [camino]);

  useEffect(() => {
    if (GA_ID_INVALIDO) {
      console.warn(
        '[analytics] NEXT_PUBLIC_GA_ID está puesta pero no tiene forma de identificador de GA4 (G-XXXXXXXXXX). No se está midiendo nada.',
      );
    }
  }, []);

  if (!GA_ID) return null;

  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      strategy="afterInteractive"
    />
  );
}
