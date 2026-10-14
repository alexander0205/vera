'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp, Check, Copy, CreditCard, Receipt, Sparkles, TrendingUp, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { AsistenteEstado, MensajeAsistente } from './use-asistente';
import { Markdown } from './markdown';
import s from './asistente.module.css';

/**
 * El cuerpo del asistente (mensajes + compositor). El marco, el encabezado y el
 * selector Asistente | Soporte los pone TicketWidget, porque son compartidos con
 * la vista de soporte humano.
 */

const SUGERENCIAS: { texto: string; icono: LucideIcon }[] = [
  { texto: '¿Cuánto he vendido este mes?', icono: TrendingUp },
  { texto: '¿Quién me debe y cuánto?', icono: Users },
  { texto: '¿Cómo van los cobros por método de pago?', icono: CreditCard },
  { texto: '¿Cuáles son mis mejores clientes?', icono: Wallet },
  { texto: 'Resumen de ITBIS del mes', icono: Receipt },
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
  m, ultimoError, onReintentar,
}: { m: MensajeAsistente; ultimoError: boolean; onReintentar: () => void }) {
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
        {!m.error && (
          <div className={s.debajo}>
            {m.herramientas && m.herramientas.length > 0 && (
              <span className={s.consulto} title="Datos consultados">
                {m.herramientas.map((h) => h.nombre).filter((n, i, a) => a.indexOf(n) === i).join(' · ')}
              </span>
            )}
            <BotonCopiar texto={m.contenido} />
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
              {SUGERENCIAS.map(({ texto: q, icono: Icono }) => (
                <button key={q} type="button" className={s.chip} onClick={() => mandar(q)}>
                  <Icono size={16} aria-hidden />
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {a.mensajes.map((m) => (
          <MensajeAsistenteVista key={m.id} m={m} ultimoError={ultimoEsError} onReintentar={() => a.reintentar()} />
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
