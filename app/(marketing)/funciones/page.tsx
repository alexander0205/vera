import type { Metadata } from 'next';
import { urlDelSitio } from '@/lib/config/enlaces';
import { ADDONS } from '@/lib/config/plans';
import {
  FUNCIONES_ACTUALIZADA, MODULOS, RUTA_FUNCIONES, filasDePlanes, preguntasDeFunciones,
  productosAparte, reglasDeSuscripcion, tiposDeComprobante,
} from '@/lib/agentes/funciones';
import { RUTA_AGENTES, RUTA_FUNCIONES_MD } from '@/lib/agentes/contenido';
import { Contenedor } from '../_piezas';
import { Antetitulo, BotonPrimario, BotonSecundario } from '../_bloques';
import { Apartado, Parrafo } from '../_guia';
import { Acordeon } from '../_acordeon';
import { DatosDeArticulo, DatosDePreguntas, DatosDeRuta } from '../_datos-estructurados';
import { ListaLlana, TablaDeTexto } from '../_texto';

/**
 * `/funciones` — todo lo que hace Zero, módulo por módulo.
 *
 * Las páginas de producto venden; esta enumera. Es la que se consulta —una
 * persona o un asistente— para saber si Zero hace algo en concreto, y por eso
 * cada módulo trae también lo que NO hace.
 *
 * El contenido sale de `lib/agentes/funciones.ts`, lo mismo que
 * `/funciones.md`. Los precios y los tipos de comprobante se leen del catálogo
 * del sistema, no de un texto.
 */

const TITULO = 'Todo lo que hace Zero';
const BAJADA =
  'Zero reúne facturación electrónica ante la DGII, cuentas por cobrar, inventario, compras, contabilidad, reportes fiscales, punto de venta, nómina y administración de colegios. Aquí está cada función, módulo por módulo, y también lo que no hace.';

export const metadata: Metadata = {
  title: TITULO,
  description: BAJADA,
  keywords: [
    'funciones de Zero', 'qué hace Zero ERP', 'sistema de facturación electrónica República Dominicana',
    'ERP dominicano funciones', 'software para colegios República Dominicana', 'sistema de nómina TSS',
  ],
  alternates: {
    canonical: RUTA_FUNCIONES,
    types: { 'text/markdown': RUTA_FUNCIONES_MD },
  },
  openGraph: {
    type: 'article',
    url: urlDelSitio(RUTA_FUNCIONES),
    title: TITULO,
    description: 'Cada función del sistema, módulo por módulo, con lo que no hace.',
  },
};

export default function PaginaFunciones() {
  const [anio, mes, dia] = FUNCIONES_ACTUALIZADA.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia).toLocaleDateString('es-DO', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const planes = filasDePlanes();
  const aparte = productosAparte();
  const preguntas = preguntasDeFunciones();

  return (
    <>
      <article>
        <section className="bg-[linear-gradient(180deg,#f4f8ff_0%,#ffffff_100%)]">
          <Contenedor className="pt-14 sm:pt-[60px]">
            <div className="mx-auto max-w-[760px]">
              <Antetitulo>Funciones</Antetitulo>
              <h1 className="m-0 mt-4 font-[family-name:var(--font-display)] text-[clamp(1.9rem,4.6vw,2.75rem)] font-semibold leading-[1.08] tracking-[-.04em] text-balance text-[#102a72]">
                {TITULO}
              </h1>
              <p className="m-0 mt-5 text-pretty text-[17px] leading-[1.6] text-[#4a5164]">{BAJADA}</p>
              <p className="m-0 mt-5 text-[12.5px] text-[#666d80]">
                Revisado contra el sistema el {fecha} ·{' '}
                <a href={RUTA_FUNCIONES_MD} className="text-zero-600 underline underline-offset-2">Esta página en texto</a> ·{' '}
                <a href={RUTA_AGENTES} className="text-zero-600 underline underline-offset-2">Para agentes de IA</a>
              </p>
            </div>
          </Contenedor>
        </section>

        <Contenedor className="pt-10">
          <div className="mx-auto flex max-w-[760px] flex-col gap-7">
            <Apartado titulo="¿Qué módulos tiene Zero?">
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px] leading-[1.6] text-[#3b4252]">
                {MODULOS.map((m) => (
                  <li key={m.id}>
                    <a href={`#${m.id}`} className="font-semibold text-zero-600 underline underline-offset-2">{m.nombre}</a>
                    <span className="text-[#5c6373]">: {m.resumen}</span>
                  </li>
                ))}
              </ul>
            </Apartado>

            {MODULOS.map((m) => (
              <section key={m.id} id={m.id} className="flex scroll-mt-24 flex-col gap-4">
                <h2 className="m-0 mt-2 font-[family-name:var(--font-display)] text-[clamp(1.25rem,2.8vw,1.55rem)] font-semibold leading-[1.2] tracking-[-.035em] text-balance text-[#102a72]">
                  {m.nombre}
                </h2>
                <Parrafo>{m.resumen}</Parrafo>
                {/* Lista llana y no la de cheques: son ciento y pico de líneas, y un
                    icono por línea triplicaba el peso de la página sin decir nada. */}
                <ListaLlana puntos={m.hace} />
                {m.noHace && m.noHace.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="m-0 text-[12px] font-semibold uppercase tracking-[.14em] text-[#666d80]">No hace</p>
                    <ListaLlana puntos={m.noHace} />
                  </div>
                )}
                {m.nota && (
                  <p className="m-0 text-[13.5px] leading-[1.6] text-[#5c6373]">
                    <span className="font-semibold text-[#3b4252]">Ten en cuenta:</span> {m.nota}
                  </p>
                )}
                <p className="m-0 text-[13.5px] leading-[1.6] text-[#5c6373]">
                  <span className="font-semibold text-[#3b4252]">Viene en:</span> {m.viene}
                </p>
              </section>
            ))}

            <Apartado titulo="¿Qué comprobantes fiscales emite Zero?">
              <TablaDeTexto
                columnas={['Código', 'Comprobante']}
                filas={tiposDeComprobante().map(([codigo, nombre]) => [codigo, nombre])}
              />
            </Apartado>

            <Apartado titulo="¿Cuánto cuesta Zero?">
              <TablaDeTexto
                columnas={['Producto', 'Plan', 'Precio', 'Comprobantes', 'Usuarios', 'Estudiantes']}
                filas={planes.map((p) => [p.linea, p.plan, p.precio, p.comprobantes, p.usuarios, p.estudiantes])}
              />
              <Parrafo>Adicionales:</Parrafo>
              <ListaLlana puntos={ADDONS.map((a) => `${a.name}: +US$${a.price} al mes. ${a.descripcion}`)} />
              {aparte.length > 0 && (
                <>
                  <Parrafo>Se contratan aparte, con precio bajo cotización:</Parrafo>
                  <ListaLlana puntos={aparte.map((p) => `${p.nombre}: ${p.descripcion}`)} />
                </>
              )}
            </Apartado>

            <Apartado titulo="¿Cómo funciona la prueba y la suscripción?">
              <ListaLlana puntos={reglasDeSuscripcion()} />
            </Apartado>
          </div>
        </Contenedor>

        <Contenedor className="pt-12">
          <div className="mx-auto max-w-[760px]">
            <h2 className="m-0 font-[family-name:var(--font-display)] text-[clamp(1.3rem,3vw,1.6rem)] font-semibold tracking-[-.035em] text-[#102a72]">
              Preguntas frecuentes
            </h2>
            <div className="mt-4">
              <Acordeon preguntas={preguntas} />
            </div>
          </div>
        </Contenedor>

        <Contenedor className="pb-4 pt-12">
          <div className="mx-auto max-w-[760px] rounded-2xl border border-[#e7edfb] bg-[#f5f8ff] p-6 sm:p-8">
            <p className="m-0 font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-[-.025em] text-[#102a72]">
              Pruébalo con tu empresa
            </p>
            <p className="m-0 mt-2.5 text-pretty text-[14px] leading-[1.6] text-[#5c6373]">
              {reglasDeSuscripcion()[0]}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <BotonPrimario href="/sign-up">Empezar la prueba</BotonPrimario>
              <BotonSecundario href="/precios">Ver los planes</BotonSecundario>
            </div>
          </div>
        </Contenedor>
      </article>

      <DatosDeArticulo titulo={TITULO} descripcion={BAJADA} ruta={RUTA_FUNCIONES} actualizada={FUNCIONES_ACTUALIZADA} />
      <DatosDeRuta migas={[{ nombre: 'Funciones', ruta: RUTA_FUNCIONES }]} />
      <DatosDePreguntas preguntas={preguntas} />
    </>
  );
}
