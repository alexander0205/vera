'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp, Banknote, BookOpen, Check, Copy, CreditCard, FileDown, FilePen, GraduationCap, PackageSearch, Receipt, ScanSearch,
  Sparkles, ThumbsDown, ThumbsUp, TrendingUp, UserCog, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';
import { descargarPdf, type AsistenteEstado, type MensajeAsistente } from './use-asistente';
import { Markdown } from './markdown';
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
  m, ultimoError, onReintentar, resolver, valorar, motivar, probarConIa, puedeIa,
}: {
  m: MensajeAsistente; ultimoError: boolean; onReintentar: () => void;
  resolver: (mensajeId: number, token: string, confirmar: boolean) => void;
  valorar: (mensajeId: number, valor: 1 | -1) => void;
  motivar: (mensajeId: number, motivo: string) => void;
  /** Ofrecer «Preguntar a la IA» (solo en la última respuesta automática). */
  probarConIa?: () => void;
  puedeIa?: boolean;
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
          {m.error ? m.contenido : <Markdown texto={m.contenido} />}
          {m.error && ultimoError && (
            <div><button type="button" className={s.reintentar} onClick={onReintentar}>Reintentar</button></div>
          )}
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
            <div className={s.accionesMensaje}>
              {m.id > 0 && (
                <button
                  type="button"
                  className={`${s.copiar} ${m.grande ? s.pdfGrande : ''}`}
                  onClick={() => descargarPdf(m.id)}
                  aria-label="Descargar esta respuesta en PDF"
                >
                  <FileDown size={13} aria-hidden />
                  {m.grande ? 'Descargar PDF' : 'PDF'}
                </button>
              )}
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
            {puedeIa && probarConIa && m.origen === 'local' && m.id > 0 && (
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
  const listaRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

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

        {a.mensajes.map((m) => (
          <MensajeAsistenteVista key={m.id} m={m} ultimoError={ultimoEsError} onReintentar={() => a.reintentar()} resolver={a.resolverPropuesta} valorar={a.valorar} motivar={a.motivar}
            probarConIa={m.id === ultimaRespuestaId ? () => void a.probarConIa() : undefined} puedeIa={a.ia && !a.enviando} />
        ))}

        {a.enviando && (
          <div className={`${s.fila} ${s.filaAsistente}`} role="status">
            <span className={s.avatar} aria-hidden><Sparkles size={13} /></span>
            <div className={s.pensando}>
              <span className={s.puntos} aria-hidden><i /><i /><i /></span>
              Consultando tus datos…
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
