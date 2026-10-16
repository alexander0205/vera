/**
 * Marco de las pantallas de acceso — entrar, registrarse, recuperar la
 * contraseña, verificar el correo.
 *
 * Existe SOLO para colgar de él la medición: no pinta nada, cada pantalla trae
 * su propia composición. Antes estas páginas colgaban directamente del layout
 * raíz, y la alternativa era subir la etiqueta ahí, que es justo lo que no se
 * quiere: el raíz también envuelve el panel, el punto de venta y las pantallas
 * con token.
 *
 * Aquí sí importa medir, porque es donde termina el embudo: de la página de
 * precios al registro. Lo que no sale de aquí es el secreto que llevan dos de
 * estas pantallas en la query —`/reset-password?token=` y
 * `/completar-registro?t=`—, que la lista blanca de
 * `lib/config/analytics.ts` deja fuera.
 */

import { GoogleAnalytics } from '@/components/analytics/google-analytics';
import { CapturaOrigen } from '@/components/analytics/captura-origen';
import { MicrosoftClarity } from '@/components/analytics/microsoft-clarity';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* `data-clarity-mask`: Clarity graba dónde se hace clic en el acceso,
          pero no el texto de la pantalla ni lo que se escribe. `contents`
          para que el envoltorio no cambie el maquetado de ninguna pantalla. */}
      <div data-clarity-mask="True" className="contents">{children}</div>
      <GoogleAnalytics />
      <CapturaOrigen />
      <MicrosoftClarity />
    </>
  );
}
