'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2, ExternalLink, Loader2, Mail, MessageCircle, Smartphone } from 'lucide-react';
import { SaludWhatsApp } from './SaludWhatsApp';
import { Button } from '@/components/ui/button';
import type { CanalesActivos } from '@/lib/administracion-escolar/canales';

/**
 * Por dónde le salen los avisos al tutor: correo, WhatsApp y SMS.
 *
 * Esta pantalla hace dos cosas por canal: enlazarlo (una sola vez) y encenderlo
 * o apagarlo. Lo segundo es el interruptor maestro — con el canal apagado no
 * sale nada por ahí, diga lo que diga el concepto. Sin él, callar el correo un
 * mes obligaba a entrar concepto por concepto y a volver a encenderlos uno a
 * uno después.
 *
 * Qué se avisa y cuándo sigue decidiéndose en Conceptos. Aquí no.
 */

/** Lo que devuelve `GET /api/whatsapp/estado`: número ya enmascarado. */
interface EstadoWhatsApp {
  configurado: boolean;
  conectado: boolean;
  numeroWhatsapp: string | null;
}

// Misma clave y misma forma que en ConceptoDetalle a propósito: al enlazar
// aquí, el interruptor "Enviar por WhatsApp" de los conceptos se entera solo.
// Un fallo de red se trata como "sin conectar", para no ofrecer un canal que
// no se sabe si va.
const traerEstado = (u: string): Promise<EstadoWhatsApp> =>
  fetch(u).then((r) => (r.ok ? r.json() : { configurado: false, conectado: false, numeroWhatsapp: null }));

/**
 * Lo que devuelve `GET /api/sms/estado`. Con el canal activo el motivo llega
 * en `null`, y opcional además porque el fallback de aquí abajo no lo trae.
 */
interface EstadoSms {
  habilitado: boolean;
  motivo?: 'sin-credenciales' | null;
}

// Mientras la ruta no exista, el 404 cae aquí y el canal queda apagado en vez
// de romper la pantalla. Mismo trato para un fallo de red: es preferible no
// ofrecer el canal que ofrecer un envío que no sale.
const traerSms = (u: string): Promise<EstadoSms> =>
  fetch(u).then((r) => (r.ok ? r.json() : { habilitado: false })).catch(() => ({ habilitado: false }));

/**
 * El interruptor de encender/apagar. Mismo dibujo que el de Conceptos: es el
 * mismo gesto y verlo distinto haría dudar de si hace lo mismo.
 */
function Interruptor({ activo, onCambiar, etiqueta, disabled }: {
  activo: boolean; onCambiar: (v: boolean) => void; etiqueta: string; disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta}
      disabled={disabled} onClick={() => onCambiar(!activo)}
      className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
        disabled ? 'cursor-not-allowed bg-gray-200' : activo ? 'bg-zero-600' : 'bg-gray-300'
      }`}>
      <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
        activo ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  );
}

// Si la lectura falla, los tres se dan por encendidos: es lo que significa no
// tener fila guardada, y apagarlos por un fallo de red haría creer al colegio
// que dejó de mandar avisos cuando en realidad los sigue mandando.
const traerCanales = (u: string): Promise<CanalesActivos> =>
  fetch(u)
    .then((r) => (r.ok ? r.json() : { correo: true, whatsapp: true, sms: true }))
    .catch(() => ({ correo: true, whatsapp: true, sms: true }));

/**
 * «Mándame uno a mí para ver si sale.»
 *
 * Es la única forma de separar un canal mal enlazado de una familia sin
 * celular: hasta ahora las dos cosas se veían igual —no llega nada— y se
 * arreglan en pantallas distintas. El destino se escribe a mano a propósito;
 * probar con el número de una familia real es mandarle un mensaje a esa
 * familia.
 *
 * No marca nada como avisado: el recordatorio que le tocaba a cada cargo sigue
 * pendiente después de probar.
 */
function ProbarCanal({ canal, etiqueta, placeholder, disponible, motivo }: {
  canal: 'correo' | 'whatsapp' | 'sms';
  etiqueta: string;
  placeholder: string;
  disponible: boolean;
  /** Por qué no se puede probar todavía. Se dice en vez de esconder el campo. */
  motivo?: string;
}) {
  const [destino, setDestino] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  async function probar() {
    setEnviando(true);
    setResultado(null);
    try {
      const res = await fetch('/api/administracion-escolar/avisos/probar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canal, destino }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResultado({ ok: false, texto: json.error ?? 'No se pudo enviar' });
        return;
      }
      // Para el SMS se dice en cuántas partes salió: es lo que se paga, y es la
      // única pantalla donde ese número se puede ver antes de mandarle a un
      // colegio entero.
      const partes = json.partes ? ` · ${json.partes} parte(s), ${json.codificacion}` : '';
      setResultado({ ok: true, texto: `Enviado a ${json.telefono ?? json.destino}${partes}` });
    } catch {
      setResultado({ ok: false, texto: 'Error de conexión' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <p className="text-xs font-medium text-gray-700">Probar este canal</p>
      <p className="mt-0.5 text-xs text-gray-500">
        {disponible
          ? `Manda un mensaje de prueba a ${etiqueta}. No le llega a ninguna familia ni cuenta como aviso.`
          : motivo}
      </p>
      {disponible && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder={placeholder}
            className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-zero-600"
          />
          <Button size="sm" variant="outline" disabled={enviando || !destino.trim()} onClick={() => void probar()}>
            {enviando ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Enviando…</> : 'Enviar prueba'}
          </Button>
        </div>
      )}
      {resultado && (
        <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${
          resultado.ok
            ? 'border border-green-200 bg-green-50 text-green-800'
            : 'border border-red-200 bg-red-50 text-red-700'
        }`}>
          {resultado.texto}
        </p>
      )}
    </div>
  );
}

export function CanalesAviso() {
  // El GET es la lectura barata de lo guardado. A la API de WhatsApp solo se
  // sale cuando el usuario lo pide (conectar, terminar el enlace o revisar).
  const { data, isLoading, mutate } = useSWR<EstadoWhatsApp>('/api/whatsapp/estado', traerEstado);

  // Misma clave que en ConceptoDetalle, para que el interruptor de SMS de los
  // conceptos y esta pantalla nunca digan cosas distintas.
  const { data: sms } = useSWR<EstadoSms>('/api/sms/estado', traerSms);
  const smsDisponible = sms?.habilitado === true;

  // Los interruptores maestros. Se pintan optimistas —con `optimisticData`— y
  // se revalidan: apretar un interruptor y verlo volver atrás medio segundo
  // hace dudar de si guardó.
  const { data: canales, mutate: mutarCanales } = useSWR<CanalesActivos>(
    '/api/administracion-escolar/canales', traerCanales,
  );
  const [guardandoCanal, setGuardandoCanal] = useState<keyof CanalesActivos | null>(null);
  const [errorCanal, setErrorCanal] = useState<string | null>(null);

  async function cambiarCanal(canal: keyof CanalesActivos, valor: boolean) {
    if (!canales) return;
    setGuardandoCanal(canal);
    setErrorCanal(null);
    const siguiente = { ...canales, [canal]: valor };
    try {
      await mutarCanales(
        async () => {
          const res = await fetch('/api/administracion-escolar/canales', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [canal]: valor }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar');
          return json as CanalesActivos;
        },
        { optimisticData: siguiente, revalidate: false, rollbackOnError: true },
      );
    } catch (e: unknown) {
      setErrorCanal(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardandoCanal(null);
    }
  }

  const correoActivo = canales?.correo !== false;
  const whatsappActivo = canales?.whatsapp !== false;
  const smsEncendido = canales?.sms !== false;

  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faltaEmail, setFaltaEmail] = useState(false);
  const [linkEnlace, setLinkEnlace] = useState<string | null>(null);
  const [enlazando, setEnlazando] = useState(false);
  const [claveNegocio, setClaveNegocio] = useState('');

  /** Enlazar una cuenta que ya existe. La clave no se guarda en el estado más
   *  de lo necesario: al terminar bien se borra del formulario. */
  async function enlazar() {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp/enlazar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: claveNegocio.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'No se pudo enlazar');
        return;
      }
      setClaveNegocio('');
      setEnlazando(false);
      // Puede quedar enlazada pero sin número confirmado: ahí sí hace falta
      // pasar por Meta, y el link es lo único que lleva.
      if (json.connectUrl) setLinkEnlace(json.connectUrl);
      await mutate().catch(() => {});
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setOcupado(false);
    }
  }

  const configurado = data?.configurado === true;
  const conectado = data?.conectado === true;

  /**
   * El link de Meta lo devuelve el servidor, así que para cuando llega ya
   * pasó el clic y el navegador da la ventana por emergente y la bloquea. Se
   * abre en blanco durante el clic y se le pone la dirección al responder; si
   * aun así la bloquean, el link queda pintado abajo y no se pierde.
   */
  async function llamar(endpoint: string, esperaLink: boolean) {
    const ventana = esperaLink ? window.open('', '_blank') : null;
    setOcupado(true);
    setError(null);
    setFaltaEmail(false);
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        ventana?.close();
        // 422 es el único error que el colegio puede resolver solo, y se
        // resuelve en otra pantalla: vale la pena llevarlo de la mano.
        setFaltaEmail(res.status === 422);
        setError(json.error ?? 'No se pudo conectar. Intenta de nuevo.');
        return;
      }

      if (json.connectUrl) {
        setLinkEnlace(json.connectUrl);
        if (ventana) ventana.location.href = json.connectUrl;
        else window.open(json.connectUrl, '_blank', 'noopener,noreferrer');
      } else {
        ventana?.close();
      }

      // El POST devuelve el teléfono completo y el GET lo devuelve enmascarado;
      // se relee para que esta pantalla y la de conceptos vean lo mismo. Si la
      // relectura falla da igual: la cuenta ya quedó conectada y decir "error"
      // aquí mandaría a repetir algo que sí funcionó.
      await mutate().catch(() => {});
    } catch {
      ventana?.close();
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Aquí se enlaza cada canal una sola vez. Qué se avisa y cuándo se decide en{' '}
        <span className="font-medium text-gray-700">Conceptos</span>.
      </p>

      {/* Lo primero, porque es lo que nadie pregunta y todos asumen: que los
          avisos que se mandaron llegaron. Un canal roto se ve igual que uno
          sano hasta que se mira aquí. */}
      <SaludWhatsApp />

      {errorCanal && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {errorCanal}
        </p>
      )}

      {/* ── Correo ─────────────────────────────────────────────────────────
          Va primero porque es el único que no hay que enlazar: el colegio ya
          manda facturas por correo, así que este canal funciona desde el día
          uno. Los otros dos dependen de algo de fuera. */}
      <div className={`rounded-lg border border-gray-200 bg-white ${correoActivo ? '' : 'opacity-70'}`}>
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
          <Mail className={`h-4 w-4 ${correoActivo ? 'text-zero-600' : 'text-gray-400'}`} />
          <span className="flex-1 text-sm font-medium text-gray-900">Correo</span>
          <Interruptor
            activo={correoActivo}
            disabled={guardandoCanal === 'correo'}
            etiqueta="Enviar avisos por correo"
            onCambiar={(v) => void cambiarCanal('correo', v)}
          />
        </div>

        <div className="px-4 py-4">
          <p className="text-sm text-gray-500">
            {correoActivo
              ? 'Los avisos salen al correo del tutor responsable. No hay nada que enlazar: usa el mismo remitente que las facturas.'
              : 'Apagado: no sale ningún aviso por correo, aunque el concepto lo tenga encendido.'}
          </p>

          <ProbarCanal
            canal="correo" etiqueta="un correo tuyo"
            placeholder="tu@correo.com"
            disponible={correoActivo}
            motivo="Enciende el canal para poder probarlo."
          />
        </div>
      </div>

      {/* ── WhatsApp ───────────────────────────────────────────────────── */}
      <div className={`rounded-lg border border-gray-200 bg-white ${whatsappActivo ? '' : 'opacity-70'}`}>
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
          <MessageCircle className={`h-4 w-4 ${whatsappActivo ? 'text-zero-600' : 'text-gray-400'}`} />
          <span className="flex-1 text-sm font-medium text-gray-900">WhatsApp</span>
          {conectado && (
            <span className="flex items-center gap-1 text-xs font-medium text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Conectado{data?.numeroWhatsapp ? ` · ${data.numeroWhatsapp}` : ''}
            </span>
          )}
          <Interruptor
            activo={whatsappActivo}
            disabled={guardandoCanal === 'whatsapp'}
            etiqueta="Enviar avisos por WhatsApp"
            onCambiar={(v) => void cambiarCanal('whatsapp', v)}
          />
        </div>

        <div className="space-y-3 px-4 py-4">
          <p className="text-sm text-gray-500">
            {whatsappActivo
              ? 'Los recordatorios de cobro le llegan al tutor por WhatsApp, desde el número del colegio. Enlazar la cuenta abre una ventana de Meta donde se confirma el número.'
              : 'Apagado: no sale ningún aviso por WhatsApp. La cuenta enlazada se queda como está.'}
          </p>

          {error && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {error}
              {faltaEmail && (
                <>
                  {' '}
                  <a href="/dashboard/configuracion" className="underline hover:text-zero-600">
                    Ir a Configuración de la empresa
                  </a>.
                </>
              )}
            </p>
          )}

          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </p>
          ) : !configurado ? (
            <div className="space-y-3">
              <Button
                className="bg-zero-600 hover:bg-zero-700"
                disabled={ocupado}
                onClick={() => void llamar('/api/whatsapp/conectar', true)}
              >
                {ocupado ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Conectando…</> : 'Conectar WhatsApp'}
              </Button>

              {/* El otro camino, el de quien ya tiene la cuenta montada. Sin
                  esto, «Conectar» era la única salida y creaba una cuenta
                  nueva —con otro número— encima de la que ya existía. */}
              {!enlazando ? (
                <p className="text-xs text-gray-500">
                  ¿El colegio ya tiene su cuenta en crm-escolar?{' '}
                  <button type="button" onClick={() => setEnlazando(true)}
                    className="font-medium text-zero-600 underline hover:text-zero-700">
                    Enlazarla con su clave
                  </button>
                </p>
              ) : (
                <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-600">
                    Pega la clave del negocio (empieza por <code>sk_live_</code>). Se guarda cifrada
                    y no se vuelve a enseñar.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="password" value={claveNegocio} autoComplete="off"
                      onChange={(e) => setClaveNegocio(e.target.value)}
                      placeholder="sk_live_…"
                      className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 font-mono text-sm outline-none focus:border-zero-600"
                    />
                    <Button size="sm" disabled={ocupado || !claveNegocio.trim()}
                      onClick={() => void enlazar()}>
                      {ocupado ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Enlazando…</> : 'Enlazar'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setEnlazando(false); setClaveNegocio(''); }}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : !conectado ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-700">
                La cuenta está creada pero falta confirmar el número en Meta.
              </p>
              <Button
                variant="outline"
                disabled={ocupado}
                onClick={() => void llamar('/api/whatsapp/estado', true)}
              >
                {ocupado ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Abriendo…</> : 'Terminar el enlace'}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={ocupado}
              onClick={() => void llamar('/api/whatsapp/estado', false)}
            >
              {ocupado ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Revisando…</> : 'Revisar conexión'}
            </Button>
          )}

          <ProbarCanal
            canal="whatsapp" etiqueta="tu WhatsApp"
            placeholder="(809) 000-0000"
            disponible={whatsappActivo && conectado}
            motivo={!conectado
              ? 'Enlaza la cuenta de WhatsApp para poder probarla.'
              : 'Enciende el canal para poder probarlo.'}
          />

          {/* Si el navegador bloqueó la ventana, este es el único sitio donde
              queda el link: sin él hay que volver a pedirlo al servidor. */}
          {linkEnlace && !conectado && (
            <p className="text-xs text-gray-500">
              ¿No se abrió la ventana?{' '}
              <a
                href={linkEnlace}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline hover:text-zero-600"
              >
                Abrir el enlace de WhatsApp
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          )}
        </div>
      </div>

      {/* ── SMS ────────────────────────────────────────────────────────────
          Se deja a la vista apagado en vez de esconderlo: quien viene
          buscando SMS necesita saber que existe y que aún no está listo, no
          quedarse pensando que el sistema no lo hace.

          Aquí no hay botón de conectar y no es un olvido: el SMS no se enlaza
          por colegio como WhatsApp, sale de una sola cuenta de la plataforma
          con un tope de gasto compartido, y quién puede gastar de esa bolsa lo
          decide Zero. Un botón "Conectar SMS" prometería algo que la secretaria
          no puede hacer sola. */}
      <div className={`rounded-lg border border-gray-200 bg-white ${smsDisponible && smsEncendido ? '' : 'opacity-70'}`}>
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
          <Smartphone className={`h-4 w-4 ${smsDisponible && smsEncendido ? 'text-zero-600' : 'text-gray-400'}`} />
          <span className="flex-1 text-sm font-medium text-gray-900">SMS</span>
          {smsDisponible ? (
            smsEncendido && (
              <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Activo
              </span>
            )
          ) : (
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-gray-500">
              Próximamente
            </span>
          )}
          {/* El interruptor solo cuando la plataforma puede mandar SMS: apagar
              algo que de todas formas no sale no significa nada, y encenderlo
              prometería un envío que no existe. */}
          {smsDisponible && (
            <Interruptor
              activo={smsEncendido}
              disabled={guardandoCanal === 'sms'}
              etiqueta="Enviar avisos por SMS"
              onCambiar={(v) => void cambiarCanal('sms', v)}
            />
          )}
        </div>

        <div className="px-4 py-4">
          <p className="text-sm text-gray-500">
            Mensaje de texto para los tutores que no usan WhatsApp.{' '}
            {!smsDisponible
              ? 'Todavía no está disponible; mientras tanto, esos avisos salen por correo.'
              : smsEncendido
                ? 'Ya se puede encender por concepto, en Conceptos.'
                : 'Apagado: no sale ningún SMS, aunque el concepto lo tenga encendido.'}
          </p>

          {/* El aviso del costo va aquí y no en los otros dos: es el único
              canal donde cada prueba se factura, la mande quien la mande y
              exista o no el número. */}
          <ProbarCanal
            canal="sms" etiqueta="tu celular (cada prueba se cobra)"
            placeholder="(809) 000-0000"
            disponible={smsDisponible && smsEncendido}
            motivo={!smsDisponible
              ? 'La plataforma todavía no puede mandar SMS.'
              : 'Enciende el canal para poder probarlo.'}
          />
        </div>
      </div>
    </div>
  );
}
