/**
 * La sala de espera del correo.
 *
 * Quien se registra con contraseña acaba aquí hasta que abre el enlace. Es un
 * callejón a propósito: no hay «continuar» ni «saltar», porque el objetivo es
 * justamente que no se pueda pasar sin demostrar que el correo es suyo.
 *
 * Lo único que se ofrece es reenviar y salir. Nada de esperar en bucle
 * refrescando: el enlace se abre en la pestaña donde llegue el correo —a
 * menudo el teléfono— y desde allí ya entra.
 *
 * Quien entra por Google no ve esta pantalla nunca: llega con el correo
 * verificado por Google, y pedírselo otra vez sería hacerle demostrar dos
 * veces lo mismo.
 */

import { redirect } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { IsotipoZero } from '@/components/marca-zero';
import { getUser } from '@/lib/db/queries';
import { Reenviar } from './_reenviar';

export const metadata = { title: 'Verifica tu correo · Zero' };

export default async function VerificaTuCorreoPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  // Ya verificó —típicamente abrió el enlace en otra pestaña y volvió a esta—:
  // no tiene nada que hacer aquí.
  if (user.emailVerified) redirect('/bienvenida');

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-5 py-10">
      <div className="w-full max-w-[440px]">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <IsotipoZero lado={56} />

          <h1 className="mt-6 font-[family-name:var(--font-display)] text-[28px] font-semibold tracking-[-0.02em] text-gray-950">
            Revisa tu correo
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-gray-500">
            Te mandamos un enlace para confirmar que esta dirección es tuya. Ábrelo y
            seguimos donde lo dejamos.
          </p>

          <div className="mt-6 flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3.5">
            <MailCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-zero-600" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{user.email}</p>
              <p className="mt-0.5 text-sm text-gray-500">
                El enlace vale por 24 horas.
              </p>
            </div>
          </div>

          {/* Lo primero que hace todo el mundo cuando no le llega. Decirlo antes
              ahorra el mensaje a soporte. */}
          <p className="mt-5 text-sm leading-relaxed text-gray-500">
            ¿No te llega? Mira en la carpeta de correo no deseado — es donde suele
            caer el primero.
          </p>

          <Reenviar />

          <p className="mt-6 border-t border-gray-100 pt-5 text-center text-sm text-gray-500">
            ¿Te equivocaste de correo?{' '}
            <a href="/sign-in" className="font-semibold text-zero-600 transition hover:text-zero-700">
              Empieza de nuevo
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
