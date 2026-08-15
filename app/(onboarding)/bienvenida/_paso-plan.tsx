'use client';

/**
 * Paso 3 — el plan.
 *
 * UNO, no ocho. Aquí es donde se decidió no parecernos a la competencia: a
 * quien acaba de registrarse no se le pone delante una parrilla de precios a
 * ver si adivina, se le dice cuál le toca y por qué. El «ver todos» está, pero
 * discreto: es para el que insiste, no el camino principal.
 *
 * El WhatsApp se pide AQUÍ y no al principio. Para cuando llega esta pantalla
 * ya se le enseñó su empresa, su estado ante la DGII y su plan; el dato se
 * cobra después de haber dado algo. Pedirlo en la primera pantalla es donde la
 * gente cierra la pestaña.
 */

import Link from 'next/link';
import { useActionState } from 'react';
import { Loader2, ArrowRight, Check } from 'lucide-react';
import { terminar } from './actions';
import type { ActionState } from '@/lib/auth/middleware';
import { BILLING_ENABLED } from '@/lib/config/billing';
import { LINEAS_PRODUCTO, precioTotal, type PlanDef } from '@/lib/config/plans';
import { PRUEBA, diasDePrueba } from '@/lib/config/suscripcion';
import type { LineaKey } from '@/lib/onboarding/deducir';

const campo =
  'h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-[15px] text-gray-900 ' +
  'placeholder:text-gray-400 outline-none transition focus:border-zero-500 focus:ring-4 focus:ring-zero-500/10';

export function PasoPlan({ plan, linea, tamano, razonSocial }: {
  plan: PlanDef | null; linea: LineaKey; tamano: number; razonSocial: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    terminar, { error: '' },
  );

  const def = LINEAS_PRODUCTO.find(l => l.key === linea);

  if (!plan || !def) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        No pudimos determinar tu plan. Vuelve atrás e inténtalo de nuevo.
      </p>
    );
  }

  const precio = precioTotal(plan.key, def.addons);
  const esColegio = def.familia === 'colegio';

  // El porqué, con sus propias palabras: es lo que hace que la recomendación
  // se sienta ganada y no empujada.
  const porque = esColegio
    ? `Porque nos dijiste que el colegio tiene hasta ${tamano} estudiantes.`
    : tamano > 500
      ? 'Porque emites más de 500 facturas al mes.'
      : `Porque emites hasta ${tamano} facturas al mes.`;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-zero-600">{razonSocial}</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-[30px] font-semibold tracking-[-0.02em] text-gray-950">
        Tu plan es {plan.name}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-gray-500">{porque}</p>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-[family-name:var(--font-display)] text-[21px] font-semibold text-gray-950">
              {def.nombre} · {plan.name}
            </p>
            <p className="mt-0.5 text-sm text-gray-500">{def.descripcion}</p>
          </div>
          {/* Sin billing encendido no se enseña precio: el plan se asigna
              igual, pero prometer un cobro que todavía no existe confunde. */}
          {BILLING_ENABLED && (
            <p className="shrink-0 text-right">
              <span className="font-[family-name:var(--font-display)] text-[28px] font-bold tabular-nums text-gray-950">
                ${precio}
              </span>
              <span className="block text-xs text-gray-400">USD/mes</span>
            </p>
          )}
        </div>

        {/* El gancho, antes que la lista y en el cuerpo del texto: nombra el
            problema que el cliente ya tiene. Quien lo lee y se reconoce ahí
            sigue leyendo; quien no, no era su producto. */}
        <p className="mt-5 border-t border-gray-100 pt-5 text-[15px] font-medium leading-relaxed text-gray-900">
          {def.gancho}
        </p>

        {/* Primero lo que RESUELVE, después lo que mide.
            Ni `plan.features` —que son claves internas de permisos— ni los
            topes a secas: «Hasta 300 estudiantes · 3 usuarios» es una ficha
            técnica, y una ficha técnica no explica por qué alguien debería
            pagar. Los topes van debajo, en pequeño, porque tienen que estar
            —es lo que se contrata— pero no son el argumento. */}
        <ul className="mt-4 space-y-2.5">
          {def.vende.map((v) => (
            <li key={v} className="flex items-start gap-2.5 text-sm leading-relaxed text-gray-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-zero-600" />
              {v}
            </li>
          ))}
        </ul>

        <p className="mt-5 border-t border-gray-100 pt-4 text-xs text-gray-400">
          {plan.ui.marketingFeatures.slice(0, 3).join(' · ')}
        </p>
      </div>

      <form action={formAction} className="mt-8 space-y-5">
        <div>
          <label htmlFor="telefono" className="mb-2 block text-sm font-medium text-gray-700">
            Tu WhatsApp
          </label>
          <input
            id="telefono" name="telefono" type="tel" inputMode="tel" required
            placeholder="809 555 1234" className={campo}
          />
          <p className="mt-1.5 text-xs text-gray-400">
            Por aquí te avisamos si algo se traba con la DGII. No lo usamos para publicidad.
          </p>
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
          {pending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparando tu cuenta…</>
            : <>Empezar mis {diasDePrueba(def.familia)} días <ArrowRight className="h-4 w-4" /></>}
        </button>

        <p className="text-center text-xs text-gray-400">
          {PRUEBA.pideTarjeta ? 'Se te pedirá una tarjeta.' : 'Sin tarjeta. Cancelas cuando quieras.'}
          {BILLING_ENABLED && (
            <>
              {' · '}
              <Link href="/pricing" className="font-medium text-gray-500 underline underline-offset-2 hover:text-gray-700">
                Ver todos los planes
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
