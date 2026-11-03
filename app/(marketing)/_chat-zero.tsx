/**
 * Chat con el agente de Zero en la web pública. Lo atiende el CRM: `widget.js`
 * crea el botón y un iframe con la conversación, y solo aparece si ese chat
 * está activo y este dominio está autorizado allá.
 *
 * Sin `NEXT_PUBLIC_ZERO_CHAT_CLAVE` no carga nada (desarrollo, vistas previas).
 * Se monta solo en este marco: el panel y las rutas con token no lo llevan.
 */

import Script from 'next/script';
import { ZERO_CHAT_CLAVE, ZERO_CHAT_ORIGEN } from '@/lib/config/enlaces';

export function ChatZero() {
  if (!ZERO_CHAT_CLAVE) return null;
  return <Script id="chat-zero" src={`${ZERO_CHAT_ORIGEN}/widget.js`} data-clave={ZERO_CHAT_CLAVE} strategy="lazyOnload" />;
}
