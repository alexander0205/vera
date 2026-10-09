'use client';

/**
 * El checkbox y el botón. Lo único que necesita cliente de esta pantalla, así
 * que vive aparte para que la página siga siendo Server Component y el token
 * se verifique en el servidor.
 *
 * El token viaja en un campo oculto y NO es un dato del usuario: va firmado, y
 * la acción lo vuelve a verificar antes de crear nada. Cambiarlo desde el
 * navegador no sirve de nada.
 */

import Link from 'next/link';
import { useActionState } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { completarRegistro } from './actions';
import type { ActionState } from '@/lib/auth/middleware';

export function FormularioCompletar({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    completarRegistro,
    { error: '' },
  );

  const enlace =
    'font-medium text-zero-600 underline underline-offset-2 transition hover:text-zero-700';

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <input type="hidden" name="t" value={token} />

      <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-600">
        <input
          type="checkbox" name="terms" required
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-zero-600 focus:ring-zero-500/30"
        />
        {/* En pestaña aparte: mandarlo fuera con el alta a medias es la forma
            segura de que no vuelva. */}
        <span>
          Acepto los{' '}
          <Link href="/terminos" target="_blank" className={enlace}>Términos y Condiciones</Link>
          {' '}y el{' '}
          <Link href="/privacidad" target="_blank" className={enlace}>
            Tratamiento de mis datos personales
          </Link>.
        </span>
      </label>

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
          <><Loader2 className="h-4 w-4 animate-spin" /> Creando tu cuenta…</>
        ) : (
          <>Crear mi cuenta <ArrowRight className="h-4 w-4" /></>
        )}
      </button>
    </form>
  );
}
