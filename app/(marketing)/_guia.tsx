/**
 * El molde de una guía.
 *
 * Las guías existen por una razón concreta: un dominio nuevo no sale en Google
 * por «ERP República Dominicana» —eso lo pelean sitios con años—, pero sí sale
 * por «cuándo se presenta el 606» o «cómo se calcula la regalía pascual», que
 * es lo que la gente escribe de verdad. Y son las páginas que un asistente cita
 * cuando le preguntan eso mismo.
 *
 * Dos reglas al escribirlas:
 *
 *  - **Contestan la pregunta en el primer párrafo.** El que llega buscando una
 *    fecha quiere la fecha, no la historia del impuesto. Lo demás va debajo.
 *  - **No son publicidad disfrazada.** Se explica el trámite aunque el lector
 *    no use Zero; el producto aparece al final, donde corresponde. Una guía que
 *    no sirve sin comprar no la cita nadie.
 *
 * Las fechas y las cifras legales llevan su fuente al pie. Si mañana cambia la
 * ley, se corrige ahí.
 */

import Link from 'next/link';
import { Contenedor, Flecha, Cheque } from './_piezas';
import { Antetitulo, BotonPrimario, BotonSecundario } from './_bloques';
import { DatosDeArticulo, DatosDePreguntas, DatosDeRuta } from './_datos-estructurados';
import { Acordeon, type Pregunta } from './_acordeon';

export type Fuente = { texto: string; url: string };

export function Guia({
  slug, categoria, titulo, bajada, actualizada, minutos, children, preguntas, fuentes, cta,
}: {
  slug: string;
  categoria: string;
  titulo: string;
  /** La respuesta corta, en una o dos frases. Va antes que nada. */
  bajada: string;
  /** ISO. Se enseña y se declara en el dato estructurado. */
  actualizada: string;
  minutos: number;
  children: React.ReactNode;
  preguntas?: readonly Pregunta[];
  fuentes?: readonly Fuente[];
  cta: { titulo: string; detalle: string; href: string; accion: string };
}) {
  // `new Date('2026-09-24')` se interpreta en UTC, y en República Dominicana
  // —cuatro horas atrás— eso cae el día anterior: la guía salía «actualizada»
  // un día antes de la fecha que dice el código. Se arma la fecha a mano.
  const [anio, mes, dia] = actualizada.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia).toLocaleDateString('es-DO', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <>
      <article>
        <section className="bg-[linear-gradient(180deg,#f4f8ff_0%,#ffffff_100%)]">
          <Contenedor className="pt-14 sm:pt-[60px]">
            <div className="mx-auto max-w-[760px]">
              <Antetitulo>{categoria}</Antetitulo>
              <h1 className="m-0 mt-4 font-[family-name:var(--font-display)] text-[clamp(1.9rem,4.6vw,2.75rem)] font-semibold leading-[1.08] tracking-[-.04em] text-balance text-[#102a72]">
                {titulo}
              </h1>
              <p className="m-0 mt-5 text-pretty text-[17px] leading-[1.6] text-[#4a5164]">{bajada}</p>
              <p className="m-0 mt-5 text-[12.5px] text-[#8a90a0]">
                Actualizada el {fecha} · {minutos} min de lectura
              </p>
            </div>
          </Contenedor>
        </section>

        {/* El cuerpo. Medida de lectura corta a propósito: son guías, no
            folletos, y a 65 caracteres por línea se leen sin esfuerzo. */}
        <Contenedor className="pt-10">
          <div className="mx-auto flex max-w-[760px] flex-col gap-7">{children}</div>
        </Contenedor>

        {preguntas && preguntas.length > 0 && (
          <Contenedor className="pt-12">
            <div className="mx-auto max-w-[760px]">
              <h2 className="m-0 font-[family-name:var(--font-display)] text-[clamp(1.3rem,3vw,1.6rem)] font-semibold tracking-[-.035em] text-[#102a72]">
                Preguntas sueltas
              </h2>
              <div className="mt-4">
                <Acordeon preguntas={preguntas} />
              </div>
            </div>
          </Contenedor>
        )}

        {fuentes && fuentes.length > 0 && (
          <Contenedor className="pt-10">
            <div className="mx-auto max-w-[760px] border-t border-[#eef1f8] pt-5">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[.16em] text-[#8a90a0]">Fuentes</p>
              <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
                {fuentes.map(f => (
                  <li key={f.url}>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12.5px] text-zero-600 underline underline-offset-2"
                    >
                      {f.texto}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </Contenedor>
        )}

        <Contenedor className="pb-4 pt-12">
          <div className="mx-auto max-w-[760px] rounded-2xl border border-[#e7edfb] bg-[#f5f8ff] p-6 sm:p-8">
            <p className="m-0 font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-[-.025em] text-[#102a72]">
              {cta.titulo}
            </p>
            <p className="m-0 mt-2.5 text-pretty text-[14px] leading-[1.6] text-[#5c6373]">{cta.detalle}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <BotonPrimario href={cta.href}>{cta.accion}</BotonPrimario>
              <BotonSecundario href="/guias">Ver las demás guías</BotonSecundario>
            </div>
          </div>
        </Contenedor>
      </article>

      <DatosDeArticulo titulo={titulo} descripcion={bajada} ruta={`/guias/${slug}`} actualizada={actualizada} />
      <DatosDeRuta migas={[{ nombre: 'Guías', ruta: '/guias' }, { nombre: titulo, ruta: `/guias/${slug}` }]} />
      {preguntas && preguntas.length > 0 && <DatosDePreguntas preguntas={preguntas} />}
    </>
  );
}

// ─── Piezas del cuerpo ────────────────────────────────────────────────────────

export function Parrafo({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-pretty text-[15.5px] leading-[1.7] text-[#3b4252]">{children}</p>;
}

export function Apartado({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 mt-2 font-[family-name:var(--font-display)] text-[clamp(1.25rem,2.8vw,1.55rem)] font-semibold leading-[1.2] tracking-[-.035em] text-balance text-[#102a72]">
        {titulo}
      </h2>
      {children}
    </div>
  );
}

export function Lista({ puntos }: { puntos: readonly React.ReactNode[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {puntos.map((p, i) => (
        <li key={i} className="flex min-w-0 items-start gap-2.5 text-[15px] leading-[1.6] text-[#3b4252]">
          <Cheque tamano={13} color="#3658e1" grosor={3.2} />
          <span className="min-w-0">{p}</span>
        </li>
      ))}
    </ul>
  );
}

/** Los pasos de un trámite, numerados. */
export function Pasos({ pasos }: { pasos: readonly { titulo: string; detalle: string }[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {pasos.map((p, i) => (
        <li key={p.titulo} className="flex min-w-0 gap-3.5 rounded-[15px] border border-[#e7edfb] bg-white p-4">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#edf1fe] font-[family-name:var(--font-display)] text-[12.5px] font-semibold text-zero-600">
            {i + 1}
          </span>
          <span className="min-w-0">
            <span className="block font-[family-name:var(--font-display)] text-[14.5px] font-semibold tracking-[-.02em] text-[#102a72]">
              {p.titulo}
            </span>
            <span className="mt-1 block text-pretty text-[13.5px] leading-[1.55] text-[#5c6373]">{p.detalle}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** El dato que el lector vino a buscar, destacado. */
export function Dato({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 rounded-xl border-l-[3px] border-zero-600 bg-[#f5f8ff] px-5 py-4 text-pretty text-[15px] leading-[1.6] text-[#102a72]">
      {children}
    </p>
  );
}

/** Una tabla chica. Para tasas y plazos, que es donde se consultan. */
export function Tabla({
  columnas, filas,
}: {
  columnas: readonly string[];
  filas: readonly (readonly string[])[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e7edfb]">
      <table className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr className="border-b border-[#eef1f8] bg-[#f7f9ff] text-[11px] uppercase tracking-[.1em] text-[#8a90a0]">
            {columnas.map((c, i) => (
              <th key={c} className={`px-4 py-2.5 font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f[0]} className="border-b border-[#f4f6fc] last:border-0">
              {f.map((celda, i) => (
                <td
                  key={i}
                  className={`px-4 py-2.5 ${i === 0 ? 'text-[#102a72]' : 'text-right tabular-nums text-[#3b4252]'}`}
                >
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Enlace a otra guía o a una página de producto, dentro del texto. */
export function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 font-semibold text-zero-600 underline underline-offset-2">
      {children}
      <Flecha tamano={12} />
    </Link>
  );
}
