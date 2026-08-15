'use client';

/**
 * Formulario de solicitud de demo.
 *
 * Manda de verdad: POST a `/api/contacto`, que envía el correo por Resend y
 * responde 500 si Resend falla. La maqueta simulaba el envío con un
 * `setTimeout(900)` y siempre daba las gracias; eso aquí sería una promesa
 * falsa —el visitante se queda esperando una llamada que nadie va a hacer— así
 * que el error del servidor se enseña tal cual, con las dos vías que sí
 * funcionan (WhatsApp y correo) al lado.
 *
 * La ruta ya trae límite por IP (3 envíos cada 10 minutos); cuando responde 429
 * su mensaje se muestra igual que cualquier otro error.
 */

import { useState } from 'react';
import { CONTACTO, Cheque, IconoWhatsApp, Iconos } from '../_piezas';

type Perfil = 'pyme' | 'colegio';

const TAMANOS: Record<Perfil, string[]> = {
  pyme: ['1 a 3 usuarios', '4 a 8 usuarios', 'Más de 8', 'Varias sucursales'],
  colegio: ['Hasta 150 estudiantes', '151 a 300', '301 a 500', 'Más de 500'],
};

const TEMAS: Record<Perfil, string[]> = {
  pyme: ['Facturación electrónica', 'Punto de venta', 'Inventario', 'Contabilidad', 'Multi-sucursal', 'Migrar desde Excel'],
  colegio: ['Cuotas y matrículas', 'Cobro automático a padres', 'Recordatorios por WhatsApp', 'Portal de padres', 'Contabilidad', 'Migrar desde Excel'],
};

type Errores = Partial<Record<'nombre' | 'empresa' | 'email' | 'telefono', string>>;

const claseCampo = (malo: boolean) =>
  `h-11 w-full rounded-[11px] border-[1.5px] px-3.5 text-[13.5px] text-[#0f1118] outline-none transition placeholder:text-[#a8aebc] focus:border-zero-600 ${
    malo ? 'border-[#e9a5a5] bg-[#fef7f7]' : 'border-[#e4e7f0] bg-[#fafbfe]'
  }`;

export function FormularioContacto() {
  const [perfil, setPerfil] = useState<Perfil>('pyme');
  const [nombre, setNombre] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [tamano, setTamano] = useState<string | null>(null);
  const [temas, setTemas] = useState<string[]>([]);
  const [errores, setErrores] = useState<Errores>({});
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  function cambiarPerfil(p: Perfil) {
    setPerfil(p);
    // Las opciones de tamaño y de temas cambian con el perfil: dejar marcada
    // «Hasta 150 estudiantes» en una ferretería mandaría basura al buzón.
    setTamano(null);
    setTemas([]);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;

    const errs: Errores = {};
    if (!nombre.trim()) errs.nombre = 'Dinos cómo te llamas.';
    if (!empresa.trim()) errs.empresa = perfil === 'pyme' ? 'Falta el nombre de tu negocio.' : 'Falta el nombre del colegio.';
    const correo = email.trim();
    if (!correo) errs.email = 'Necesitamos un correo.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) errs.email = 'Ese correo no parece válido.';
    const digitos = telefono.replace(/\D/g, '');
    if (!digitos) errs.telefono = 'Déjanos un teléfono.';
    else if (digitos.length < 10) errs.telefono = 'Faltan dígitos.';

    if (Object.keys(errs).length) { setErrores(errs); return; }

    setErrores({});
    setFallo(null);
    setEnviando(true);
    try {
      const res = await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          empresa: empresa.trim(),
          email: correo,
          telefono: telefono.trim(),
          mensaje: mensaje.trim(),
          perfil,
          tamano: tamano ?? undefined,
          temas: temas.length ? temas : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'No se pudo enviar la solicitud.');
      }
      setEnviado(true);
    } catch (err) {
      setFallo(err instanceof Error ? err.message : 'No hay conexión con el servidor.');
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="rounded-2xl border border-[#e9ebf3] bg-white p-7 shadow-[0_2px_8px_rgba(16,42,114,.05)] sm:p-8">
        <div className="py-10 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-[#edf1fe]">
            <Cheque tamano={30} color="#3658e1" grosor={2.6} />
          </div>
          <div className="mt-5 font-[family-name:var(--font-display)] text-[21px] font-semibold tracking-[-.5px]">
            Recibimos tu mensaje
          </div>
          <p className="mx-auto mt-2.5 max-w-[380px] text-pretty text-[13.5px] leading-relaxed text-gray-500">
            Un especialista te escribe al correo y al WhatsApp que dejaste. Dentro del horario de
            ventas contestamos el mismo día; fuera de él, a primera hora del siguiente día laborable.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            <a
              href={CONTACTO.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-[42px] items-center gap-2 rounded-[11px] bg-[#25a366] px-5 font-[family-name:var(--font-display)] text-[13px] font-semibold text-white transition hover:bg-[#1f8b57]"
            >
              <IconoWhatsApp />
              Escribir por WhatsApp
            </a>
            <button
              type="button"
              onClick={() => { setEnviado(false); setNombre(''); setEmpresa(''); setEmail(''); setTelefono(''); setMensaje(''); setTamano(null); setTemas([]); }}
              className="h-[42px] cursor-pointer rounded-[11px] border border-[#e6e8f0] bg-white px-5 text-[13px] font-medium text-[#4a5164] transition hover:border-zero-600 hover:text-zero-600"
            >
              Enviar otro mensaje
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="rounded-2xl border border-[#e9ebf3] bg-white p-6 shadow-[0_2px_8px_rgba(16,42,114,.05)] sm:p-8">
      <div className="text-[11px] font-semibold uppercase tracking-[.9px] text-zero-600">Solicita tu demo</div>
      <h2 className="mt-3.5 font-[family-name:var(--font-display)] text-[clamp(1.35rem,4vw,1.56rem)] font-semibold tracking-[-.9px]">
        Cuéntanos de tu operación
      </h2>
      <p className="mt-2 text-pretty text-[13px] leading-relaxed text-gray-500">
        30 minutos con un especialista: vemos tu operación módulo por módulo y te dejamos el
        presupuesto por escrito.
      </p>

      <fieldset className="mt-6">
        <legend className="mb-2.5 block text-[12.5px] font-semibold text-[#3b4252]">
          ¿Qué tipo de operación tienes?
        </legend>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {([
            { clave: 'pyme' as const, titulo: 'Soy una pyme', detalle: 'Comercio o servicios', icono: Iconos.tienda },
            { clave: 'colegio' as const, titulo: 'Soy un colegio', detalle: 'Institución educativa', icono: Iconos.colegio },
          ]).map(q => {
            const on = perfil === q.clave;
            return (
              <button
                key={q.clave}
                type="button"
                onClick={() => cambiarPerfil(q.clave)}
                aria-pressed={on}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] p-3.5 text-left transition ${
                  on ? 'border-zero-600 bg-[#f5f8ff]' : 'border-[#e4e8f4] bg-white hover:border-[#c9d3f5]'
                }`}
              >
                <span className={`grid size-[34px] shrink-0 place-items-center rounded-[10px] ${on ? 'bg-zero-600 text-white' : 'bg-[#f2f4fa] text-[#4a5164]'}`}>
                  <q.icono tamano={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-[family-name:var(--font-display)] text-[13.5px] font-semibold ${on ? 'text-[#102a72]' : 'text-[#0f1118]'}`}>
                    {q.titulo}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-gray-500">{q.detalle}</span>
                </span>
                <span className={`grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] ${on ? 'border-zero-600 bg-zero-600' : 'border-[#d2d7e4] bg-white'}`}>
                  {on && <span className="size-1.5 rounded-full bg-white" />}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo id="nombre" etiqueta="Nombre y apellido" error={errores.nombre}>
          <input
            id="nombre"
            value={nombre}
            onChange={e => { setNombre(e.target.value); setErrores(x => ({ ...x, nombre: undefined })); }}
            placeholder="Ana Pérez"
            autoComplete="name"
            className={claseCampo(!!errores.nombre)}
          />
        </Campo>

        <Campo
          id="empresa"
          etiqueta={perfil === 'pyme' ? 'Nombre del negocio' : 'Nombre del colegio'}
          error={errores.empresa}
        >
          <input
            id="empresa"
            value={empresa}
            onChange={e => { setEmpresa(e.target.value); setErrores(x => ({ ...x, empresa: undefined })); }}
            placeholder={perfil === 'pyme' ? 'Ferretería del Este' : 'Colegio San Rafael'}
            autoComplete="organization"
            className={claseCampo(!!errores.empresa)}
          />
        </Campo>

        <Campo id="email" etiqueta="Correo" error={errores.email}>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setErrores(x => ({ ...x, email: undefined })); }}
            placeholder="ana@tuempresa.com.do"
            autoComplete="email"
            className={claseCampo(!!errores.email)}
          />
        </Campo>

        <Campo id="telefono" etiqueta="Teléfono o WhatsApp" error={errores.telefono}>
          <input
            id="telefono"
            type="tel"
            value={telefono}
            onChange={e => { setTelefono(e.target.value); setErrores(x => ({ ...x, telefono: undefined })); }}
            placeholder="809 000 0000"
            autoComplete="tel"
            className={`${claseCampo(!!errores.telefono)} tabular-nums`}
          />
        </Campo>
      </div>

      <fieldset className="mt-5">
        <legend className="mb-2.5 block text-[12.5px] font-semibold text-[#3b4252]">
          {perfil === 'pyme' ? '¿De qué tamaño es tu equipo?' : '¿Cuántos estudiantes tienes?'}
        </legend>
        <div className="flex flex-wrap gap-2">
          {TAMANOS[perfil].map(t => {
            const on = tamano === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTamano(on ? null : t)}
                aria-pressed={on}
                className={`h-[34px] cursor-pointer rounded-full border px-3.5 text-[12.5px] font-medium transition ${
                  on ? 'border-zero-600 bg-zero-600 text-white' : 'border-[#dce1f0] bg-white text-[#4a5164] hover:border-zero-600'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="mb-2.5 block text-[12.5px] font-semibold text-[#3b4252]">¿Qué te interesa resolver?</legend>
        <div className="flex flex-wrap gap-2">
          {TEMAS[perfil].map(t => {
            const on = temas.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTemas(s => (on ? s.filter(x => x !== t) : [...s, t]))}
                aria-pressed={on}
                className={`flex h-[34px] cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-medium transition ${
                  on ? 'border-zero-600 bg-[#f5f8ff] text-[#2a48c4]' : 'border-[#dce1f0] bg-white text-[#4a5164] hover:border-zero-600'
                }`}
              >
                {on && <Cheque tamano={12} grosor={3} />}
                {t}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5">
        <label htmlFor="mensaje" className="mb-2 block text-[12.5px] font-semibold text-[#3b4252]">
          Cuéntanos brevemente <span className="font-normal text-gray-500">(opcional)</span>
        </label>
        <textarea
          id="mensaje"
          rows={3}
          value={mensaje}
          onChange={e => setMensaje(e.target.value)}
          placeholder="Hoy facturamos en Excel y llevamos las cuotas en una libreta…"
          className="w-full resize-y rounded-[11px] border-[1.5px] border-[#e4e7f0] bg-[#fafbfe] p-3.5 text-[13.5px] leading-relaxed text-[#0f1118] outline-none transition placeholder:text-[#a8aebc] focus:border-zero-600"
        />
      </div>

      {fallo && (
        <div role="alert" className="mt-5 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3">
          <p className="text-[13px] font-semibold text-[#b91c1c]">No pudimos enviar tu solicitud</p>
          <p className="mt-1 text-pretty text-[12.5px] leading-relaxed text-[#b91c1c]/90">
            {fallo} Escríbenos por WhatsApp al{' '}
            <a href={CONTACTO.whatsappHref} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              {CONTACTO.whatsapp}
            </a>{' '}
            o a{' '}
            <a href={`mailto:${CONTACTO.ventas}`} className="font-semibold underline">{CONTACTO.ventas}</a>.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="mt-5 h-12 w-full cursor-pointer rounded-xl bg-zero-600 font-[family-name:var(--font-display)] text-sm font-semibold text-white shadow-[0_12px_26px_-12px_rgba(54,88,225,.75)] transition hover:bg-zero-700 disabled:cursor-wait disabled:opacity-70"
      >
        {enviando ? 'Enviando…' : 'Solicitar demo'}
      </button>
      <p className="mt-3 text-pretty text-center text-[11.5px] text-gray-500">
        Al enviar aceptas que te contactemos por correo o WhatsApp. Nunca compartimos tus datos.
      </p>
    </form>
  );
}

function Campo({
  id, etiqueta, error, children,
}: {
  id: string;
  etiqueta: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-semibold text-[#3b4252]">{etiqueta}</label>
      {children}
      {error && <div className="mt-1.5 text-[11.5px] text-[#b91c1c]">{error}</div>}
    </div>
  );
}
