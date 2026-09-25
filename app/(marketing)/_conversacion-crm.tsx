/**
 * El CRM en la portada: una conversación, no una captura.
 *
 * La tarjeta llevaba una captura del panel del CRM hecha sobre la plantilla de
 * admisiones de un colegio real —con su nombre y el del administrador— en una
 * portada que le habla a cualquier negocio. Una conversación dice mejor qué
 * hace el agente, y se escribe con datos de la empresa de demostración: la
 * factura del Colmado La Esquina es la misma que sale en su cartera.
 *
 * Lo que se afirma es lo que ya afirma la página del CRM (su demo «Un
 * balance»): verificar identidad, decir el saldo y mandar el enlace de pago.
 */

type Linea =
  | { de: 'cliente' | 'agente'; texto: string; hora: string }
  | { de: 'sistema'; texto: string };

const CONVERSACION: Linea[] = [
  { de: 'cliente', texto: 'Buenas, ¿cuánto le debo y hasta cuándo tengo?', hora: '9:14 a. m.' },
  { de: 'sistema', texto: 'Verificó la identidad contra la ficha del cliente' },
  {
    de: 'agente',
    texto: 'Hola, don Rafael. Tiene RD$17,716.60 de la factura del 19 de septiembre, que vence el 19 de octubre. ¿Le mando el enlace para pagarla con tarjeta?',
    hora: '9:14 a. m.',
  },
  { de: 'cliente', texto: 'Sí, mándamelo.', hora: '9:15 a. m.' },
  { de: 'sistema', texto: 'Enlace de pago enviado · al pagar, el cobro se registra solo' },
];

export function ConversacionCrm() {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-[#e2e8f7] bg-[#f7f9ff] shadow-[0_26px_50px_-30px_rgba(16,42,114,.5)]">
      <div className="flex items-center gap-2.5 border-b border-[#e7edfb] bg-white px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e6f7ee] text-[11px] font-bold text-[#12925a]">LE</span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold text-[#102a72]">Colmado La Esquina</span>
          <span className="block text-[11px] text-[#666d80]">WhatsApp</span>
        </span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#edf1fe] px-2.5 py-1 text-[10.5px] font-semibold text-zero-600">
          <span aria-hidden className="size-1.5 rounded-full bg-zero-600" />
          Agente de IA
        </span>
      </div>

      <ol className="m-0 flex list-none flex-col gap-2.5 p-4">
        {CONVERSACION.map((l, i) =>
          l.de === 'sistema' ? (
            <li key={i} className="flex justify-center">
              <span className="rounded-full border border-dashed border-[#cdd6ee] bg-white px-3 py-1 text-center text-[10.5px] text-[#4a5164]">
                {l.texto}
              </span>
            </li>
          ) : (
            <li key={i} className={`flex ${l.de === 'agente' ? 'justify-end' : 'justify-start'}`}>
              <span
                className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-[1.5] ${
                  l.de === 'agente'
                    ? 'rounded-br-md bg-zero-600 text-white'
                    : 'rounded-bl-md border border-[#e3e7f2] bg-white text-[#102a72]'
                }`}
              >
                {l.texto}
                <span className={`mt-1 block text-right text-[10px] ${l.de === 'agente' ? 'text-white/70' : 'text-[#666d80]'}`}>
                  {l.hora}
                </span>
              </span>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
