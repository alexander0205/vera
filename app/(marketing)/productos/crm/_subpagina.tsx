/**
 * El molde de las subpáginas de Zero CRM, y las piezas que comparten con la
 * página principal: la navegación por partes, la leyenda de estados y las
 * tarjetas que llevan a cada subpágina.
 *
 * El contenido sale de `lib/agentes/crm.ts`. Aquí solo se decide cómo se ve.
 *
 * Todo se pinta en el HTML inicial y a la vista: es lo que hace que una persona,
 * un buscador y un asistente lean lo mismo. Por eso el estado de cada función va
 * escrito en palabras y no solo en un color, y por eso aquí no hay acordeones.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { urlDelSitio } from '@/lib/config/enlaces';
import { PAGINAS_CRM, CRM_ACTUALIZADA, RUTA_CRM, type ClaveCrm } from '@/lib/agentes/crm-rutas';
import { ESTADOS, fechaCrm, subpaginaCrm, type EstadoCrm } from '@/lib/agentes/crm';
import { DatosDePagina, DatosDeRuta } from '../../_datos-estructurados';
import { Contenedor, Flecha } from '../../_piezas';
import { Antetitulo, Encabezado, Titulo } from '../../_bloques';
import { CierreProducto, HeroProducto } from '../../_producto';

const COLOR_ESTADO: Record<EstadoCrm, string> = {
  disponible: 'bg-[#e7f6ee] text-[#0f6b3f]',
  activa: 'bg-[#edf1fe] text-[#2a45c4]',
  implementar: 'bg-[#fdf3dd] text-[#7a5000]',
  medida: 'bg-[#f1f3f8] text-[#4a5164]',
};

/** El estado de una función, en palabras. */
export function EtiquetaEstado({ estado }: { estado: EstadoCrm }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-[10.5px] font-semibold leading-none ${COLOR_ESTADO[estado]}`}>
      {ESTADOS[estado].nombre}
    </span>
  );
}

/** Qué quiere decir cada estado. Va en todas las páginas: sin esto, la etiqueta no dice nada. */
export function LeyendaEstados() {
  return (
    <dl className="m-0 grid grid-cols-1 gap-3 rounded-2xl border border-[#e7edfb] bg-[#f5f8ff] p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
      {(Object.keys(ESTADOS) as EstadoCrm[]).map(e => (
        <div key={e} className="min-w-0">
          <dt className="m-0"><EtiquetaEstado estado={e} /></dt>
          <dd className="m-0 mt-2 text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">{ESTADOS[e].detalle}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * La navegación del CRM: el resumen y cada subpágina.
 *
 * No es pegajosa a propósito: bajo la cabecera fija se comería las anclas de la
 * página principal, que ya calculan su margen contando solo con la cabecera.
 */
export function NavCrm({ actual }: { actual: string }) {
  const enlaces = [{ ruta: RUTA_CRM, menu: 'Resumen' }, ...PAGINAS_CRM];
  return (
    <nav aria-label="Secciones de Zero CRM" className="mt-8 border-y border-[#edeff5] bg-white sm:mt-10">
      <Contenedor>
        {/* En el teléfono se desliza; en escritorio caben todas, partidas en dos filas si hace falta. */}
        <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0 py-2.5 lg:flex-wrap lg:overflow-visible">
          {enlaces.map(e => {
            const activo = e.ruta === actual;
            return (
              <li key={e.ruta} className="shrink-0">
                <Link
                  href={e.ruta}
                  aria-current={activo ? 'page' : undefined}
                  className={`block whitespace-nowrap rounded-[10px] px-3 py-2 text-[12.5px] transition ${
                    activo ? 'bg-[#edf1fe] font-semibold text-zero-600' : 'font-medium text-[#3b4252] hover:bg-[#f4f7fe] hover:text-zero-600'
                  }`}
                >
                  {e.menu}
                </Link>
              </li>
            );
          })}
        </ul>
      </Contenedor>
    </nav>
  );
}

/** Las tarjetas que llevan a las subpáginas, con lo que se encuentra en cada una. */
export function TarjetasCrm({ excluir }: { excluir?: ClaveCrm }) {
  return (
    <ul className="m-0 grid min-w-0 list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {PAGINAS_CRM.filter(p => p.clave !== excluir).map(p => (
        <li key={p.clave} className="min-w-0">
          <Link
            href={p.ruta}
            className="flex h-full flex-col rounded-[15px] border border-[#e7edfb] bg-white p-5 transition hover:-translate-y-0.5 hover:border-zero-200 hover:shadow-[0_22px_40px_-28px_rgba(16,42,114,.45)]"
          >
            <span className="flex items-center justify-between gap-3 font-[family-name:var(--font-display)] text-[14.5px] font-semibold tracking-[-.015em] text-[#102a72]">
              {p.menu}
              <Flecha tamano={13} className="shrink-0 text-zero-600" />
            </span>
            <span className="mt-1.5 block text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">{p.resumen}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** El `<title>` completo de una subpágina. Va entero (sin la plantilla « · Zero») y no pasa de 60 caracteres. */
export const tituloDeSubpagina = (clave: ClaveCrm) => `${subpaginaCrm(clave).tituloSeo} · Zero CRM`;

/** `metadata` de una subpágina: título, descripción, canónica, su gemelo en texto y su imagen para compartir. */
export function metadataDeSubpagina(clave: ClaveCrm): Metadata {
  const p = subpaginaCrm(clave);
  const titulo = tituloDeSubpagina(clave);
  const imagen = { url: `/og/crm/${clave}`, width: 1200, height: 630, alt: `${p.menu} · Zero CRM` };
  return {
    title: { absolute: titulo },
    description: p.descripcion,
    keywords: [...p.palabras],
    alternates: {
      canonical: p.ruta,
      // El gemelo en texto de ESTA página: la versión que le cuesta menos leer a un asistente.
      types: { 'text/markdown': `${p.ruta}.md` },
    },
    openGraph: {
      type: 'website',
      url: urlDelSitio(p.ruta),
      title: titulo,
      description: p.descripcion,
      images: [imagen],
    },
    twitter: { card: 'summary_large_image', title: titulo, description: p.descripcion, images: [imagen.url] },
  };
}

function Migas({ titulo }: { titulo: string }) {
  return (
    <nav aria-label="Ruta" className="bg-[#f4f8ff]">
      <Contenedor>
        <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0 pt-5 text-[12px] text-[#5c6373]">
          <li><Link href="/" className="transition hover:text-zero-600">Inicio</Link></li>
          <li aria-hidden>›</li>
          <li><Link href={RUTA_CRM} className="transition hover:text-zero-600">Zero CRM</Link></li>
          <li aria-hidden>›</li>
          <li aria-current="page" className="font-medium text-[#3b4252]">{titulo}</li>
        </ol>
      </Contenedor>
    </nav>
  );
}

/**
 * Una subpágina completa. `children` reemplaza los grupos de funciones: lo usa la
 * de preguntas frecuentes, que no es una lista de funciones. `modulo` es el
 * ejemplo que se toca, y va antes de la lista para que se vea sin bajar.
 */
export function Subpagina({ clave, modulo, children }: { clave: ClaveCrm; modulo?: React.ReactNode; children?: React.ReactNode }) {
  const p = subpaginaCrm(clave);

  return (
    <>
      <Migas titulo={p.menu} />
      <HeroProducto
        antetitulo="Zero CRM"
        titulo={p.encabezado}
        bajada={p.bajada}
        captura={p.captura?.src}
        alt={p.captura?.alt}
        accion="Pedir una demostración"
        href="/contacto?perfil=pyme"
      />
      <NavCrm actual={p.ruta} />

      <section aria-label="Qué significa cada estado">
        <Contenedor className="pt-10 sm:pt-12">
          <LeyendaEstados />
          <p className="m-0 mt-3 text-[12px] text-[#666d80]">
            Actualizada el <time dateTime={CRM_ACTUALIZADA}>{fechaCrm()}</time>.{' '}
            <a href={`${p.ruta}.md`} className="underline transition hover:text-zero-600">Versión en texto</a>.
          </p>
        </Contenedor>
      </section>

      {modulo && (
        <section aria-label={`Pruébalo: ${p.menu}`}>
          <Contenedor className="pt-14 sm:pt-[68px]">
            <Antetitulo>Pruébalo</Antetitulo>
            <Titulo className="mt-3.5">Así se ve, con datos ficticios.</Titulo>
            <div className="mt-7">{modulo}</div>
          </Contenedor>
        </section>
      )}

      {children ?? p.grupos.map(g => (
        <section key={g.titulo}>
          <Contenedor className="pt-14 sm:pt-[68px]">
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,.72fr)_minmax(0,2fr)] lg:gap-12">
              <Encabezado antetitulo={p.menu} titulo={g.titulo} detalle={g.detalle} />
              <ul className="m-0 grid min-w-0 list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
                {g.funciones.map(f => (
                  <li key={f.titulo} className="min-w-0 rounded-[15px] border border-[#e7edfb] bg-white p-5">
                    <h3 className="m-0 text-pretty font-[family-name:var(--font-display)] text-[14.5px] font-semibold tracking-[-.015em] text-[#102a72]">
                      {f.titulo}
                    </h3>
                    <p className="m-0 mt-1.5 text-pretty text-[12.5px] leading-[1.55] text-[#5c6373]">{f.detalle}</p>
                    <p className="m-0 mt-3"><EtiquetaEstado estado={f.estado} /></p>
                  </li>
                ))}
              </ul>
            </div>
          </Contenedor>
        </section>
      ))}

      {p.notas?.map(n => (
        <section key={n.titulo}>
          <Contenedor className="pt-10 sm:pt-12">
            <div className="rounded-2xl border border-[#e7edfb] bg-[#f5f8ff] p-6 sm:p-7">
              <h2 className="m-0 font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-[-.02em] text-[#102a72]">
                {n.titulo}
              </h2>
              <p className="m-0 mt-2.5 max-w-[820px] text-pretty text-[14px] leading-[1.6] text-[#3b4252]">{n.texto}</p>
              {n.enlace && (
                <a
                  href={n.enlace.href}
                  className="mt-3.5 inline-flex items-center gap-2 text-[13.5px] font-semibold text-zero-600 transition hover:text-[#102a72]"
                >
                  {n.enlace.texto}
                  <Flecha tamano={14} />
                </a>
              )}
            </div>
          </Contenedor>
        </section>
      ))}

      {/* Las demás partes: un visitante que llega aquí desde un buscador no vio el resumen. */}
      <section>
        <Contenedor className="pt-16 sm:pt-[82px]">
          <Antetitulo>Zero CRM</Antetitulo>
          <Titulo className="mt-3.5">Las demás partes.</Titulo>
          <div className="mt-7"><TarjetasCrm excluir={clave} /></div>
        </Contenedor>
      </section>

      <CierreProducto
        antetitulo="Zero CRM"
        titulo="Te lo enseñamos con tus mensajes."
        detalle="El precio se arma con tu volumen y lo que haya que conectar. Escríbenos y vemos qué hay que encender para tu caso."
        nota={{
          titulo: 'Lo que hace falta de tu lado',
          detalle: 'Un número de WhatsApp de empresa y media hora para contarnos cómo atiendes hoy.',
        }}
        accion="Pedir una demostración"
        href="/contacto?perfil=pyme"
      />

      <DatosDePagina
        titulo={p.tituloSeo}
        descripcion={p.descripcion}
        ruta={p.ruta}
        actualizada={CRM_ACTUALIZADA}
        producto={{ nombre: 'Zero CRM', ruta: RUTA_CRM }}
      />
      <DatosDeRuta migas={[{ nombre: 'Zero CRM', ruta: RUTA_CRM }, { nombre: p.menu, ruta: p.ruta }]} />
    </>
  );
}
