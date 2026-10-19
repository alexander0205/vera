'use client';

/**
 * Microsoft Clarity: mapas de calor, hasta dónde baja cada página, clics de
 * rabia y grabaciones de sesión de la web pública. Es lo que Google Analytics
 * no da: no cuántos, sino QUÉ hizo la persona antes de irse.
 *
 * Mismas reglas que la etiqueta de Google:
 *  - Solo en los marcos de la web pública (marketing, legales y acceso),
 *    nunca en el panel ni en una pantalla con token (`caminoMedible`).
 *  - Sin `NEXT_PUBLIC_CLARITY_ID` no carga nada (desarrollo, vistas previas).
 *  - Las pantallas de acceso se graban con el texto enmascarado
 *    (`data-clarity-mask` en su marco): se ve dónde se hace clic, no lo que
 *    se escribe.
 */

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { CLARITY_ID, caminoMedible } from '@/lib/config/analytics';

/**
 * Clarity guarda la URL completa de cada página, query incluida, y estas dos
 * llevan un secreto en la query (`?token=` y `?t=`). Ahí no se carga. Las dos
 * se abren desde fuera (un correo, la vuelta de Google), así que no hay una
 * sesión de Clarity ya abierta que las arrastre.
 */
const CON_SECRETO_EN_QUERY = /^\/(reset-password|completar-registro)(\/|$)/;

export function MicrosoftClarity() {
  const camino = usePathname();
  if (!CLARITY_ID || !camino || !caminoMedible(camino) || CON_SECRETO_EN_QUERY.test(camino)) return null;
  return (
    <Script id="microsoft-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${JSON.stringify(CLARITY_ID)});`}
    </Script>
  );
}
