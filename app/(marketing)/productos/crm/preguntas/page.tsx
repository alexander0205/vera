import { PREGUNTAS_CRM } from '@/lib/agentes/crm';
import { DatosDePreguntas } from '../../../_datos-estructurados';
import { Contenedor } from '../../../_piezas';
import { metadataDeSubpagina, Subpagina } from '../_subpagina';

export const metadata = metadataDeSubpagina('preguntas');

/**
 * Las preguntas abiertas todas, y no en acordeón: aquí el visitante vino a leer
 * las respuestas, y así no queda duda de que lo declarado en `FAQPage` es lo mismo
 * que se ve en la página.
 */
export default function Pagina() {
  return (
    <Subpagina clave="preguntas">
      <section>
        <Contenedor className="pt-12 sm:pt-14">
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2">
            {PREGUNTAS_CRM.map(q => (
              <li key={q.pregunta} className="min-w-0 rounded-[15px] border border-[#e7edfb] bg-white p-5 sm:p-6">
                <h2 className="m-0 text-pretty font-[family-name:var(--font-display)] text-[16px] font-semibold tracking-[-.02em] text-[#102a72]">
                  {q.pregunta}
                </h2>
                <p className="m-0 mt-2 text-pretty text-[13.5px] leading-[1.6] text-[#5c6373]">{q.respuesta}</p>
              </li>
            ))}
          </ul>
        </Contenedor>
      </section>
      <DatosDePreguntas preguntas={PREGUNTAS_CRM} />
    </Subpagina>
  );
}
