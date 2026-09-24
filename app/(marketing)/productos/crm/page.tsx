/**
 * Zero CRM — página propia, larga y con lo que hace a la vista.
 *
 * Tres decisiones de esta página:
 *
 *  - **Se ve antes de leerse.** El agente contestando va arriba, en vivo
 *    (`_demo.tsx`), y cada capacidad tiene su pantalla al lado. Una lista de
 *    viñetas no demuestra nada; la conversación sí.
 *  - **Se toca.** Los casos de la demo, las pestañas de canales y el acordeón
 *    de capacidades son del visitante: entra por lo suyo y lee solo eso. Por
 *    eso la página puede ser larga sin cansar.
 *  - **Nada de vocabulario de un cliente.** Las capacidades salieron del
 *    levantamiento de un pliego institucional, pero aquí se cuentan por lo que
 *    hacen —atender, verificar, responder de tus documentos, agendar, cobrar,
 *    integrarse—, no por el organismo que las pidió. Ni nombres de sistemas
 *    ajenos ni siglas de un expediente en concreto.
 *
 * Las capturas salen de la maqueta del propio CRM (`public/home/capturas/crm-*`).
 */

import type { Metadata } from 'next';
import { TEXTO_BAJO_COTIZACION, getProductoAparte } from '@/lib/config/plans';
import { urlDelSitio } from '@/lib/config/enlaces';
import { DatosDePreguntas, DatosDeProducto, DatosDeRuta } from '../../_datos-estructurados';
import { Cheque, CONTACTO, Contenedor, IconoWhatsApp, Iconos } from '../../_piezas';
import { Acordeon, type Pregunta } from '../../_acordeon';
import { Antetitulo, Encabezado, Titulo } from '../../_bloques';
import {
  CierreProducto, FranjaProducto, HeroProducto, SeccionConImagen, SeccionProducto,
  type PuntoDeProducto,
} from '../../_producto';
import { LazoZero } from '@/lib/marca/isotipo';
import { DemoConversacion } from './_demo';
import { Canales, type Canal } from './_canales';
import { Pruebalo } from './_pruebalo';
import { RecorridoIA } from './_recorrido-ia';
import { CifrasIA } from './_cifras';

export const metadata: Metadata = {
  title: 'Zero CRM — agentes de inteligencia artificial que atienden por WhatsApp, web y teléfono',
  description:
    'CRM con inteligencia artificial: agentes que contestan al instante por WhatsApp, Messenger, Instagram, correo, tu web y el teléfono; verifican identidad, agendan, cobran, responden desde tus documentos y se integran con los sistemas que ya usas. Con tickets y turnos.',
  keywords: [
    'CRM con inteligencia artificial', 'agente de IA para WhatsApp', 'chatbot con IA República Dominicana',
    'atención al cliente con inteligencia artificial', 'agente de voz para llamadas', 'WhatsApp Business API',
    'sistema de tickets', 'sistema de turnos', 'integración con sistemas existentes', 'RAG sobre documentos',
  ],
  alternates: { canonical: '/productos/crm' },
  openGraph: {
    type: 'website',
    url: urlDelSitio('/productos/crm'),
    title: 'Zero CRM — agentes de IA que atienden por WhatsApp, web y teléfono',
    description:
      'Contestan al instante, verifican identidad, agendan, cobran y responden desde tus propios documentos. Con tickets, turnos e integración con los sistemas que ya usas.',
    images: [{ url: '/home/capturas/crm-panel.png', width: 1440, height: 900, alt: 'Panel de Zero CRM' }],
  },
};

const CRM = getProductoAparte('crm');

const PRECIO = CRM && !CRM.bajoCotizacion && CRM.precio !== null
  ? `US$${CRM.precio} / mes`
  : TEXTO_BAJO_COTIZACION;

/** Lo que hace, contado por el trabajo que quita. */
const HACE: PuntoDeProducto[] = [
  { titulo: 'Contesta antes de que te dé tiempo a verlo', detalle: 'Responde al instante, de día y de noche, y pasa la conversación a una persona cuando hace falta.', icono: Iconos.soporte },
  { titulo: 'Un solo sitio donde mirar', detalle: 'Seis canales caen en la misma bandeja, y se ve quién del equipo atiende cada conversación.', icono: Iconos.correo },
  { titulo: 'Nadie se queda sin seguimiento', detalle: 'Cada persona que escribe entra a un tablero, y el que lleva días quieto se marca solo.', icono: Iconos.crecer },
  { titulo: 'Las citas se agendan sin llamadas', detalle: 'El cliente elige entre tus horas libres, la cita entra a tu calendario y sale el recordatorio.', icono: Iconos.reloj },
  { titulo: 'La ficha se llena sola', detalle: 'Datos, historial y documentos de cada quien, con formularios que guardan lo que responde.', icono: Iconos.papel },
  { titulo: 'Se acuerda de cada quien', detalle: 'La conversación no empieza de cero aunque hayan pasado semanas.', icono: Iconos.base },
];

const CANALES: Canal[] = [
  {
    clave: 'whatsapp',
    nombre: 'WhatsApp',
    titular: 'Con el número de tu empresa, no uno prestado',
    detalle: 'Es por donde escribe casi todo el mundo aquí. El cliente ve el nombre de tu institución, no el nuestro, y la conversación queda en su ficha.',
    puntos: [
      'WhatsApp Business API, con tu propio número verificado',
      'Texto, notas de voz, fotos y documentos',
      'Plantillas aprobadas para los avisos que salen solos',
      'Por aquí también salen los recordatorios y los enlaces de pago',
    ],
  },
  {
    clave: 'messenger',
    nombre: 'Messenger',
    titular: 'Los mensajes de tu página de Facebook',
    detalle: 'Los mismos flujos y el mismo agente, sin otra aplicación abierta ni otro celular encima del escritorio.',
    puntos: ['Entra a la misma bandeja', 'Se asigna igual que los demás', 'El historial se guarda en la ficha del contacto'],
  },
  {
    clave: 'instagram',
    nombre: 'Instagram',
    titular: 'Los mensajes directos de tu cuenta',
    detalle: 'Lo que llega por la cuenta de la institución lo contesta el mismo agente, con las mismas respuestas.',
    puntos: ['Mensajes directos atendidos al instante', 'Sin perder de vista quién preguntó qué', 'Se convierte en contacto con un clic'],
  },
  {
    clave: 'correo',
    nombre: 'Correo',
    titular: 'Lo que llega al buzón de la empresa',
    detalle: 'El correo deja de ser la bandeja donde se pierden las solicitudes: entra al mismo tablero que lo demás.',
    puntos: ['Responde y adjunta desde el mismo sitio', 'Queda el hilo completo en la ficha', 'Sirve para los avisos formales'],
  },
  {
    clave: 'portal',
    nombre: 'Tu portal',
    titular: 'Una ventana de chat dentro de tu página',
    detalle: 'El mismo asistente, en tu web, para el que llega buscando y no quiere escribir por WhatsApp.',
    puntos: [
      'Se instala pegando una línea en tu sitio',
      'Contesta lo mismo que en los demás canales',
      'Si hace falta, sigue la conversación por WhatsApp o correo',
    ],
  },
  {
    clave: 'llamadas',
    nombre: 'Llamadas',
    titular: 'El teléfono lo contesta un agente de voz',
    detalle: 'Se conecta con tu central telefónica: la llamada se atiende hablando, y lo que se acordó queda escrito en la ficha.',
    puntos: [
      'Atiende, entiende y responde hablado',
      'Puede verificar identidad y mover una cita en la misma llamada',
      'La llamada queda registrada junto al resto de la conversación',
    ],
  },
];

/** Qué le pueden mandar y el agente lo entiende. */
const ENTIENDE = [
  { titulo: 'Texto', detalle: 'Con faltas, abreviado, a medias y con los modismos de aquí.' },
  { titulo: 'Notas de voz', detalle: 'Las pasa a texto, responde a lo que dicen y puede contestar hablado.' },
  { titulo: 'Fotos', detalle: 'Lee lo que hay escrito en la imagen —una cédula, un depósito— y saca los datos.' },
  { titulo: 'Documentos', detalle: 'PDF y Word, con sus tablas, para responder a partir de lo que dicen.' },
] as const;

/**
 * Las capacidades del agente, en acordeón.
 *
 * Son muchas —salen de un levantamiento completo— y en lista se leen como un
 * inventario. Plegadas, el visitante abre la que le toca. El texto va en el
 * HTML aunque esté cerrado, así que se busca desde fuera igual.
 */
const CAPACIDADES: Pregunta[] = [
  {
    pregunta: 'Atiende y resuelve, 24/7',
    respuesta: 'Contesta a cualquier hora en todos los canales y con el mismo nivel en cada uno. Guía trámites y servicios paso por paso, da direcciones, oficinas, horarios y el directorio de contactos, y busca en tu propia web cuando no tiene la respuesta a mano. Aprende de las interacciones, recuerda lo que cada quien prefiere y pasa la conversación a una persona cuando hace falta.',
  },
  {
    pregunta: 'Verifica quién está del otro lado',
    respuesta: 'Identidad por cédula, pasaporte, RNC o matrícula, confirmada con un código que llega por correo, SMS o WhatsApp. Lee la identificación de una foto y saca los datos, y valida contra tu sistema antes de entregar información privada. Sin identificarse, nadie recibe datos de nadie.',
  },
  {
    pregunta: 'Responde desde tus documentos',
    respuesta: 'Se le cargan tu normativa, tus manuales y tus formularios. Responde sin que el usuario sepa el número del reglamento, cita el artículo exacto y de dónde salió, lee PDF y Word con sus tablas, y explica distinto al técnico y al ciudadano. Cuando la información no está, lo dice en vez de inventarla.',
  },
  {
    pregunta: 'Agenda, confirma y recuerda',
    respuesta: 'Se sincroniza con los calendarios de quienes atienden y ofrece solo los horarios que aplican a ese tipo de trámite. Se crea, consulta, reprograma y cancela desde WhatsApp. Escribe la cita de vuelta en tu sistema y avisa por webhook, no duplica la del mismo expediente, no agenda sobre un trámite sin validar, y manda recordatorios 24 y 48 horas antes con los adjuntos explicados. Queda el historial de citaciones y los reportes de dónde salió cada una.',
  },
  {
    pregunta: 'Consulta el estado y cobra',
    respuesta: 'Da el estado de una solicitud por su documento y su código, con los requisitos, fechas, costos y cupos consultados en tiempo real. Recibe los documentos del solicitante en PDF, JPG o PNG, consulta el balance —total, parcial o la mensualidad— y manda el enlace de pago de CardNet o Azul, confirmando cuando el pago entra. Avisa por correo, SMS o WhatsApp en cada paso.',
  },
  {
    pregunta: 'Se conecta con lo que ya tienes',
    respuesta: 'Conectores con tus sistemas —matrícula, expediente, agenda o facturación— y API y webhooks REST en las dos direcciones, sin cargar Excel a mano. Cola de reintentos: si un sistema no contesta, no se pierde nada. Se conecta con tu central telefónica para contestar las llamadas hablado. Panel de control y analítica con el consumo a la vista, diseño de los flujos, capacitación a tu gente e infraestructura administrada.',
  },
];

/**
 * La inteligencia artificial, dicha sin rodeos.
 *
 * Es lo que el visitante viene buscando y lo que un asistente de IA necesita
 * leer para resumir qué hace esto. Cada línea es una capacidad concreta, no un
 * adjetivo: «entiende», «decide», «cita», «no inventa».
 */
const IA = [
  { titulo: 'Entiende como se escribe de verdad', detalle: 'Lenguaje natural en español dominicano: con faltas, abreviado, por audio o con una foto de un papel.' },
  { titulo: 'Decide y actúa, no solo responde', detalle: 'Consulta la agenda, verifica identidad, agenda una cita, manda un enlace de pago y escribe de vuelta en tus sistemas.' },
  { titulo: 'Responde desde TUS documentos', detalle: 'Se le cargan tus reglamentos y manuales; contesta citando el artículo exacto y de dónde salió.' },
  { titulo: 'No inventa', detalle: 'Cuando la información no está en lo que se le cargó, lo dice y pasa la conversación a una persona.' },
  { titulo: 'Se acuerda', detalle: 'Memoria larga de cada contacto: lo que hablaron, lo que prefiere y en qué quedó todo.' },
  { titulo: 'Contesta hablando', detalle: 'El mismo agente atiende el teléfono: escucha, responde con voz y deja la llamada escrita en la ficha.' },
] as const;

/** Tickets y turnos: las dos formas de poner orden en una fila de gente. */
const ATENCION = [
  {
    titulo: 'Sistema de tickets',
    detalle: 'Cada solicitud es un ticket con su estado, su responsable y su historial completo.',
    lineas: [
      'Se abre solo desde la conversación, el correo o el portal',
      'Estado, prioridad y a quién le toca, a la vista',
      'Llamada de voz dentro del mismo ticket, sin cambiar de aplicación',
      'La llamada queda grabada y guardada junto al hilo',
      'Se mide cuánto se tarda en contestar y en resolver',
    ],
  },
  {
    titulo: 'Sistema de turnos',
    detalle: 'Para el que atiende presencial: la fila deja de ser un grupo de gente parada preguntando quién sigue.',
    lineas: [
      'Turno por tipo de trámite, sacado desde el móvil o en la sucursal',
      'Pantalla de llamado con el número y la ventanilla',
      'Aviso por WhatsApp cuando se acerca su turno',
      'Tiempos de espera y de atención, por ventanilla y por persona',
      'Enlaza el turno con el expediente y con la cita si la había',
    ],
  },
] as const;

/**
 * Con qué se conecta.
 *
 * Se nombran los sistemas por su nombre —no «integraciones con terceros»—
 * porque el que busca ya sabe cuál tiene y lo que quiere leer es el suyo.
 */
const INTEGRACIONES = [
  { grupo: 'Mensajería', items: ['WhatsApp Business API con tu número', 'Messenger', 'Instagram', 'Correo de tu dominio'] },
  { grupo: 'Voz', items: ['Tu central telefónica', 'Agente de voz que contesta llamadas', 'Grabación y transcripción'] },
  { grupo: 'Agenda', items: ['Google Calendar en las dos direcciones', 'Los calendarios de quienes atienden'] },
  { grupo: 'Cobros', items: ['CardNet', 'Azul', 'Enlaces de pago con confirmación automática'] },
  { grupo: 'Tu operación', items: ['Zero: facturación e-CF, cobros y contabilidad', 'Tu ERP, matrícula o expediente', 'Tu página web'] },
  { grupo: 'A la medida', items: ['API REST en las dos direcciones', 'Webhooks por evento', 'Cola de reintentos si un sistema no contesta'] },
] as const;

/** Lo que pregunta el que compra en serio. Medidas, no intenciones. */
const SERIEDAD = [
  { titulo: 'Contesta en segundos', detalle: 'Menos de cinco, y con muchas conversaciones a la vez sin ponerse lento.' },
  { titulo: 'Aguanta el volumen', detalle: 'Decenas de miles de conversaciones al año sin montar nada más ni contratar servidores aparte.' },
  { titulo: 'Tus datos, protegidos', detalle: 'Ley 172-13, conexión cifrada (TLS 1.2+) y la información guardada cifrada (AES-256).' },
  { titulo: 'Infraestructura auditada', detalle: 'Corre sobre proveedores con certificación SOC 2.' },
  { titulo: 'Doble factor y bitácora', detalle: 'Segundo factor para los administradores y registro de quién hizo qué y cuándo.' },
  { titulo: 'Disponible 99.9%', detalle: 'Con soporte 24/7 y respuesta en menos de 15 minutos.' },
  { titulo: 'Cada quien ve lo suyo', detalle: 'Usuarios con permisos: tú ves todo, el equipo ve lo que le toca.' },
  { titulo: 'La información es tuya', detalle: 'Te la llevas cuando quieras. Nosotros mantenemos y actualizamos el sistema.' },
] as const;

export default function CrmPage() {
  if (!CRM) return null;

  return (
    <>
      <HeroProducto
        antetitulo={CRM.nombre}
        titulo="Que nadie que pregunte se quede sin respuesta."
        bajada="Un agente que contesta al instante por seis canales, verifica quién pregunta, agenda, cobra y responde desde tus propios documentos. Lo que no puede resolver, lo pasa a una persona."
        pie={`${PRECIO} · Se contrata aparte de los planes de Zero`}
        captura="/home/capturas/crm-panel.png"
        alt="Panel de Zero CRM con el pipeline, la conversión y lo que el sistema hizo solo hoy"
        accion="Pedir una demostración"
        href="/contacto?perfil=pyme"
      />

      {/* ── El agente, contestando ─────────────────────────────────────────── */}
      <section id="demo" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.5fr)] lg:gap-12">
            <div className="min-w-0">
              <Antetitulo>Míralo trabajar</Antetitulo>
              <Titulo className="mt-3.5">Así contesta, y así resuelve.</Titulo>
              <p className="m-0 mt-3.5 text-pretty text-[15px] leading-[1.6] text-[#5c6373]">
                Elige un caso y mira la conversación completa. Las líneas grises son lo que el
                sistema hizo por su cuenta mientras hablaba: validar la identidad, consultar la
                agenda, escribir la cita, mandar el enlace de pago.
              </p>
              <p className="m-0 mt-3.5 text-pretty text-[13px] leading-[1.55] text-[#8a90a0]">
                Nada de esto lo escribió una persona.
              </p>
            </div>
            <DemoConversacion />
          </div>

          {/* Y si no le crees a la grabación, escríbele. */}
          <div className="mt-3.5 grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.5fr)] lg:gap-12">
            <p className="m-0 min-w-0 text-pretty text-[13px] leading-[1.6] text-[#5c6373] lg:pt-1">
              ¿Prefieres probarlo tú? Escríbele aquí mismo y mira cómo piensa antes de contestar.
            </p>
            <Pruebalo />
          </div>
        </Contenedor>
      </section>

      {/* ── La inteligencia artificial, sin rodeos ─────────────────────────── */}
      {/* Va en oscuro y pegada a la demo a propósito: es lo que el visitante
          vino a ver y lo que un asistente de IA necesita leer para resumir de
          qué va esto. En gris entre el resto, se lee como una función más. */}
      <section id="inteligencia-artificial" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="relative overflow-hidden rounded-3xl bg-[#0b1a46] p-7 sm:p-11">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 opacity-[.06]">
              <LazoZero alto={280} color="#ffffff" />
            </div>
            <div className="relative">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[.2em] text-white/55">
                Inteligencia artificial
              </p>
              <h2 className="m-0 mt-3.5 max-w-[760px] font-[family-name:var(--font-display)] text-[clamp(1.75rem,3.6vw,2.25rem)] font-semibold leading-[1.1] tracking-[-.045em] text-balance text-white">
                No es un menú de opciones con voz de robot. Entiende, decide y hace.
              </h2>
              <p className="m-0 mt-4 max-w-[640px] text-pretty text-[15px] leading-[1.6] text-white/70">
                El agente lee lo que le mandan —texto, audio, fotos o documentos—, consulta tus
                sistemas y ejecuta: agenda, verifica, cobra y escribe de vuelta. Cuando no sabe,
                lo dice y llama a una persona.
              </p>
              <ul className="m-0 mt-8 grid list-none grid-cols-1 gap-x-8 gap-y-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {IA.map(i => (
                  <li key={i.titulo} className="min-w-0 border-t border-white/15 pt-4">
                    <p className="m-0 font-[family-name:var(--font-display)] text-[14.5px] font-semibold tracking-[-.015em] text-white">
                      {i.titulo}
                    </p>
                    <p className="m-0 mt-1.5 text-pretty text-[12.5px] leading-[1.55] text-white/65">{i.detalle}</p>
                  </li>
                ))}
              </ul>

              {/* Las medidas, contando hacia arriba cuando el bloque entra. */}
              <div className="mt-10 border-t border-white/15 pt-8">
                <CifrasIA />
              </div>

              {/* Y el camino que recorre un mensaje, moviéndose solo. */}
              <div className="mt-10 border-t border-white/15 pt-8">
                <p className="m-0 mb-5 text-[11px] font-semibold uppercase tracking-[.2em] text-white/55">
                  Qué le pasa a un mensaje
                </p>
                <RecorridoIA />
              </div>
            </div>
          </div>
        </Contenedor>
      </section>

      <SeccionProducto
        id="que-hace"
        antetitulo="Lo que hace"
        titulo="Atiende, ordena y te recuerda a quién seguir."
        detalle="Lo mismo que hoy hace tu equipo a mano entre cuatro teléfonos, una libreta y un grupo de WhatsApp."
        puntos={HACE}
      />

      {/* ── Canales ────────────────────────────────────────────────────────── */}
      <section id="canales" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.5fr)] lg:gap-12">
            <Encabezado
              antetitulo="Por dónde te buscan"
              titulo="Seis puertas, una sola bandeja."
              detalle="El cliente usa lo que le queda cómodo —y hasta el teléfono—. Tu equipo contesta desde un solo sitio, sin saltar entre aplicaciones ni entre celulares."
            />
            <Canales canales={CANALES} />
          </div>
        </Contenedor>
      </section>

      <SeccionConImagen
        id="bandeja"
        antetitulo="La bandeja"
        titulo="Todo lo que entra, en una sola lista."
        detalle="Con el filtro por canal, quién atiende cada conversación y la marca de lo que ya contestó el agente sin que nadie interviniera."
        lineas={[
          'Se ve qué contestó el bot y qué contestó una persona',
          'Las acciones de siempre a un clic: precios, enlace de cita, pedir documentos',
          'Pasar a un vendedor sin salir de la conversación',
          'Cada mensaje queda en la ficha del contacto',
        ]}
        captura="/home/capturas/crm-inbox.png"
        alt="Bandeja de Zero CRM con conversaciones de WhatsApp y las que atendió el agente"
      />

      <SeccionConImagen
        id="tablero"
        antetitulo="El tablero"
        titulo="Dónde está cada quien, sin preguntarle a nadie."
        detalle="Los contactos avanzan por las etapas que tú definas. El que lleva días sin moverse se marca solo, que es el que normalmente se pierde."
        lineas={[
          'Etapas a la medida de cómo trabaja tu institución',
          'Alerta del contacto que lleva días quieto',
          'Se ve dónde se cae la conversión y cuánto cuesta esa fuga',
          'Reportes de cuántos entran y cuántos cierran',
        ]}
        captura="/home/capturas/crm-pipeline.png"
        alt="Tablero de Zero CRM con las etapas del proceso y los contactos en cada una"
        invertida
      />

      <SeccionConImagen
        id="citas"
        antetitulo="Las citas"
        titulo="La agenda se llena sola y se acuerda de avisar."
        detalle="El cliente elige entre tus horas libres desde la misma conversación. La cita entra a tu Google Calendar y el recordatorio sale sin que nadie lo escriba."
        lineas={[
          'Solo los horarios que aplican a ese tipo de trámite',
          'Crear, reprogramar y cancelar desde WhatsApp',
          'Recordatorios 24 y 48 horas antes',
          'Sin citas duplicadas del mismo expediente',
        ]}
        captura="/home/capturas/crm-calendario.png"
        alt="Calendario de Zero CRM con las citas de la semana"
      />

      <SeccionConImagen
        id="fichas"
        antetitulo="Las fichas"
        titulo="Todo lo de una persona, en un solo sitio."
        detalle="Datos, historial, documentos y con quién habló. Sin libretas, sin hojas sueltas y sin preguntar dos veces lo mismo."
        lineas={[
          'Agrupa familiares o contactos de una misma casa',
          'Reconoce al que ya existe y no lo duplica',
          'Los formularios guardan lo que el cliente responde',
          'Documentos adjuntos donde se buscan',
        ]}
        captura="/home/capturas/crm-contactos.png"
        alt="Listado de contactos de Zero CRM con su etapa y su origen"
        invertida
      />

      <SeccionConImagen
        id="flujos"
        antetitulo="Los flujos"
        titulo="Lo repetitivo lo hace el sistema."
        detalle="Se arman una vez con tus reglas y corren solos: saludar al que entra, pedir los documentos que faltan, recordar la cita, reasignar al que quedó sin atender."
        lineas={[
          'Reglas propias, no una plantilla cerrada',
          'Cola de reintentos: si un sistema no contesta, no se pierde nada',
          'Queda escrito lo que hizo solo y lo que hizo una persona',
          'Se mide cuántas horas de trabajo manual se ahorraron',
        ]}
        captura="/home/capturas/crm-flujos.png"
        alt="Flujos automáticos de Zero CRM"
      />

      {/* ── Tickets y turnos ───────────────────────────────────────────────── */}
      <section id="tickets-y-turnos" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.5fr)] lg:gap-12">
            <Encabezado
              antetitulo="Tickets y turnos"
              titulo="Para cuando lo que hay es una fila."
              detalle="Lo que entra por mensaje se vuelve un ticket con dueño y con tiempo; lo que llega en persona, un turno con su número. Las dos cosas en el mismo sistema."
            />
            <ul className="m-0 grid min-w-0 list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
              {ATENCION.map(a => (
                <li key={a.titulo} className="min-w-0 rounded-[15px] border border-[#e7edfb] bg-white p-5 sm:p-6">
                  <p className="m-0 font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-[-.02em] text-[#102a72]">
                    {a.titulo}
                  </p>
                  <p className="m-0 mt-2 text-pretty text-[12.5px] leading-[1.55] text-[#5c6373]">{a.detalle}</p>
                  <ul className="m-0 mt-3.5 flex list-none flex-col gap-2 p-0">
                    {a.lineas.map(l => (
                      <li key={l} className="flex min-w-0 items-start gap-2.5 text-[12.5px] leading-[1.5] text-[#3b4252]">
                        <Cheque tamano={11} color="#3658e1" grosor={3.4} />
                        <span className="min-w-0">{l}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </Contenedor>
      </section>

      {/* ── Capacidades, plegadas ──────────────────────────────────────────── */}
      <section id="capacidades" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.5fr)] lg:gap-12">
            <Encabezado
              antetitulo="Todo lo que sabe hacer"
              titulo="Seis capacidades, abiertas una por una."
              detalle="El agente no sale de una plantilla: se arma con tus servicios, tus documentos y tus reglas. Abre la que te interese."
            />
            <div className="min-w-0">
              <Acordeon preguntas={CAPACIDADES} />
            </div>
          </div>
        </Contenedor>
      </section>

      {/* ── Lo que entiende ────────────────────────────────────────────────── */}
      <section id="entiende" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.5fr)] lg:gap-12">
            <Encabezado
              antetitulo="Cómo le escriben"
              titulo="No hace falta escribirle bonito."
              detalle="La gente manda audios, fotos de un papel y mensajes a medias. El agente entiende eso, que es como se escribe de verdad."
            />
            <ul className="m-0 grid min-w-0 list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
              {ENTIENDE.map(e => (
                <li key={e.titulo} className="min-w-0 rounded-[15px] border border-[#e7edfb] bg-white p-5">
                  <p className="m-0 flex items-center gap-2 font-[family-name:var(--font-display)] text-[14px] font-semibold text-[#102a72]">
                    <Cheque tamano={12} color="#3658e1" grosor={3.4} />
                    {e.titulo}
                  </p>
                  <p className="m-0 mt-2 text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">{e.detalle}</p>
                </li>
              ))}
            </ul>
          </div>
        </Contenedor>
      </section>

      {/* ── Integraciones ──────────────────────────────────────────────────── */}
      <section id="integraciones" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,2fr)] lg:gap-12">
            <Encabezado
              antetitulo="Integraciones"
              titulo="Se mete entre tus sistemas, no encima de ellos."
              detalle="Nadie cambia de sistema para probar un asistente. El agente habla con lo que ya tienes puesto, en las dos direcciones, y si algo no contesta lo reintenta."
            />
            <ul className="m-0 grid min-w-0 list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
              {INTEGRACIONES.map(g => (
                <li key={g.grupo} className="min-w-0 rounded-[15px] border border-[#e7edfb] bg-white p-5">
                  <p className="m-0 text-[10.5px] font-semibold uppercase tracking-[.16em] text-zero-600">{g.grupo}</p>
                  <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                    {g.items.map(i => (
                      <li key={i} className="flex min-w-0 items-start gap-2.5 text-[12.5px] leading-[1.5] text-[#3b4252]">
                        <Cheque tamano={11} color="#3658e1" grosor={3.4} />
                        <span className="min-w-0">{i}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </Contenedor>
      </section>

      <FranjaProducto
        antetitulo="Con lo que ya tienes"
        titulo="No te pide cambiar de sistema ni de número."
        detalle="Trabaja con tu número de WhatsApp de empresa, con tu Google Calendar, con tu central telefónica y al lado de lo que ya usas."
        lineas={[
          'Tu propio número de WhatsApp: el cliente ve tu nombre, no el nuestro',
          'Las citas entran y salen de tu Google Calendar, sin apuntarlas dos veces',
          'Se enlaza con tu facturación, tu punto de venta o tu página web',
          'Se conecta con tu sistema de llamadas: el teléfono lo contesta un agente de voz',
          'Pegado a Zero: por ahí salen los avisos de cobro a tus clientes',
          'Viene armado para colegios, clínicas, restaurantes y negocios de servicios',
        ]}
      />

      {/* ── Lo serio ───────────────────────────────────────────────────────── */}
      <section id="seriedad" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,2fr)] lg:gap-12">
            <Encabezado
              antetitulo="Lo que preguntan los que compran en serio"
              titulo="Rápido, cifrado y con tus datos en tu poder."
            />
            <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
              {SERIEDAD.map(s => (
                <li key={s.titulo} className="min-w-0 rounded-[15px] border border-[#e7edfb] bg-white p-5">
                  <p className="m-0 font-[family-name:var(--font-display)] text-[14px] font-semibold tracking-[-.015em] text-[#102a72]">
                    {s.titulo}
                  </p>
                  <p className="m-0 mt-1.5 text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">{s.detalle}</p>
                </li>
              ))}
            </ul>
          </div>
        </Contenedor>
      </section>

      <CierreProducto
        antetitulo={CRM.nombre}
        titulo="Te lo enseñamos con tus mensajes."
        detalle="Escríbenos y lo montamos con tu número, tus etapas y lo que tu institución pregunta todos los días. El precio se arma con tu volumen y lo que haya que conectar."
        nota={{
          titulo: 'Lo que hace falta de tu lado',
          detalle: 'Un número de WhatsApp de empresa y media hora para contarnos cómo atiendes hoy. Lo demás lo montamos nosotros.',
        }}
        accion="Pedir una demostración"
        href="/contacto?perfil=pyme"
      />

      {/* Lo que leen Google y los asistentes de IA. Solo lo que la página dice. */}
      <DatosDeProducto
        nombre="Zero CRM"
        descripcion="CRM con agentes de inteligencia artificial que atienden por WhatsApp, Messenger, Instagram, correo, la web y el teléfono; verifican identidad, agendan citas, cobran, responden desde los documentos de la institución y se integran con los sistemas que ya usa."
        ruta="/productos/crm"
        captura="/home/capturas/crm-panel.png"
        precioDesde={CRM.bajoCotizacion ? null : CRM.precio}
        funciones={[
          'Agentes de inteligencia artificial con lenguaje natural en español',
          'WhatsApp Business API, Messenger, Instagram, correo, chat web y llamadas',
          'Agente de voz que contesta el teléfono',
          'Verificación de identidad con documento y código',
          'Respuestas citando los documentos y reglamentos cargados',
          'Agenda de citas con Google Calendar y recordatorios',
          'Enlaces de pago con CardNet y Azul',
          'Sistema de tickets con llamadas y grabación',
          'Sistema de turnos con pantalla de llamado',
          'API REST y webhooks en las dos direcciones',
        ]}
      />
      <DatosDeRuta migas={[{ nombre: 'Productos', ruta: '/productos/crm' }, { nombre: 'Zero CRM', ruta: '/productos/crm' }]} />
      <DatosDePreguntas preguntas={CAPACIDADES} />
    </>
  );
}
