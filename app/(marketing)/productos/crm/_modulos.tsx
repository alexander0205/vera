'use client';

/**
 * Los ejemplos que se tocan en las subpáginas de Zero CRM: uno por página, como
 * la conversación de la página principal (`_demo.tsx`).
 *
 * Reglas de estos módulos:
 *
 *  - **Datos ficticios, y dicho.** Cada uno lleva la etiqueta a la vista. Ningún
 *    número aquí es una medición: es el dibujo de cómo se ve la función.
 *  - **Se renderizan en el servidor.** El estado inicial sale en el HTML, así que
 *    una persona sin JavaScript, un buscador o un asistente leen el ejemplo
 *    entero en su primera forma. Tocar solo cambia a otro ejemplo.
 *  - **Con teclado y sin sorpresas.** Botones de verdad, `aria-pressed` en los que
 *    se eligen, y las transiciones solo con `motion-safe` (respeta
 *    `prefers-reduced-motion`).
 */

import { useState } from 'react';

const caja = 'min-w-0 rounded-[18px] border border-[#e7edfb] bg-white p-5 sm:p-7';
const rotulo = 'm-0 text-[13px] font-semibold text-[#102a72]';
const transicion = 'motion-safe:transition';

function Ficticio() {
  return (
    <p className="m-0 inline-flex rounded-full bg-[#fdf3dd] px-2.5 py-1.5 text-[11px] font-semibold leading-none text-[#7a5000]">
      Ejemplo con datos ficticios
    </p>
  );
}

function Opcion({ activo, onClick, children, oscuro = false, className = '', etiqueta }: {
  activo: boolean; onClick: () => void; children: React.ReactNode; oscuro?: boolean; className?: string; etiqueta?: string;
}) {
  const encendido = oscuro ? 'border-transparent bg-[#102a72] text-white' : 'border-transparent bg-zero-600 text-white';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      aria-label={etiqueta}
      className={`min-h-[44px] cursor-pointer rounded-[11px] border px-3.5 text-[13px] font-semibold ${transicion} ${
        activo ? encendido : 'border-[#e4e8f4] bg-white text-[#3b4252] hover:border-zero-200'
      } ${className}`}
    >
      {children}
    </button>
  );
}

function Burbuja({ mia, children }: { mia: boolean; children: React.ReactNode }) {
  return (
    <p className={`m-0 max-w-[88%] text-pretty rounded-2xl px-3.5 py-2.5 text-[13px] leading-[1.5] ${
      mia ? 'self-end bg-[#edf1fe] text-[#102a72]' : 'self-start border border-[#eaeef8] bg-white text-[#3b4252]'
    }`}>
      {children}
    </p>
  );
}

// ── Solicitudes y seguimiento: consulta con línea de tiempo ─────────────────────

const SOLICITUDES = [
  { numero: 'SOL-1042', digitos: '4471', tipo: 'Reclamación por un cobro', estado: 'En revisión', actual: 2,
    pasos: [['Recibida', '28 oct, 9:14 a. m.'], ['Asignada a un analista', '28 oct, 11:02 a. m.'], ['En revisión', '30 oct, 3:40 p. m.'], ['Respuesta', 'Pendiente']],
    aviso: 'Le avisamos por este mismo chat cuando cambie el estado.' },
  { numero: 'SOL-1043', digitos: '0892', tipo: 'Solicitud de constancia', estado: 'Resuelta', actual: 3,
    pasos: [['Recibida', '25 oct, 8:30 a. m.'], ['Asignada', '25 oct, 9:10 a. m.'], ['Documento emitido', '27 oct, 2:15 p. m.'], ['Resuelta', '27 oct, 2:16 p. m.']],
    aviso: '¿Quedó todo resuelto? Si no, la reabrimos y seguimos.' },
  { numero: 'SOL-1050', digitos: '3318', tipo: 'Cambio de datos', estado: 'Falta un documento', actual: 1,
    pasos: [['Recibida', '1 nov, 10:05 a. m.'], ['Falta un documento', '1 nov, 10:20 a. m.'], ['En revisión', 'Pendiente'], ['Respuesta', 'Pendiente']],
    aviso: 'Envíe la foto del documento por aquí y se agrega a esta solicitud.' },
] as const;

export function ModuloSeguimiento() {
  const [i, setI] = useState(0);
  const [verificado, setVerificado] = useState(true);
  const c = SOLICITUDES[i];
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
      <div className={`${caja} flex flex-col gap-4`}>
        <p className={rotulo}>1. Número de solicitud</p>
        <div className="flex flex-wrap gap-2">
          {SOLICITUDES.map((s, k) => (
            <Opcion key={s.numero} activo={k === i} onClick={() => { setI(k); setVerificado(false); }}>{s.numero}</Opcion>
          ))}
        </div>
        <p className={rotulo}>2. Segundo dato</p>
        <p className="m-0 text-[12.5px] text-[#5c6373]">
          Últimos 4 dígitos del teléfono: <span className="font-semibold text-[#102a72]">{c.digitos}</span>
        </p>
        <button
          type="button"
          onClick={() => setVerificado(true)}
          className={`min-h-[46px] cursor-pointer rounded-xl bg-zero-600 px-4 text-[14px] font-semibold text-white ${transicion} hover:bg-zero-700`}
        >
          Consultar
        </button>
        <p className="m-0 text-[12px] leading-[1.5] text-[#666d80]">Sin el segundo dato no se muestra nada: así nadie ve lo ajeno.</p>
        <div className="mt-auto"><Ficticio /></div>
      </div>
      <div className={`${caja} flex flex-col gap-4`} aria-live="polite">
        {verificado ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-[12px] text-[#666d80]">Solicitud {c.numero}</p>
                <p className="m-0 mt-1 font-[family-name:var(--font-display)] text-[19px] font-semibold text-[#102a72]">{c.tipo}</p>
              </div>
              <span className="rounded-full bg-[#edf1fe] px-3 py-1.5 text-[12px] font-semibold text-[#2a45c4]">{c.estado}</span>
            </div>
            <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
              {c.pasos.map(([titulo, fecha], k) => {
                const hecho = k <= c.actual;
                return (
                  <li key={titulo} className="flex items-start gap-3.5">
                    <span
                      aria-hidden
                      className={`mt-1 size-3.5 shrink-0 rounded-full ${
                        k === c.actual ? 'bg-zero-600 shadow-[0_0_0_5px_#e0e7fd]' : hecho ? 'bg-zero-600' : 'border-2 border-[#c7d2fc] bg-white'
                      }`}
                    />
                    <span className="min-w-0">
                      <span className={`block text-[14px] ${k === c.actual ? 'font-semibold' : 'font-medium'} ${hecho ? 'text-[#102a72]' : 'text-[#6b7280]'}`}>
                        {titulo}{k === c.actual ? ' · estado actual' : ''}
                      </span>
                      <span className="block text-[12px] text-[#666d80]">{fecha}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="m-0 mt-auto rounded-xl bg-[#f5f8ff] px-4 py-3 text-[13px] leading-[1.55] text-[#3b4252]">{c.aviso}</p>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
            <p className="m-0 font-[family-name:var(--font-display)] text-[17px] font-semibold text-[#102a72]">Falta confirmar el segundo dato</p>
            <p className="m-0 max-w-[320px] text-[13px] leading-[1.55] text-[#666d80]">Toque «Consultar» para ver el estado, las fechas y el próximo paso.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Citas y agenda: elegir horario y confirmar ─────────────────────────────────

const DIAS = [
  { semana: 'Lun', numero: '10', libres: ['8:30 a. m.', '10:00 a. m.', '2:30 p. m.'] },
  { semana: 'Mar', numero: '11', libres: ['9:00 a. m.', '11:30 a. m.', '3:00 p. m.', '4:00 p. m.'] },
  { semana: 'Mié', numero: '12', libres: ['8:00 a. m.', '1:30 p. m.'] },
  { semana: 'Jue', numero: '13', libres: ['10:30 a. m.', '11:00 a. m.', '3:30 p. m.'] },
] as const;

export function ModuloCitas() {
  const [dia, setDia] = useState(1);
  const [hora, setHora] = useState(1);
  const [confirmada, setConfirmada] = useState(true);
  const d = DIAS[dia];
  const listo = hora >= 0;
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
      <div className={`${caja} flex flex-col gap-4`}>
        <p className={rotulo}>Día</p>
        <div className="grid grid-cols-4 gap-2">
          {DIAS.map((x, k) => (
            <Opcion key={x.numero} activo={k === dia} onClick={() => { setDia(k); setHora(-1); setConfirmada(false); }} className="min-h-[60px] px-1">
              <span className="block text-[11px] font-medium">{x.semana}</span>{' '}
              <span className="block font-[family-name:var(--font-display)] text-[19px]">{x.numero}</span>
              <span className="sr-only"> de noviembre</span>
            </Opcion>
          ))}
        </div>
        <p className={rotulo}>Hora libre</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {d.libres.map((t, k) => (
            <Opcion key={t} activo={k === hora} onClick={() => { setHora(k); setConfirmada(false); }}>{t}</Opcion>
          ))}
        </div>
        <button
          type="button"
          disabled={!listo}
          onClick={() => setConfirmada(true)}
          className={`min-h-[46px] rounded-xl px-4 text-[14px] font-semibold ${transicion} ${
            listo ? 'cursor-pointer bg-zero-600 text-white hover:bg-zero-700' : 'cursor-not-allowed bg-[#e0e7fd] text-[#2a45c4]'
          }`}
        >
          {listo ? 'Confirmar cita' : 'Elija una hora'}
        </button>
        <div className="mt-auto"><Ficticio /></div>
      </div>
      <div className={`${caja} flex flex-col gap-3`}>
        <p className="m-0 text-[12px] text-[#666d80]">Así le llega por el chat</p>
        <div className="flex flex-1 flex-col gap-2.5 rounded-[14px] border border-[#eef1f8] bg-[#fbfcff] p-4" aria-live="polite">
          <Burbuja mia={false}>Quiero una cita para entregar unos documentos.</Burbuja>
          <Burbuja mia>Con gusto. Elija el día y la hora que le convengan.</Burbuja>
          {confirmada && listo && (
            <>
              <Burbuja mia>
                Listo. Su cita quedó el {d.semana} {d.numero} de noviembre, {d.libres[hora]}. Código de confirmación:{' '}
                <strong>{`CT-${d.numero}${hora + 1}7Q`}</strong>. Le recordamos un día antes.
              </Burbuja>
              <p className="m-0 self-center text-center text-[11px] text-[#666d80]">Cita guardada en la agenda · ligada a la solicitud SOL-1050</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Encuestas y cierre: botones de satisfacción ────────────────────────────────

export function ModuloEncuestas() {
  const [resuelto, setResuelto] = useState<boolean | null>(true);
  const [nota, setNota] = useState(5);
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
      <div className={`${caja} flex flex-col gap-4`}>
        <Burbuja mia>¿Quedó resuelta su solicitud?</Burbuja>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Opcion activo={resuelto === true} onClick={() => setResuelto(true)} className="flex-1">Sí, quedó resuelta</Opcion>
          <Opcion activo={resuelto === false} oscuro onClick={() => { setResuelto(false); setNota(0); }} className="flex-1">No, necesito más ayuda</Opcion>
        </div>
        <div aria-live="polite" className="flex flex-col gap-3">
          {resuelto === false && <Burbuja mia>Entendido. Su solicitud vuelve a estar en proceso y la conversación sigue abierta.</Burbuja>}
          {resuelto === true && (
            <>
              <Burbuja mia>¿Qué tan satisfecho quedó con la atención?</Burbuja>
              <div role="group" aria-label="Calificación del 1 al 5" className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map(v => (
                  <Opcion
                    key={v}
                    activo={v === nota}
                    onClick={() => setNota(v)}
                    etiqueta={v === 1 ? '1, nada satisfecho' : v === 5 ? '5, muy satisfecho' : String(v)}
                    className="min-h-[50px] px-0 font-[family-name:var(--font-display)] text-[17px]"
                  >
                    {v}
                  </Opcion>
                ))}
              </div>
              <div className="flex justify-between text-[11.5px] text-[#666d80]"><span>Nada satisfecho</span><span>Muy satisfecho</span></div>
            </>
          )}
        </div>
        <div className="mt-auto"><Ficticio /></div>
      </div>
      <div className={`${caja} flex flex-col gap-3`}>
        <p className="m-0 text-[12px] text-[#666d80]">Lo que queda guardado</p>
        <dl className="m-0 grid grid-cols-2 gap-2.5">
          {[
            ['¿Resuelta?', resuelto === null ? '—' : resuelto ? 'Sí' : 'No, reabierta'],
            ['Calificación', nota ? `${nota} de 5` : '—'],
            ['Conversación', 'CONV-88213'],
            ['Solicitud', 'SOL-1043'],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0 rounded-xl bg-[#f5f8ff] p-3.5">
              <dt className="text-[11.5px] text-[#666d80]">{k}</dt>
              <dd className="m-0 mt-1 text-[15px] font-semibold text-[#102a72]">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="m-0 text-[12.5px] leading-[1.55] text-[#5c6373]">Si en vez de opinar escribe una consulta nueva, se atiende como consulta, no como comentario.</p>
        <p className="m-0 mt-auto rounded-xl bg-[#f5f8ff] px-4 py-3 text-[13px] leading-[1.55]">En el panel se ve el promedio por día, por canal y por asesor, y se exporta.</p>
      </div>
    </div>
  );
}

// ── Reportes: filtros que cambian el gráfico ───────────────────────────────────

const CANALES = ['Todos', 'WhatsApp', 'Chat web', 'Correo'] as const;
const PROPORCION = [1, 0.62, 0.28, 0.1];
const SERIES = {
  semana: { etiquetas: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], valores: [48, 61, 57, 70, 66, 31, 22] },
  mes: { etiquetas: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'], valores: [210, 245, 228, 262] },
} as const;

export function ModuloReportes() {
  const [canal, setCanal] = useState(0);
  const [periodo, setPeriodo] = useState<keyof typeof SERIES>('semana');
  const serie = SERIES[periodo];
  const valores = serie.valores.map(v => Math.round(v * PROPORCION[canal]));
  const maximo = Math.max(...valores, 1);
  const total = valores.reduce((a, b) => a + b, 0);
  return (
    <div className={`${caja} flex flex-col gap-5`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div role="group" aria-label="Canal" className="flex flex-wrap gap-2">
          {CANALES.map((n, k) => <Opcion key={n} activo={k === canal} onClick={() => setCanal(k)}>{n}</Opcion>)}
        </div>
        <div role="group" aria-label="Periodo" className="flex flex-wrap gap-2">
          <Opcion oscuro activo={periodo === 'semana'} onClick={() => setPeriodo('semana')}>Esta semana</Opcion>
          <Opcion oscuro activo={periodo === 'mes'} onClick={() => setPeriodo('mes')}>Este mes</Opcion>
        </div>
      </div>
      <dl className="m-0 grid grid-cols-1 gap-2.5 sm:grid-cols-3" aria-live="polite">
        {[
          ['Conversaciones', String(total)],
          ['Resueltas sin persona', `${58 + canal * 3} %`],
          ['Espera promedio', `${(1.4 + canal * 0.3).toFixed(1)} min`],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-xl bg-[#f5f8ff] p-4">
            <dt className="text-[11.5px] text-[#666d80]">{k}</dt>
            <dd className="m-0 mt-1 font-[family-name:var(--font-display)] text-[22px] font-semibold text-[#102a72]">{v}</dd>
          </div>
        ))}
      </dl>
      <figure className="m-0">
        <figcaption className="text-[12px] text-[#666d80]">Conversaciones por {periodo === 'semana' ? 'día' : 'semana'} · {CANALES[canal]}</figcaption>
        <ul className="m-0 mt-3 flex h-[220px] list-none items-end gap-2 border-b border-[#e7edfb] p-0 sm:gap-3.5">
          {valores.map((v, k) => (
            <li key={serie.etiquetas[k]} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-[11px] font-semibold text-[#102a72]">{v}</span>
              <span
                aria-hidden
                className={`block w-full max-w-[56px] rounded-t-lg bg-zero-600 motion-safe:transition-[height] motion-safe:duration-300`}
                style={{ height: `${Math.max(4, Math.round((170 * v) / maximo))}px` }}
              />
              <span className="sr-only">{serie.etiquetas[k]}: {v} conversaciones</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2 sm:gap-3.5" aria-hidden>
          {serie.etiquetas.map(e => <span key={e} className="min-w-0 flex-1 text-center text-[11px] text-[#666d80]">{e}</span>)}
        </div>
      </figure>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Ficticio />
        <p className="m-0 text-[12.5px] text-[#5c6373]">Exportar a Excel o CSV · queda anotado en la bitácora</p>
      </div>
    </div>
  );
}

// ── Administración: mini editor de flujo y horario ─────────────────────────────

const PASOS_FLUJO = [
  { nombre: 'Saludo y menú', detalle: 'Ofrece opciones con botones', texto: 'Hola. Puedo ayudarle con reclamaciones, consultas o citas.' },
  { nombre: 'Autorización de datos', detalle: 'Pide aceptar antes de seguir', texto: 'Antes de seguir, ¿acepta que usemos sus datos para atender su solicitud?' },
  { nombre: 'Formulario de reclamación', detalle: 'Pregunta de a una y valida', texto: 'Indíqueme su número de documento, por favor.' },
  { nombre: 'Pase a una persona', detalle: 'Dentro del horario', texto: '' },
] as const;

const horaTexto = (h: number) => `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'p. m.' : 'a. m.'}`;

export function ModuloAdministracion() {
  const [activos, setActivos] = useState([true, true, true, true]);
  const [cierre, setCierre] = useState(17);
  const [cambios, setCambios] = useState(0);
  const cambiar = () => setCambios(c => c + 1);
  const respuestas: string[] = PASOS_FLUJO.filter((p, k) => activos[k] && p.texto).map(p => p.texto);
  if (activos[3]) respuestas.push(`Le paso con una persona del equipo. Atendemos hasta las ${horaTexto(cierre)}.`);
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
      <div className={`${caja} flex flex-col gap-3.5`}>
        <p className={rotulo}>Pasos del flujo</p>
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {PASOS_FLUJO.map((p, k) => (
            <li key={p.nombre} className="flex items-center justify-between gap-3 rounded-xl border border-[#e7edfb] bg-[#fbfcff] px-3.5 py-3">
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-[#102a72]">{p.nombre}</span>
                <span className="block text-[12px] text-[#666d80]">{p.detalle}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={activos[k]}
                aria-label={p.nombre}
                onClick={() => { setActivos(a => a.map((v, j) => (j === k ? !v : v))); cambiar(); }}
                className={`relative h-[30px] w-[52px] shrink-0 cursor-pointer rounded-full ${transicion} ${activos[k] ? 'bg-zero-600' : 'bg-[#7b8395]'}`}
              >
                <span className={`absolute top-1 size-[22px] rounded-full bg-white ${transicion} ${activos[k] ? 'left-[26px]' : 'left-1'}`} />
              </button>
            </li>
          ))}
        </ol>
        <p className={`${rotulo} mt-1`}>Horario de atención con personas</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[14px] text-[#3b4252]">8:00 a. m. a</span>
          <button type="button" aria-label="Cerrar una hora antes" onClick={() => { if (cierre > 12) { setCierre(cierre - 1); cambiar(); } }} className="size-11 cursor-pointer rounded-[10px] border border-[#e4e8f4] bg-white text-[18px] text-[#102a72]">−</button>
          <span className="min-w-[88px] text-center font-[family-name:var(--font-display)] text-[17px] font-semibold text-[#102a72]" aria-live="polite">{horaTexto(cierre)}</span>
          <button type="button" aria-label="Cerrar una hora después" onClick={() => { if (cierre < 21) { setCierre(cierre + 1); cambiar(); } }} className="size-11 cursor-pointer rounded-[10px] border border-[#e4e8f4] bg-white text-[18px] text-[#102a72]">+</button>
        </div>
        <div className="mt-auto"><Ficticio /></div>
      </div>
      <div className={`${caja} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-[12px] text-[#666d80]">Vista previa · borrador sin publicar</p>
          <span className="rounded-full bg-[#edf1fe] px-2.5 py-1 text-[11px] font-semibold text-[#2a45c4]">Versión {14 + cambios}</span>
        </div>
        <div className="flex flex-1 flex-col gap-2.5 rounded-[14px] border border-[#eef1f8] bg-[#fbfcff] p-4" aria-live="polite">
          <Burbuja mia={false}>Hola, quiero hacer una reclamación.</Burbuja>
          {respuestas.map(t => <Burbuja key={t} mia>{t}</Burbuja>)}
        </div>
        <p className="m-0 text-[12px] text-[#666d80]">Cada cambio guarda quién lo hizo y cuándo. Se puede volver a cualquier versión.</p>
      </div>
    </div>
  );
}

// ── Idiomas: cambiar el idioma de un chat ──────────────────────────────────────

type Linea = readonly ['c' | 'a', string];
const ES: readonly Linea[] = [
  ['c', 'Hola, recibí un cargo que no reconozco.'],
  ['a', 'Lamento lo ocurrido. ¿Me indica la fecha y el monto del cargo?'],
  ['c', 'Fue el 2 de noviembre, por 1,250 pesos.'],
  ['a', 'Gracias. Registré su reclamación con el número SOL-1061 y le aviso por aquí cuando cambie.'],
];
const CHATS: readonly { nombre: string; codigo: string; mensajes: readonly Linea[] }[] = [
  { nombre: 'Español', codigo: 'es', mensajes: ES },
  { nombre: 'English', codigo: 'en', mensajes: [
    ['c', 'Hi, I got a charge I don’t recognize.'],
    ['a', 'I’m sorry about that. Could you tell me the date and amount of the charge?'],
    ['c', 'It was on November 2, for 1,250 pesos.'],
    ['a', 'Thank you. I filed your claim as SOL-1061 and will let you know here when it changes.'],
  ] },
  { nombre: 'Français', codigo: 'fr', mensajes: [
    ['c', 'Bonjour, j’ai reçu un débit que je ne reconnais pas.'],
    ['a', 'Je suis désolé. Pouvez-vous m’indiquer la date et le montant du débit ?'],
    ['c', 'C’était le 2 novembre, pour 1 250 pesos.'],
    ['a', 'Merci. J’ai enregistré votre réclamation sous le numéro SOL-1061 et je vous préviendrai ici dès qu’elle évolue.'],
  ] },
];

export function ModuloIdiomas() {
  const [k, setK] = useState(1);
  const c = CHATS[k];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div role="group" aria-label="Idioma de quien escribe" className="flex flex-wrap gap-2">
        {CHATS.map((x, j) => <Opcion key={x.codigo} activo={j === k} onClick={() => setK(j)}><span lang={x.codigo}>{x.nombre}</span></Opcion>)}
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
        <div className={`${caja} flex flex-col gap-2.5`} aria-live="polite">
          <p className="m-0 text-[12px] text-[#666d80]">Chat de la persona · <span lang={c.codigo}>{c.nombre}</span></p>
          <div lang={c.codigo} className="flex flex-col gap-2.5">
            {c.mensajes.map(([de, t]) => <Burbuja key={t} mia={de === 'a'}>{t}</Burbuja>)}
          </div>
        </div>
        <div className={`${caja} flex flex-col gap-2.5`}>
          <p className="m-0 text-[12px] text-[#666d80]">Bandeja del asesor · traducido al español</p>
          {ES.map(([de, t]) => <Burbuja key={t} mia={de === 'a'}>{t}</Burbuja>)}
          <div className="mt-2"><Ficticio /></div>
        </div>
      </div>
    </div>
  );
}
