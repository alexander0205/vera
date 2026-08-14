'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react';
import { LogoZero, IsotipoZero } from '@/components/marca-zero';
import { Isotipo } from '@/lib/marca/isotipo';
import { signIn, signUp } from './actions';
import { ActionState } from '@/lib/auth/middleware';

/**
 * Pantalla de entrada.
 *
 * Dos columnas en escritorio: a la izquierda lo que es Zero, a la derecha el
 * formulario. En móvil se cae la columna de la izquierda y queda solo el
 * formulario — quien entra desde el teléfono normalmente ya sabe qué es esto y
 * lo único que quiere es pasar.
 *
 * El isotipo gigante del fondo es decorativo y va detrás del contenido, sin
 * texto encima que dependa de él.
 */

/**
 * Los tropiezos del login con Google, dichos en cristiano.
 *
 * Cada clave la pone una redirección de /api/auth/google o de su callback. Se
 * traducen aquí y no allí porque el mensaje es cosa de la pantalla, y porque
 * un código en la URL no le dice nada a nadie.
 */
const MOTIVOS: Record<string, string> = {
  google_no_disponible: 'Entrar con Google no está disponible ahora mismo. Usa tu correo y contraseña.',
  google_2fa: 'Tu cuenta tiene verificación en dos pasos. Entra con tu correo y contraseña para que te pidamos el código.',
  google_perfil: 'Google no nos confirmó tu correo. Verifícalo en tu cuenta de Google e intenta de nuevo.',
  google_state: 'La sesión con Google no cuadró. Vuelve a intentarlo.',
  google_caducado: 'La sesión con Google caducó. Vuelve a intentarlo.',
  google: 'No pudimos completar la entrada con Google. Intenta de nuevo.',
};

export function Login({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  const searchParams = useSearchParams();
  const redirect  = searchParams.get('redirect');
  const priceId   = searchParams.get('priceId');
  const inviteId  = searchParams.get('inviteId');
  // Lo que salió mal al volver de Google. Sin esto, quien tiene 2FA encendido
  // pulsaba «Continuar con Google», volvía a esta misma pantalla sin nada
  // escrito y no tenía forma de saber por qué.
  const fallo     = MOTIVOS[searchParams.get('error') ?? ''] ?? null;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    mode === 'signin' ? signIn : signUp,
    { error: '' }
  );
  const [showPwd, setShowPwd] = useState(false);

  const campo =
    'h-12 w-full rounded-xl border border-gray-200 bg-gray-50/60 pl-11 pr-4 text-[15px] ' +
    'text-gray-900 placeholder:text-gray-400 outline-none transition ' +
    'focus:border-zero-500 focus:bg-white focus:ring-4 focus:ring-zero-500/10';

  return (
    <div className="grid min-h-[100dvh] bg-gray-50 lg:grid-cols-[1.05fr_1fr]">

      {/* ── Columna de marca ─────────────────────────────────────────────── */}
      <section className="relative hidden overflow-hidden bg-zero-600 px-14 py-12 lg:flex lg:flex-col">
        {/* El isotipo es el símbolo de infinito, así que aquí no hace de adorno
            de fondo: es lo que la frase está señalando. Se sale del encuadre
            para que se lea como algo que continúa. */}
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-48 opacity-[0.13]">
          <Isotipo size={840} color="#ffffff" />
        </div>

        <div className="relative">
          <LogoZero tono="blanco" alto={32} />
        </div>

        <div className="relative my-auto max-w-lg">
          <h1 className="font-[family-name:var(--font-display)] text-[3.5rem] font-bold leading-[1.03] tracking-[-0.035em] text-white">
            Todo empieza<br />desde Zero.
          </h1>

          {/* Sin el isotipo al final de la frase: el logo ya está arriba, y
              repetido a este tamaño competía con el titular en vez de
              acompañarlo. La frase se sostiene sola. */}
          <p className="mt-7 font-[family-name:var(--font-display)] text-[1.75rem] font-normal leading-none text-zero-100">
            Hasta el infinito
          </p>

          <p className="mt-8 max-w-sm text-[15px] leading-relaxed text-zero-100/75">
            Facturación electrónica, punto de venta y gobernanza de colegios.
            Un sistema que crece contigo.
          </p>
        </div>

        <p className="relative text-[13px] text-zero-100/60">
          © {new Date().getFullYear()} Zero
        </p>
      </section>

      {/* ── Columna del formulario ───────────────────────────────────────── */}
      <section className="flex items-center justify-center px-5 py-10 lg:bg-white lg:px-14">
        <div className="w-full max-w-[420px]">

          {/* En móvil no hay columna de marca, así que el logotipo va aquí. */}
          <div className="mb-8 lg:hidden">
            <LogoZero alto={32} />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm lg:border-0 lg:p-0 lg:shadow-none">
            <IsotipoZero lado={56} />

            <h2 className="mt-6 font-[family-name:var(--font-display)] text-[28px] font-semibold tracking-[-0.02em] text-gray-950">
              {mode === 'signin' ? 'Inicia sesión' : 'Crea tu cuenta'}
            </h2>
            <p className="mt-1.5 text-[15px] text-gray-500">
              {mode === 'signin'
                ? 'Accede con la cuenta de tu empresa.'
                : 'Empieza a emitir comprobantes en minutos.'}
            </p>

            {/* Arriba del todo: es la explicación de por qué acabas de volver
                a esta pantalla, y abajo del formulario no se vería. */}
            {fallo && (
              <p role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {fallo}
              </p>
            )}

            {/* Sin pantalla de carga completa a propósito: `pending` también se
                prende cuando las credenciales están mal, así que taparía todo
                para después mostrar el error. El botón ya avisa. */}
            <form action={formAction} className="mt-6 space-y-5">
              <input type="hidden" name="redirect" value={redirect || ''} />
              <input type="hidden" name="priceId"  value={priceId  || ''} />
              <input type="hidden" name="inviteId" value={inviteId || ''} />

              {mode === 'signup' && (
                <div>
                  <label htmlFor="name" className="mb-2 block text-sm font-medium text-gray-700">Nombre completo</label>
                  <input
                    id="name" name="name" type="text" autoComplete="name"
                    defaultValue={state.name ?? ''} required maxLength={100}
                    placeholder="Tu nombre completo" className={campo.replace('pl-11', 'px-4')}
                  />
                </div>
              )}

              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">Email</label>
                <div className="relative">
                  <Mail aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400" />
                  <input
                    id="email" name="email" type="email" autoComplete="email"
                    defaultValue={state.email ?? ''} required maxLength={50}
                    placeholder="tu@empresa.com" className={campo}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-gray-700">Contraseña</label>
                  {mode === 'signin' && (
                    <Link href="/forgot-password" className="text-sm font-medium text-zero-600 transition hover:text-zero-700">
                      ¿Olvidaste tu contraseña?
                    </Link>
                  )}
                </div>
                <div className="relative">
                  <Lock aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400" />
                  <input
                    id="password" name="password"
                    type={showPwd ? 'text' : 'password'}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    defaultValue={state.password ?? ''} required minLength={8} maxLength={100}
                    placeholder="••••••••" className={`${campo} pr-12`}
                  />
                  <button
                    type="button" tabIndex={-1} onClick={() => setShowPwd((v) => !v)}
                    aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                  >
                    {showPwd ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>

              {mode === 'signup' && (
                <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-600">
                  <input
                    type="checkbox" name="terms" required
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-zero-600 focus:ring-zero-500/30"
                  />
                  {/* Los dos documentos abren en pestaña aparte: pedirle a
                      alguien que acepte algo y mandarlo fuera del formulario a
                      medio llenar es la forma segura de que no lo lea y de que
                      además pierda lo escrito. */}
                  <span>
                    Acepto los{' '}
                    <Link href="/terminos" target="_blank" className="font-medium text-zero-600 underline underline-offset-2 transition hover:text-zero-700">
                      Términos y Condiciones
                    </Link>{' '}
                    y el{' '}
                    <Link href="/privacidad" target="_blank" className="font-medium text-zero-600 underline underline-offset-2 transition hover:text-zero-700">
                      Tratamiento de mis datos personales
                    </Link>.
                  </span>
                </label>
              )}

              {state?.error && (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {state.error}
                </p>
              )}

              <button
                type="submit" disabled={pending}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zero-600 text-[15px] font-semibold text-white transition hover:bg-zero-700 disabled:opacity-60"
              >
                {pending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Verificando…</>
                ) : (
                  <>{mode === 'signin' ? 'Ingresar' : 'Crear cuenta'} <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </form>

            {/* Google va DESPUÉS del formulario. Arriba competía con el campo
                de correo por la misma atención, y quien ya tiene su contraseña
                —que es casi todo el que llega aquí— tenía que saltárselo para
                empezar. Entra por una redirección normal (GET) y no por el
                formAction: no hay credenciales que validar, solo se manda a
                /api/auth/google con lo que hace falta recordar cuando vuelva
                (invitación, plan, a dónde regresar).

                En el registro, además, el consentimiento de Google sustituye a
                este formulario, así que el checkbox de Términos se vuelve a
                pedir al volver, en la pantalla de completar registro. */}
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs font-medium uppercase tracking-wide text-gray-400">o</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <a
              href={`/api/auth/google${(() => {
                const qs = new URLSearchParams();
                if (redirect)  qs.set('redirect', redirect);
                if (priceId)   qs.set('priceId', priceId);
                if (inviteId)  qs.set('inviteId', inviteId);
                const s = qs.toString();
                return s ? `?${s}` : '';
              })()}`}
              className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-gray-200 bg-white text-[15px] font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <IconoGoogle />
              Continuar con Google
            </a>

            <p className="mt-8 border-t border-gray-100 pt-6 text-center text-sm text-gray-500">
              {mode === 'signin' ? '¿Tu empresa todavía no usa Zero?' : '¿Ya tienes cuenta?'}{' '}
              <Link
                href={mode === 'signin' ? '/sign-up' : '/sign-in'}
                className="font-semibold text-zero-600 transition hover:text-zero-700"
              >
                {mode === 'signin' ? 'Regístrate gratis' : 'Inicia sesión'}
              </Link>
            </p>
          </div>

          <p className="mt-8 text-center text-[13px] text-gray-400 lg:hidden">
            © {new Date().getFullYear()} Zero
          </p>
        </div>
      </section>
    </div>
  );
}

/**
 * La «G» de Google, con sus cuatro colores oficiales.
 *
 * Va inline y no como icono de la librería porque las directrices de marca de
 * Google no admiten recolorearla ni sustituirla por una versión monocroma: el
 * botón que ofrece «Continuar con Google» tiene que llevar SU logo, tal cual.
 * Por eso los `fill` están escritos a mano y no salen de nuestros tokens.
 */
function IconoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.9c1.7-1.57 2.68-3.87 2.68-6.61z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.19l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.69A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.69V4.98H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.02l3.05-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.98l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}
