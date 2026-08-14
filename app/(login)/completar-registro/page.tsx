/**
 * El último paso del alta con Google.
 *
 * Google ya nos dijo quién es y que su correo está verificado, pero no le
 * podemos pedir dentro de su pantalla que acepte NUESTROS términos. Así que se
 * para aquí: se le enseña con qué cuenta va a entrar —para que descubra ahora,
 * y no dentro, que eligió la cuenta equivocada de las tres que tiene abiertas—
 * y se le pide lo único que falta.
 *
 * Un solo campo. Todo lo demás ya está resuelto y volver a preguntarlo sería
 * hacerle escribir lo que ya sabemos.
 */

import { redirect } from 'next/navigation';
import { IsotipoZero } from '@/components/marca-zero';
import { leerPendiente } from '@/lib/auth/google';
import { FormularioCompletar } from './_form';

export const metadata = { title: 'Completa tu registro · Zero' };

export default async function CompletarRegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  if (!t) redirect('/sign-in');

  let pendiente;
  try {
    pendiente = await leerPendiente(t);
  } catch {
    // Caducado o manipulado: al login, sin explicar de más.
    redirect('/sign-in?error=google_caducado');
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-5 py-10">
      <div className="w-full max-w-[420px]">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <IsotipoZero lado={56} />

          <h1 className="mt-6 font-[family-name:var(--font-display)] text-[28px] font-semibold tracking-[-0.02em] text-gray-950">
            Un paso y ya
          </h1>
          <p className="mt-1.5 text-[15px] text-gray-500">
            Google nos confirmó tu identidad. Solo falta que aceptes las reglas.
          </p>

          {/* La cuenta, bien visible: quien tiene la personal y la del trabajo
              abiertas a la vez se equivoca aquí constantemente, y descubrirlo
              después de crear la empresa cuesta soporte. */}
          <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3">
            <p className="text-sm font-medium text-gray-900">{pendiente.nombre || 'Tu cuenta'}</p>
            <p className="text-sm text-gray-500">{pendiente.email}</p>
          </div>

          <FormularioCompletar token={t} />

          <p className="mt-6 border-t border-gray-100 pt-5 text-center text-sm text-gray-500">
            ¿No eres tú?{' '}
            <a href="/sign-in" className="font-semibold text-zero-600 transition hover:text-zero-700">
              Entrar con otra cuenta
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
