/**
 * Pinta una página de la documentación del conector.
 *
 * El contenido no vive aquí: `lib/mcp/docs.ts` arma cada página como una lista
 * de secciones y bloques, y esto solo los dibuja. El gemelo en texto
 * (`aMarkdown`) recorre los mismos bloques, así que las dos versiones no se
 * separan. Las herramientas salen del registro (`lib/mcp/herramientas.ts`).
 */

import Link from 'next/link';
import { CONECTOR } from '@/lib/agentes/contenido';
import { CONECTOR_ACTUALIZADO } from '@/lib/mcp/conector';
import {
  fechaLarga, fichaDeHerramienta, type Bloque, type PaginaDoc, type Seccion,
} from '@/lib/mcp/docs';
import { notaDeParametro } from '@/lib/mcp/herramientas';
import { Contenedor } from '../../(marketing)/_piezas';
import { Antetitulo } from '../../(marketing)/_bloques';
import { BotonCopiar } from './_copiar';

// ─── Texto en línea ───────────────────────────────────────────────────────

const PARTES = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g;

/** `código`, [enlace](url) y **negrita**. Lo mismo que entiende el gemelo en Markdown. */
function Texto({ children }: { children: string }) {
  return (
    <>
      {children.split(PARTES).map((parte, i) => {
        if (parte.startsWith('`') && parte.endsWith('`') && parte.length > 1) {
          return <Mono key={i}>{parte.slice(1, -1)}</Mono>;
        }
        if (parte.startsWith('**') && parte.endsWith('**')) {
          return <strong key={i} className="font-semibold text-[#102a72]">{parte.slice(2, -2)}</strong>;
        }
        const enlace = parte.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (enlace) {
          const [, texto, href] = enlace;
          const clase = 'font-medium text-zero-600 underline underline-offset-2 hover:text-[#102a72]';
          // Rutas internas de la documentación: navegación de Next. El resto
          // (anclas, archivos, otros hosts) es un enlace normal.
          if (href.startsWith('/') && !/\.(md|txt|json)$/.test(href)) {
            return <Link key={i} href={href} className={clase}><Texto>{texto}</Texto></Link>;
          }
          return <a key={i} href={href} className={clase}><Texto>{texto}</Texto></a>;
        }
        return <span key={i}>{parte}</span>;
      })}
    </>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[#f1f4fb] px-1.5 py-0.5 font-mono text-[0.86em] text-[#102a72] [overflow-wrap:anywhere]">
      {children}
    </code>
  );
}

// ─── Bloques ──────────────────────────────────────────────────────────────

function Parrafo({ texto }: { texto: string }) {
  return <p className="m-0 text-pretty text-[15.5px] leading-[1.7] text-[#3b4252]"><Texto>{texto}</Texto></p>;
}

function Lista({ puntos }: { puntos: readonly string[] }) {
  return (
    <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-[15px] leading-[1.65] text-[#3b4252] marker:text-[#9aa3b8]">
      {puntos.map((p, i) => <li key={i}><Texto>{p}</Texto></li>)}
    </ul>
  );
}

function Pasos({ pasos }: { pasos: readonly { titulo: string; detalle: string }[] }) {
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
            <span className="mt-1 block text-pretty text-[13.5px] leading-[1.6] text-[#5c6373]">
              <Texto>{p.detalle}</Texto>
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Codigo({ codigo, lenguaje, etiqueta }: { codigo: string; lenguaje: string; etiqueta?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#1b2a55] bg-[#0f1b3d]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <span className="font-mono text-[11.5px] text-[#9fb0e6]">{etiqueta ?? lenguaje}</span>
        <BotonCopiar texto={codigo} />
      </div>
      <pre className="m-0 overflow-x-auto p-4 text-[12.5px] leading-[1.65] text-[#e6ecff]">
        <code>{codigo}</code>
      </pre>
    </div>
  );
}

function Tabla({ columnas, filas }: { columnas: readonly string[]; filas: readonly (readonly string[])[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e7edfb]">
      <table className="w-full border-collapse text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-[#eef1f8] bg-[#f7f9ff] text-[11px] uppercase tracking-[.1em] text-[#666d80]">
            {columnas.map((c) => <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-b border-[#f4f6fc] align-top last:border-0">
              {f.map((celda, j) => (
                <td key={j} className={`px-4 py-3 leading-[1.55] ${j === 0 ? 'text-[#102a72]' : 'text-[#3b4252]'}`}>
                  <Texto>{celda}</Texto>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TONOS = {
  dato: { caja: 'border-zero-600 bg-[#f5f8ff]', titulo: 'text-[#102a72]' },
  pronto: { caja: 'border-[#d99a1c] bg-[#fff9ec]', titulo: 'text-[#7a5200]' },
  cuidado: { caja: 'border-[#d4504a] bg-[#fff5f4]', titulo: 'text-[#8a2a26]' },
} as const;

function Aviso({ tono, titulo, texto }: Extract<Bloque, { t: 'aviso' }>) {
  const c = TONOS[tono];
  return (
    <div className={`rounded-xl border-l-[3px] px-5 py-4 ${c.caja}`}>
      {titulo && (
        <p className={`m-0 mb-1 font-[family-name:var(--font-display)] text-[13.5px] font-semibold tracking-[-.01em] ${c.titulo}`}>
          {titulo}
        </p>
      )}
      <p className="m-0 text-pretty text-[14.5px] leading-[1.6] text-[#2f3647]"><Texto>{texto}</Texto></p>
    </div>
  );
}

function Peticiones({ items }: { items: Extract<Bloque, { t: 'peticiones' }>['items'] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((i) => (
        <li key={i.herramienta} className="rounded-[15px] border border-[#e7edfb] bg-white p-4">
          <p className="m-0 font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-[-.015em] text-[#102a72]">
            «{i.peticion}»
          </p>
          <p className="m-0 mt-2 text-[13px] leading-[1.6] text-[#5c6373]">
            <Link href={`/herramientas#${i.herramienta}`} className="font-medium text-zero-600 underline underline-offset-2">
              <Mono>{i.herramienta}</Mono>
            </Link>{' '}
            con <Texto>{i.argumentos}</Texto>
          </p>
        </li>
      ))}
    </ul>
  );
}

function InsigniaDeNivel({ nivel }: { nivel: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cfe3d6] bg-[#f0faf3] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#1f6b3a]">
      <span aria-hidden className="size-1.5 rounded-full bg-[#2f9e58]" />
      {nivel}
    </span>
  );
}

function Herramienta({ nombre }: { nombre: string }) {
  const f = fichaDeHerramienta(nombre);
  return (
    <article id={nombre} className="scroll-mt-24 rounded-2xl border border-[#e7edfb] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="m-0 font-mono text-[16px] font-semibold text-[#102a72] [overflow-wrap:anywhere]">
          <a href={`#${nombre}`} className="hover:text-zero-600">{nombre}</a>
        </h3>
        <InsigniaDeNivel nivel={f.nivel} />
      </div>
      <p className="m-0 mt-1.5 text-[13px] font-medium text-[#666d80]">{f.h.titulo}</p>
      <p className="m-0 mt-3 text-pretty text-[14.5px] leading-[1.65] text-[#3b4252]"><Texto>{f.h.descripcion}</Texto></p>

      <p className="m-0 mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[.14em] text-[#666d80]">Parámetros</p>
      {f.parametros.length === 0 ? (
        <p className="m-0 text-[13.5px] text-[#5c6373]">No recibe parámetros.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e7edfb]">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#eef1f8] bg-[#f7f9ff] text-[10.5px] uppercase tracking-[.1em] text-[#666d80]">
                <th scope="col" className="px-3.5 py-2 font-semibold">Nombre</th>
                <th scope="col" className="px-3.5 py-2 font-semibold">Tipo</th>
                <th scope="col" className="px-3.5 py-2 font-semibold">Obligatorio</th>
                <th scope="col" className="px-3.5 py-2 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {f.parametros.map((p) => (
                <tr key={p.nombre} className="border-b border-[#f4f6fc] align-top last:border-0">
                  <td className="whitespace-nowrap px-3.5 py-2.5"><Mono>{p.nombre}</Mono></td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-[#3b4252]">{p.tipo}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-[#3b4252]">{p.obligatorio ? 'Sí' : 'No'}</td>
                  <td className="min-w-[14rem] px-3.5 py-2.5 leading-[1.5] text-[#3b4252]">{notaDeParametro(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="m-0 mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[.14em] text-[#666d80]">Ejemplo</p>
      <p className="m-0 text-[14.5px] font-medium leading-[1.5] text-[#102a72]">«{f.h.ejemplo.peticion}»</p>
      <div className="mt-2.5">
        <Codigo codigo={f.argumentos} lenguaje="json" etiqueta={`${nombre} · argumentos`} />
      </div>
      <p className="m-0 mt-3 text-[12.5px] text-[#666d80]">
        Por HTTP: <Mono>{f.h.http.metodo} {f.h.http.ruta}</Mono> sobre <Mono>{CONECTOR.rest}</Mono>
      </p>
    </article>
  );
}

function Bloques({ bloques }: { bloques: readonly Bloque[] }) {
  return (
    <>
      {bloques.map((b, i) => {
        switch (b.t) {
          case 'p': return <Parrafo key={i} texto={b.texto} />;
          case 'lista': return <Lista key={i} puntos={b.puntos} />;
          case 'pasos': return <Pasos key={i} pasos={b.pasos} />;
          case 'codigo': return <Codigo key={i} codigo={b.codigo} lenguaje={b.lenguaje} etiqueta={b.etiqueta} />;
          case 'tabla': return <Tabla key={i} columnas={b.columnas} filas={b.filas} />;
          case 'aviso': return <Aviso key={i} {...b} />;
          case 'peticiones': return <Peticiones key={i} items={b.items} />;
          case 'herramienta': return <Herramienta key={b.nombre} nombre={b.nombre} />;
          case 'subtitulo':
            return (
              <h3
                key={i}
                id={b.id}
                className="m-0 mt-2 scroll-mt-24 font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-[-.025em] text-[#102a72]"
              >
                {b.texto}
              </h3>
            );
        }
      })}
    </>
  );
}

// ─── Índice ───────────────────────────────────────────────────────────────

/** Las secciones y, bajo cada una, las herramientas que contiene. */
function entradasDelIndice(secciones: readonly Seccion[]) {
  return secciones.map((s) => ({
    id: s.id,
    titulo: s.titulo,
    hijos: s.bloques.filter((b): b is Extract<Bloque, { t: 'herramienta' }> => b.t === 'herramienta').map((b) => b.nombre),
  }));
}

function Indice({ secciones }: { secciones: readonly Seccion[] }) {
  const entradas = entradasDelIndice(secciones);
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[13px]">
      {entradas.map((e) => (
        <li key={e.id}>
          <a href={`#${e.id}`} className="block rounded-md px-2 py-1.5 font-medium text-[#3b4252] hover:bg-[#f4f7fe] hover:text-zero-600">
            {e.titulo}
          </a>
          {e.hijos.length > 0 && (
            <ul className="m-0 mb-1 flex list-none flex-col gap-0 p-0 pl-3">
              {e.hijos.map((h) => (
                <li key={h}>
                  <a href={`#${h}`} className="block truncate rounded-md px-2 py-1 font-mono text-[11.5px] text-[#666d80] hover:bg-[#f4f7fe] hover:text-zero-600">
                    {h}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─── La página ────────────────────────────────────────────────────────────

export function PaginaDocs({ pagina }: { pagina: PaginaDoc }) {
  return (
    <article>
      <section className="bg-[linear-gradient(180deg,#f4f8ff_0%,#ffffff_100%)]">
        <Contenedor className="pb-8 pt-12 sm:pt-14">
          <div className="max-w-[780px]">
            <Antetitulo>Conector MCP</Antetitulo>
            <h1 className="m-0 mt-4 font-[family-name:var(--font-display)] text-[clamp(1.9rem,4.6vw,2.75rem)] font-semibold leading-[1.08] tracking-[-.04em] text-balance text-[#102a72]">
              {pagina.titulo}
            </h1>
            <p className="m-0 mt-5 text-pretty text-[17px] leading-[1.6] text-[#4a5164]">{pagina.bajada}</p>
            <p className="m-0 mt-5 text-[12.5px] text-[#666d80]">
              Actualizada el {fechaLarga(CONECTOR_ACTUALIZADO)} ·{' '}
              <a href={pagina.md} className="text-zero-600 underline underline-offset-2">Esta página en texto</a> ·{' '}
              <a href="/llms.txt" className="text-zero-600 underline underline-offset-2">llms.txt</a>
            </p>
          </div>
        </Contenedor>
      </section>

      <Contenedor className="pt-8">
        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
          <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto">
            <details className="rounded-xl border border-[#e7edfb] bg-white lg:hidden">
              <summary className="cursor-pointer list-none px-4 py-3 text-[13.5px] font-semibold text-[#102a72]">
                En esta página
              </summary>
              <div className="border-t border-[#eef1f8] p-2"><Indice secciones={pagina.secciones} /></div>
            </details>
            <div className="hidden lg:block">
              <p className="m-0 mb-2 px-2 text-[11px] font-semibold uppercase tracking-[.16em] text-[#666d80]">En esta página</p>
              <Indice secciones={pagina.secciones} />
            </div>
          </aside>

          <div className="mt-8 flex min-w-0 max-w-[780px] flex-col gap-12 lg:mt-0">
            {pagina.secciones.map((s) => (
              <section key={s.id} id={s.id} className="flex scroll-mt-24 flex-col gap-4">
                <h2 className="m-0 font-[family-name:var(--font-display)] text-[clamp(1.25rem,2.8vw,1.55rem)] font-semibold leading-[1.2] tracking-[-.035em] text-balance text-[#102a72]">
                  {s.titulo}
                </h2>
                <Bloques bloques={s.bloques} />
              </section>
            ))}
          </div>
        </div>
      </Contenedor>
    </article>
  );
}
