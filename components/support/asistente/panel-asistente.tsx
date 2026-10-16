'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle, AlertTriangle, ArrowRight, ArrowUp, CheckCircle2, Circle, Rocket, ChevronDown, Sheet, Banknote, History, BookOpen, Check, Copy, CreditCard, FileDown, FilePen, GraduationCap, PackageSearch, Receipt, ScanSearch,
  Sparkles, ThumbsDown, ThumbsUp, TrendingUp, UserCog, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';
import { descargarExcel, descargarPdf, type AsistenteEstado, type MensajeAsistente } from './use-asistente';
import { tieneDatosTabulares } from '@/lib/asistente/bloques';
import { preguntaDeLoQueVende } from '@/lib/asistente/primeros-pasos';
import { Markdown } from './markdown';
import { bloquesDeRevelado, conviene, pasoDeRevelado } from '@/lib/asistente/revelado';
import { describirError, mensajeDeEspera } from '@/lib/asistente/estados';
import s from './asistente.module.css';

/**
 * El cuerpo del asistente (mensajes + compositor). El marco, el encabezado y el
 * selector Asistente | Soporte los pone TicketWidget, porque son compartidos con
 * la vista de soporte humano.
 */

const ICONOS: Record<string, LucideIcon> = {
  resumen: Sparkles, ventas: TrendingUp, cartera: Users, cobros: CreditCard, clientes: Wallet, itbis: Receipt, revisar: ScanSearch,
  borradores: FilePen, inventario: PackageSearch, escolar: GraduationCap, nomina: UserCog, caja: Banknote, guia: BookOpen,
};

// Respaldo: el servidor manda los atajos según los módulos y permisos de la empresa.
const SUGERENCIAS: { texto: string; icono: LucideIcon }[] = [
  { texto: '¿Cuánto he vendido este mes?', icono: TrendingUp },
  { texto: '¿Quién me debe y cuánto?', icono: Users },
  { texto: '¿Cómo van los cobros por método de pago?', icono: CreditCard },
  { texto: '¿Cuáles son mis mejores clientes?', icono: Wallet },
  { texto: 'Resumen de ITBIS del mes', icono: Receipt },
];

const MOTIVOS: [string, string][] = [
  ['dato-incorrecto', 'Dato incorrecto'],
  ['enlace-incorrecto', 'Enlace incorrecto'],
  ['no-entendio', 'No me entendió'],
  ['incompleto', 'Incompleta'],
  ['otro', 'Otro'],
];

/**
 * La respuesta que acaba de llegar se muestra por bloques completos, de arriba
 * hacia abajo, en menos de un segundo. Con movimiento reducido, o si es corta,
 * aparece entera. Lo que no es nuevo (historial) nunca se anima.
 */
function TextoRevelado({ texto, nuevo, alCrecer, clave }: { texto: string; nuevo: boolean; alCrecer: () => void; clave?: string }) {
  const bloques = useMemo(() => bloquesDeRevelado(texto), [texto]);
  const [visibles, setVisibles] = useState(() => {
    const reducido = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return nuevo && !reducido && conviene(texto) ? 1 : bloques.length;
  });
  useEffect(() => {
    if (visibles >= bloques.length) return;
    const t = setTimeout(() => setVisibles((v) => v + 1), pasoDeRevelado(bloques.length));
    return () => clearTimeout(t);
  }, [visibles, bloques.length]);
  useEffect(() => { alCrecer(); }, [visibles, alCrecer]);
  return <Markdown texto={visibles >= bloques.length ? texto : bloques.slice(0, visibles).join('\n\n')} clave={clave} />;
}

/** Un error con explicación y la salida que corresponde (reintentar, esperar o hablar con alguien). */
function ErrorVista({ texto, esElUltimo, onReintentar, onPersona }: { texto: string; esElUltimo: boolean; onReintentar: () => void; onPersona: () => void }) {
  const e = describirError(texto);
  return (
    <div className={s.errorCaja}>
      <p className={s.errorTitulo}><AlertCircle size={15} aria-hidden /> {e.titulo}</p>
      <p className={s.errorDetalle}>{e.detalle}</p>
      {esElUltimo && (e.puedeReintentar || e.ofrecerPersona) && (
        <div className={s.errorAcciones}>
          {e.puedeReintentar && <button type="button" className={s.reintentar} onClick={onReintentar}>Reintentar</button>}
          {e.ofrecerPersona && <button type="button" className={s.reintentar} onClick={onPersona}>Hablar con una persona</button>}
        </div>
      )}
    </div>
  );
}

/** «Consultando…» que, si tarda, lo dice con honestidad en vez de quedarse igual. */
function Esperando() {
  const [seg, setSeg] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeg((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{mensajeDeEspera(seg)}</>;
}

/**
 * «Descargar» con un menú: PDF o Excel (Excel solo si la respuesta trae tablas,
 * gráficos o tarjetas). Sin datos tabulares no hay nada que elegir y el botón
 * baja el PDF directo.
 */
function MenuDescarga({ mensajeId, conExcel, destacado }: { mensajeId: number; conExcel: boolean; destacado: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Se cierra al tocar fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);

  if (!conExcel) {
    return (
      <button
        type="button" className={`${s.copiar} ${destacado ? s.pdfGrande : ''}`}
        onClick={() => descargarPdf(mensajeId)} aria-label="Descargar esta respuesta en PDF"
      >
        <FileDown size={13} aria-hidden />
        {destacado ? 'Descargar PDF' : 'PDF'}
      </button>
    );
  }

  const elegir = (formato: 'pdf' | 'excel') => {
    setAbierto(false);
    if (formato === 'pdf') descargarPdf(mensajeId);
    else descargarExcel(mensajeId);
  };

  return (
    <div className={s.menuDescarga} ref={caja}>
      <button
        type="button" className={`${s.copiar} ${destacado ? s.pdfGrande : ''}`}
        onClick={() => setAbierto((v) => !v)} aria-haspopup="menu" aria-expanded={abierto}
        aria-label="Descargar esta respuesta"
      >
        <FileDown size={13} aria-hidden />
        Descargar
        <ChevronDown size={12} aria-hidden className={abierto ? s.chevronAbierto : undefined} />
      </button>
      {abierto && (
        <div className={s.menuLista} role="menu" aria-label="Formato de descarga">
          <button type="button" role="menuitem" className={s.menuOpcion} onClick={() => elegir('pdf')} autoFocus>
            <FileDown size={14} aria-hidden />
            <span><strong>PDF</strong><small>Para leer o imprimir</small></span>
          </button>
          <button type="button" role="menuitem" className={s.menuOpcion} onClick={() => elegir('excel')}>
            <Sheet size={14} aria-hidden />
            <span><strong>Excel</strong><small>Para filtrar o sumar</small></span>
          </button>
        </div>
      )}
    </div>
  );
}

function saludo(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function BotonCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      // Sin permiso de portapapeles: no se hace nada; el texto sigue seleccionable.
    }
  }
  return (
    <button type="button" className={s.copiar} onClick={copiar} aria-label="Copiar respuesta">
      {copiado ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      {copiado ? 'Copiado' : 'Copiar'}
    </button>
  );
}

function MensajeAsistenteVista({
  m, ultimoError, onReintentar, onPersona, resolver, valorar, motivar, probarConIa, puedeIa, preguntar, alCrecer,
}: {
  m: MensajeAsistente; ultimoError: boolean; onReintentar: () => void; onPersona: () => void;
  resolver: (mensajeId: number, token: string, confirmar: boolean) => void;
  valorar: (mensajeId: number, valor: 1 | -1) => void;
  motivar: (mensajeId: number, motivo: string) => void;
  /** Ofrecer «Preguntar a la IA» (solo en la última respuesta automática). */
  probarConIa?: () => void;
  puedeIa?: boolean;
  /** Mandar una pregunta (los botones de «qué preguntar después»). Solo en la última respuesta. */
  preguntar?: (texto: string) => void;
  /** Se llama cuando la respuesta crece (se va revelando): el panel baja al final. */
  alCrecer: () => void;
}) {
  if (m.rol === 'user') {
    return (
      <div className={`${s.fila} ${s.filaUsuario}`}>
        <div className={`${s.burbuja} ${s.burbujaUsuario}`}>{m.contenido}</div>
      </div>
    );
  }
  return (
    <div className={`${s.fila} ${s.filaAsistente}`}>
      <span className={s.avatar} aria-hidden><Sparkles size={13} /></span>
      <div className={s.cuerpo}>
        <div className={`${s.burbuja} ${s.burbujaAsistente} ${m.error ? s.burbujaError : ''}`}>
          {m.error ? <ErrorVista texto={m.contenido} esElUltimo={ultimoError} onReintentar={onReintentar} onPersona={onPersona} /> : <TextoRevelado texto={m.contenido} nuevo={m.nuevo === true} alCrecer={alCrecer} clave={m.id > 0 ? `msg-${m.id}` : undefined} />}
        </div>
        {m.propuestas?.map((p) => (
          <div key={p.token} className={`${s.propuesta} ${p.destructiva ? s.propuestaPeligro : ''}`} role="group" aria-label="Confirmar acción">
            <p className={s.propuestaTitulo}>
              {p.destructiva ? 'Vas a eliminar' : p.tipo === 'crear' ? 'Vas a crear' : 'Vas a modificar'}
            </p>
            <p className={s.propuestaTexto}>{p.resumen}</p>
            {p.estado === 'hecha' && <p className={s.propuestaOk}>{p.resultado ?? 'Listo.'}{p.enlace ? <> <Markdown texto={`[Abrir](${p.enlace})`} /></> : null}</p>}
            {p.estado === 'cancelada' && <p className={s.propuestaNota}>Cancelado. No se hizo ningún cambio.</p>}
            {p.estado === 'error' && <p className={s.errorDerivar} role="alert">{p.resultado}</p>}
            {(p.estado === 'pendiente' || p.estado === 'confirmando' || p.estado === 'error') && (
              <div className={s.propuestaBotones}>
                <button type="button" className={s.btnPrimario} disabled={p.estado === 'confirmando'} onClick={() => resolver(m.id, p.token, true)}>
                  {p.estado === 'confirmando' ? 'Confirmando…' : 'Confirmar'}
                </button>
                <button type="button" className={s.reintentar} disabled={p.estado === 'confirmando'} onClick={() => resolver(m.id, p.token, false)}>Cancelar</button>
              </div>
            )}
          </div>
        ))}
        {!m.error && (
          <div className={s.debajo}>
            {m.herramientas && m.herramientas.length > 0 && (
              <span className={s.consulto} title="Datos consultados">
                {m.herramientas.map((h) => h.nombre).filter((n, i, a) => a.indexOf(n) === i).join(' · ')}
              </span>
            )}
            <div className={s.accionesMensaje} style={/```(formulario|paso)/.test(m.contenido) ? { display: 'none' } : undefined}>
              {m.id > 0 && <MenuDescarga mensajeId={m.id} conExcel={tieneDatosTabulares(m.contenido)} destacado={m.grande === true} />}
              {m.id > 0 && (
                <>
                  <button
                    type="button" className={`${s.valorar} ${m.valoracion === 1 ? s.valorarOn : ''}`}
                    onClick={() => valorar(m.id, 1)} aria-pressed={m.valoracion === 1} aria-label="Respuesta útil" title="Útil"
                  ><ThumbsUp size={13} aria-hidden /></button>
                  <button
                    type="button" className={`${s.valorar} ${m.valoracion === -1 ? s.valorarMal : ''}`}
                    onClick={() => valorar(m.id, -1)} aria-pressed={m.valoracion === -1} aria-label="Respuesta no útil" title="No me sirvió"
                  ><ThumbsDown size={13} aria-hidden /></button>
                </>
              )}
              <BotonCopiar texto={m.contenido} />
            </div>
            {preguntar && m.seguimientos && m.seguimientos.length > 0 && m.id > 0 && (
              <div className={s.seguimientos} role="group" aria-label="Qué preguntar después">
                {m.seguimientos.map((q) => (
                  <button key={q} type="button" className={s.motivo} onClick={() => preguntar(q)}>{q}</button>
                ))}
              </div>
            )}
            {puedeIa && probarConIa && m.origen === 'local' && m.id > 0 && !/```(formulario|paso)/.test(m.contenido) && (
              <div className={s.motivos}>
                <button type="button" className={s.motivo} onClick={probarConIa}>
                  ¿No es lo que buscabas? Preguntar a la IA
                </button>
              </div>
            )}
            {m.valoracion === -1 && m.id > 0 && (
              <div className={s.motivos} role="group" aria-label="¿Qué falló?">
                {m.valoracionMotivo ? (
                  <span className={s.motivoGracias}><Check size={13} aria-hidden /> Gracias, lo revisaremos.</span>
                ) : (
                  <>
                    <span className={s.motivoEtiqueta}>¿Qué falló?</span>
                    {MOTIVOS.map(([clave, texto]) => (
                      <button key={clave} type="button" className={s.motivo} onClick={() => motivar(m.id, clave)}>{texto}</button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function PanelAsistente({
  a, onDerivada, onIrASoporte,
}: {
  a: AsistenteEstado;
  /** Se llama cuando el ticket ya se abrió, para pasar a la vista de soporte. */
  onDerivada: () => void;
  /** Sin conversación que entregar, «hablar con una persona» solo cambia de vista. */
  onIrASoporte: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [verHistorial, setVerHistorial] = useState(false);
  const [vende, setVende] = useState('');
  const listaRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  const irAlFinal = useCallback(() => {
    const el = listaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Siempre ver lo último: respuesta nueva o «consultando…».
  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [a.mensajes, a.enviando]);

  // El campo crece con el texto hasta un tope.
  useEffect(() => {
    const el = campoRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [texto]);

  // Al abrir, el cursor ya está en el campo.
  useEffect(() => { campoRef.current?.focus(); }, []);

  function mandar(t: string) {
    const limpio = t.trim();
    if (!limpio || a.enviando) return;
    setTexto('');
    void a.enviar(limpio);
  }

  // Un formulario del chat puede pedir «mejor pregúntame»: se manda como un mensaje más.
  useEffect(() => {
    const alPedir = (ev: Event) => {
      const t = (ev as CustomEvent<string>).detail;
      if (typeof t === 'string' && t.length < 200) mandar(t);
    };
    window.addEventListener('asistente:enviar', alPedir);
    return () => window.removeEventListener('asistente:enviar', alPedir);
  });

  async function hablarConPersona() {
    // Sin conversación que entregar, o ya entregada: solo se cambia de vista.
    if (a.mensajes.length === 0 || a.derivada) { onIrASoporte(); return; }
    if (await a.derivar()) onDerivada();
  }

  const vacio = a.mensajes.length === 0;
  const ultimoEsError = a.mensajes[a.mensajes.length - 1]?.error === true;
  // «Preguntar a la IA» solo en la última respuesta: es la que la persona acaba de ver.
  const ultimaRespuestaId = [...a.mensajes].reverse().find((m) => m.rol === 'assistant' && !m.error)?.id;
  const nombre = a.perfil.usuario;
  const empresa = a.perfil.empresa;

  return (
    <>
      <div
        ref={listaRef}
        className={s.mensajes}
        role="log"
        aria-live="polite"
        aria-label="Conversación con el asistente"
      >
        {vacio && !a.enviando && (
          <div className={s.bienvenida}>
            <span className={s.bienvenidaMarca} aria-hidden><Sparkles size={22} /></span>
            <div>
              <h3>{saludo()}{nombre ? `, ${nombre}` : ''}</h3>
              <p>
                {empresa
                  ? <>Pregúntame lo que necesites saber de <strong>{empresa}</strong>: ventas, cobros, cartera e impuestos.</>
                  : 'Pregúntame lo que necesites saber de tu negocio: ventas, cobros, cartera e impuestos.'}
              </p>
            </div>
            {a.primerosPasos && (
              <section className={s.primeros} aria-label="Primeros pasos">
                <header className={s.primerosCabecera}>
                  <Rocket size={16} aria-hidden />
                  <strong>Primeros pasos</strong>
                  <span>{a.primerosPasos.hechos} de {a.primerosPasos.total}</span>
                </header>
                <div
                  className={s.progreso}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={a.primerosPasos.porcentaje}
                  aria-label="Avance de primeros pasos"
                >
                  <span style={{ width: `${Math.max(4, a.primerosPasos.porcentaje)}%` }} />
                </div>
                <ol className={s.pasos}>
                  {a.primerosPasos.pasos.map((p, i) => {
                    const actual = a.primerosPasos?.siguiente?.indice === i;
                    return (
                      <li key={p.titulo} className={`${s.paso} ${p.estado === 'hecho' ? s.pasoHecho : ''} ${actual ? s.pasoActual : ''}`}>
                        {p.estado === 'hecho' ? <CheckCircle2 size={16} aria-hidden /> : <Circle size={16} aria-hidden />}
                        <Link href={p.tour}>
                          <strong>{p.titulo}{p.opcional ? ' (opcional)' : ''}</strong>
                          {actual && <small>{p.detalle}</small>}
                        </Link>
                        {actual && <span className={s.mostrar}>Mostrarme <ArrowRight size={14} aria-hidden /></span>}
                      </li>
                    );
                  })}
                </ol>
                <form
                  className={s.vende}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const t = vende.trim();
                    if (!t) return;
                    setVende('');
                    mandar(preguntaDeLoQueVende(t));
                  }}
                >
                  <label htmlFor="asistente-vende">¿Qué productos o servicios vendes?</label>
                  <div>
                    <input
                      id="asistente-vende"
                      value={vende}
                      maxLength={300}
                      onChange={(e) => setVende(e.target.value)}
                      placeholder="Ej.: uniformes, útiles escolares y mensualidades"
                    />
                    <button type="submit" disabled={!vende.trim()}>Armar mi lista</button>
                  </div>
                </form>
              </section>
            )}
            {a.alertas && a.alertas.length > 0 && (
              <div className={s.alertas} role="region" aria-label="Para revisar hoy">
                <span className={s.etiqueta}>Para revisar</span>
                {a.alertas.map((al) => (
                  <Link key={al.id} href={al.enlace} className={`${s.alerta} ${al.nivel === 'alto' ? s.alertaAlta : ''}`}>
                    <AlertTriangle size={16} aria-hidden />
                    <span className={s.alertaTexto}>
                      <strong>{al.titulo}</strong>
                      <small>{al.detalle}</small>
                    </span>
                    <span className={s.alertaAccion}>{al.accion}</span>
                  </Link>
                ))}
              </div>
            )}
            {a.perfil.frecuentes.length > 0 && (
              <div className={s.sugerencias}>
                <span className={s.etiqueta}>Lo que sueles preguntar</span>
                {a.perfil.frecuentes.map((q) => (
                  <button key={q} type="button" className={s.chip} onClick={() => mandar(q)}>
                    <History size={16} aria-hidden />
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            )}
            <div className={s.sugerencias}>
              <span className={s.etiqueta}>Prueba con</span>
              {(a.perfil.sugerencias?.length
                ? a.perfil.sugerencias.map((x) => ({ texto: x.texto, icono: ICONOS[x.icono] ?? Sparkles }))
                : SUGERENCIAS
              ).map(({ texto: q, icono: Icono }) => (
                <button key={q} type="button" className={s.chip} onClick={() => mandar(q)}>
                  <Icono size={16} aria-hidden />
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={s.historial}>
          <button
            type="button" className={s.historialBoton} aria-expanded={verHistorial}
            onClick={() => { setVerHistorial((v) => !v); if (!verHistorial) void a.cargarConversaciones(); }}
          >
            <History size={13} aria-hidden /> Conversaciones anteriores
          </button>
          {verHistorial && (
            <ul className={s.historialLista}>
              {a.conversaciones.length === 0 && <li className={s.historialVacio}>Todavía no hay conversaciones anteriores.</li>}
              {a.conversaciones.map((c) => (
                <li key={c.id}>
                  <button
                    type="button" className={`${s.historialItem} ${c.id === a.conversacionId ? s.historialActual : ''}`}
                    onClick={async () => { if (await a.abrirConversacion(c.id)) setVerHistorial(false); }}
                  >
                    <span className={s.historialTitulo}>{c.titulo || 'Conversación'}</span>
                    <span className={s.historialFecha}>{new Date(c.actualizadaEn).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {a.mensajes.map((m) => (
          <MensajeAsistenteVista key={m.id} m={m} ultimoError={ultimoEsError} onReintentar={() => a.reintentar()} onPersona={() => void hablarConPersona()} resolver={a.resolverPropuesta} valorar={a.valorar} motivar={a.motivar}
            probarConIa={m.id === ultimaRespuestaId ? () => void a.probarConIa() : undefined} puedeIa={a.ia && !a.enviando}
            preguntar={m.id === ultimaRespuestaId && !a.enviando ? (q) => mandar(q) : undefined}
            alCrecer={irAlFinal} />
        ))}

        {a.enviando && (
          <div className={`${s.fila} ${s.filaAsistente}`} role="status">
            <span className={s.avatar} aria-hidden><Sparkles size={13} /></span>
            <div className={s.pensando}>
              <span className={s.puntos} aria-hidden><i /><i /><i /></span>
              <Esperando />
            </div>
          </div>
        )}
      </div>

      <div className={s.pie}>
        {a.derivada && <p className={s.derivada}>Ya abriste un ticket con esta conversación.</p>}
        {a.errorDerivar && <p className={s.errorDerivar} role="alert">{a.errorDerivar}</p>}
        <div className={s.compositor}>
          <textarea
            id="asistente-texto"
            ref={campoRef}
            className={s.texto}
            rows={1}
            value={texto}
            maxLength={1500}
            placeholder="Escribe tu pregunta…"
            aria-label="Pregunta para el asistente"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                mandar(texto);
              }
            }}
          />
          <button
            type="button"
            className={s.enviar}
            onClick={() => mandar(texto)}
            disabled={!texto.trim() || a.enviando}
            aria-label="Enviar pregunta"
          >
            <ArrowUp size={18} aria-hidden />
          </button>
        </div>
        <div className={s.notas}>
          <span>Puede equivocarse: revisa las cifras importantes.</span>
          <button type="button" className={s.humano} onClick={hablarConPersona} disabled={a.derivando}>
            {a.derivando ? 'Abriendo ticket…' : a.derivada ? 'Ver mi ticket' : 'Hablar con una persona'}
          </button>
        </div>
      </div>
    </>
  );
}
