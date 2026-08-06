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

export function Login({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  const searchParams = useSearchParams();
  const redirect  = searchParams.get('redirect');
  const priceId   = searchParams.get('priceId');
  const inviteId  = searchParams.get('inviteId');
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

          <p className="mt-7 font-[family-name:var(--font-display)] text-[1.75rem] font-normal leading-snug text-zero-100">
            Y no termina.
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

            {/* Sin pantalla de carga completa a propósito: `pending` también se
                prende cuando las credenciales están mal, así que taparía todo
                para después mostrar el error. El botón ya avisa. */}
            <form action={formAction} className="mt-8 space-y-5">
              <input type="hidden" name="redirect" value={redirect || ''} />
              <input type="hidden" name="priceId"  value={priceId  || ''} />
              <input type="hidden" name="inviteId" value={inviteId || ''} />

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
