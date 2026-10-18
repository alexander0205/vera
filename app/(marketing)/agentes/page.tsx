import type { Metadata } from 'next';
import { urlDelSitio } from '@/lib/config/enlaces';
import {
  ACTUALIZADA, CONECTOR, DONDE_SE_PEGA, EJEMPLO_CONFIG, EJEMPLO_CURL, ERRORES, HERRAMIENTAS, HOY_PUEDE,
  PASOS_DE_CONEXION, PASOS_DEL_ALTA, PREGUNTAS, REGLAS, RUTA_AGENTES, RUTA_AGENTES_MD, RUTAS_REST,
  RUTA_FUNCIONES_MD, TODAVIA_NO, textoDeLaPrueba,
} from '@/lib/agentes/contenido';
import { Contenedor } from '../_piezas';
import { Antetitulo, BotonPrimario, BotonSecundario } from '../_bloques';
import { Apartado, Dato, Lista, Parrafo, Pasos } from '../_guia';
import { Acordeon } from '../_acordeon';
import { DatosDeArticulo, DatosDePreguntas, DatosDeRuta } from '../_datos-estructurados';
import { Codigo, ListaLlana, Mono, TablaDeTexto } from '../_texto';

/**
 * `/agentes` — lo que un agente de IA puede hacer con Zero.
 *
 * La lee una persona que quiere conectar su asistente, y la lee el asistente
 * cuando le preguntan «¿puedes usar Zero?». Por eso contesta arriba, con
 * títulos en forma de pregunta y sin adjetivos: lo que aquí se diga, un modelo
 * lo va a repetir como un hecho.
 *
 * El contenido NO vive en esta página: sale de `lib/agentes/contenido.ts`, que
 * es también de donde sale `/agentes.md`. Así las dos versiones no se separan.
 */

const TITULO = 'Zero para agentes de IA';
const BAJADA =
  'Un agente de IA puede hoy explicar Zero con datos exactos, guiar a una persona para crear su empresa y leer los datos de una empresa por un conector MCP. Todavía no puede crear ni cambiar nada.';

export const metadata: Metadata = {
  title: TITULO,
  description: BAJADA,
  keywords: [
    'Zero MCP', 'conector MCP facturación República Dominicana', 'agente de IA facturación electrónica',
    'ERP dominicano con IA', 'conectar ChatGPT a mi facturación', 'conectar Claude a mi ERP',
  ],
  alternates: {
    canonical: RUTA_AGENTES,
    // El gemelo en texto. Un agente que llegue a la página sabe por aquí dónde
    // está la versión que le cuesta menos leer.
    types: { 'text/markdown': RUTA_AGENTES_MD },
  },
  openGraph: {
    type: 'article',
    url: urlDelSitio(RUTA_AGENTES),
    title: TITULO,
    description: 'Qué puede hacer un asistente de IA con Zero, cómo se conecta y con qué reglas.',
  },
};

export default function PaginaAgentes() {
  // A mano y no con `new Date(iso)`: eso se lee en UTC y aquí cae un día antes.
  const [anio, mes, dia] = ACTUALIZADA.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia).toLocaleDateString('es-DO', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <>
      <article>
        <section className="bg-[linear-gradient(180deg,#f4f8ff_0%,#ffffff_100%)]">
          <Contenedor className="pt-14 sm:pt-[60px]">
            <div className="mx-auto max-w-[760px]">
              <Antetitulo>Para agentes de IA</Antetitulo>
              <h1 className="m-0 mt-4 font-[family-name:var(--font-display)] text-[clamp(1.9rem,4.6vw,2.75rem)] font-semibold leading-[1.08] tracking-[-.04em] text-balance text-[#102a72]">
                {TITULO}
              </h1>
              <p className="m-0 mt-5 text-pretty text-[17px] leading-[1.6] text-[#4a5164]">{BAJADA}</p>
              <p className="m-0 mt-5 text-[12.5px] text-[#666d80]">
                Actualizada el {fecha} ·{' '}
                <a href={RUTA_AGENTES_MD} className="text-zero-600 underline underline-offset-2">Esta página en texto</a> ·{' '}
                <a href={RUTA_FUNCIONES_MD} className="text-zero-600 underline underline-offset-2">Todas las funciones en texto</a> ·{' '}
                <a href="/llms.txt" className="text-zero-600 underline underline-offset-2">llms.txt</a> ·{' '}
                <a href={CONECTOR.documentacion} className="font-semibold text-zero-600 underline underline-offset-2">Documentación del conector</a>
              </p>
            </div>
          </Contenedor>
        </section>

        <Contenedor className="pt-10">
          <div className="mx-auto flex max-w-[760px] flex-col gap-7">
            <Apartado titulo="¿Qué puede hacer hoy un agente de IA con Zero?">
              <Lista puntos={HOY_PUEDE} />
            </Apartado>

            <Apartado titulo="¿Qué no puede hacer todavía?">
              <ListaLlana puntos={TODAVIA_NO} />
              <Parrafo>
                El alta iniciada por un agente y la escritura por el conector están previstas y todavía no
                existen. Esta página se actualiza cuando existan.
              </Parrafo>
            </Apartado>

            <Apartado titulo="¿Cómo ayuda un agente a una persona a crear su empresa?">
              <Parrafo>
                La empresa la crea la persona, en pocos minutos. El agente la prepara diciéndole qué va a
                necesitar en cada paso:
              </Parrafo>
              <Pasos pasos={PASOS_DEL_ALTA} />
            </Apartado>

            <Apartado titulo="¿Cómo se conecta un asistente a una empresa?">
              <Pasos pasos={PASOS_DE_CONEXION} />
              <Dato>
                La documentación completa del conector —cada herramienta por módulo, la seguridad y los pasos para
                Claude, Cursor y VS Code— está en{' '}
                <a href={CONECTOR.documentacion} className="font-semibold underline underline-offset-2">mcp.zero.com.do</a>.
                El conector también responde en <Mono>{CONECTOR.urlEnSubdominio}</Mono>.
              </Dato>
              <TablaDeTexto
                columnas={['Dato', 'Valor']}
                filas={[
                  ['Dirección', <Mono key="u">{CONECTOR.url}</Mono>],
                  ['Protocolo', CONECTOR.protocolo],
                  ['Transporte', CONECTOR.transporte],
                  ['Autenticación', <Mono key="c">{CONECTOR.cabecera}</Mono>],
                  ['Acceso', 'Solo lectura'],
                  ['Tope', `${CONECTOR.topePorLlave} peticiones por minuto por llave; ${CONECTOR.topePorDireccion} por dirección`],
                ]}
              />
              <Parrafo>Dónde se pega en cada asistente:</Parrafo>
              <TablaDeTexto
                columnas={['Asistente', 'Camino']}
                filas={DONDE_SE_PEGA.map((d) => [d.asistente, d.camino])}
              />
              <Parrafo>En un cliente que se configura con un archivo:</Parrafo>
              <Codigo>{EJEMPLO_CONFIG}</Codigo>
              <Parrafo>
                Para comprobar la llave desde una terminal. Si devuelve una factura, sirve; si devuelve
                401, está mal copiada o fue revocada:
              </Parrafo>
              <Codigo>{EJEMPLO_CURL}</Codigo>
            </Apartado>

            <Apartado titulo="¿Qué herramientas tiene el conector?">
              <Parrafo>
                Todas leen. Los listados devuelven {CONECTOR.filasPorDefecto} filas si no se pide otra cosa
                y {CONECTOR.filasMaximo} como máximo.
              </Parrafo>
              <TablaDeTexto
                columnas={['Herramienta', 'Para qué', 'Parámetros']}
                filas={HERRAMIENTAS.map((h) => [
                  <Mono key="n">{h.nombre}</Mono>,
                  h.paraQue,
                  <span key="p" className="flex flex-col gap-1">
                    {h.parametros.map((p) => (
                      <span key={p.nombre}>
                        <Mono>{p.nombre}</Mono> <span className="text-[#666d80]">({p.tipo})</span>
                      </span>
                    ))}
                  </span>,
                ])}
              />
              <Parrafo>
                El detalle de cada parámetro está en la{' '}
                <a href={RUTA_AGENTES_MD} className="font-semibold text-zero-600 underline underline-offset-2">versión en texto</a>.
              </Parrafo>
            </Apartado>

            <Apartado titulo="¿Se puede consultar sin MCP?">
              <Parrafo>
                Sí. Las mismas consultas están por HTTP, con la misma llave y la misma respuesta en JSON.
                Base: <Mono>{CONECTOR.rest}</Mono>
              </Parrafo>
              <TablaDeTexto
                columnas={['Dirección', 'Equivale a']}
                filas={RUTAS_REST.map((r) => [
                  <Mono key="r">GET {r.ruta}</Mono>,
                  <Mono key="h">{r.herramienta}</Mono>,
                ])}
              />
            </Apartado>

            <Apartado titulo="¿Qué reglas sigue un agente dentro de Zero?">
              <ListaLlana puntos={REGLAS} />
            </Apartado>

            <Apartado titulo="¿Qué significa cada error?">
              <TablaDeTexto
                columnas={['Código', 'Causa', 'Qué hacer']}
                filas={ERRORES.map((e) => [e.codigo, e.causa, e.queHacer])}
              />
            </Apartado>

            <Dato>
              ¿Buscas qué hace Zero y cuánto cuesta? Está todo, módulo por módulo, en{' '}
              <a href={RUTA_FUNCIONES_MD} className="font-semibold underline underline-offset-2">las funciones en texto</a>{' '}
              y en <a href="/precios" className="font-semibold underline underline-offset-2">la página de precios</a>.
            </Dato>
          </div>
        </Contenedor>

        <Contenedor className="pt-12">
          <div className="mx-auto max-w-[760px]">
            <h2 className="m-0 font-[family-name:var(--font-display)] text-[clamp(1.3rem,3vw,1.6rem)] font-semibold tracking-[-.035em] text-[#102a72]">
              Preguntas frecuentes
            </h2>
            <div className="mt-4">
              <Acordeon preguntas={PREGUNTAS} />
            </div>
          </div>
        </Contenedor>

        <Contenedor className="pb-4 pt-12">
          <div className="mx-auto max-w-[760px] rounded-2xl border border-[#e7edfb] bg-[#f5f8ff] p-6 sm:p-8">
            <p className="m-0 font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-[-.025em] text-[#102a72]">
              Crea tu empresa y conéctale tu asistente
            </p>
            <p className="m-0 mt-2.5 text-pretty text-[14px] leading-[1.6] text-[#5c6373]">
              La prueba es gratis: {textoDeLaPrueba()}. Al terminar el alta ya puedes crear la llave de lectura.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <BotonPrimario href="/sign-up">Crear mi empresa</BotonPrimario>
              <BotonSecundario href="/precios">Ver los planes</BotonSecundario>
            </div>
          </div>
        </Contenedor>
      </article>

      <DatosDeArticulo titulo={TITULO} descripcion={BAJADA} ruta={RUTA_AGENTES} actualizada={ACTUALIZADA} />
      <DatosDeRuta migas={[{ nombre: TITULO, ruta: RUTA_AGENTES }]} />
      <DatosDePreguntas preguntas={PREGUNTAS} />
    </>
  );
}
