import { Isotipo } from '@/lib/marca/isotipo';

/**
 * Lo que se ve mientras `Login` todavía no está.
 *
 * No es adorno: `Login` lee `useSearchParams`, así que va dentro de un
 * <Suspense> y con PPR el shell estático de /sign-in y /sign-up es justo lo que
 * este componente pinte. Sin `fallback` el shell salía VACÍO —el HTML del
 * servidor traía 51 caracteres, solo el <title>— y quien llegaba por navegación
 * suave, como al cerrar sesión, se quedaba mirando una pantalla en blanco hasta
 * recargar a mano.
 *
 * Repite el marco de dos columnas de `login.tsx` a propósito: así lo que se
 * pinta primero ya tiene la forma final y al llegar el formulario no salta.
 */
export function EsqueletoDeAcceso() {
  return (
    <div className="grid min-h-[100dvh] bg-gray-50 lg:grid-cols-[1.05fr_1fr]">
      <section
        aria-hidden
        className="relative hidden overflow-hidden bg-zero-600 px-14 py-12 lg:flex lg:flex-col"
      >
        <div className="pointer-events-none absolute -bottom-32 -right-48 opacity-[0.13]">
          <Isotipo size={840} color="#ffffff" />
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm" role="status" aria-label="Cargando">
          <div className="h-7 w-40 animate-pulse rounded-lg bg-gray-200" />
          <div className="mt-3 h-4 w-56 animate-pulse rounded bg-gray-100" />
          <div className="mt-8 space-y-4">
            <div className="h-12 w-full animate-pulse rounded-xl bg-gray-100" />
            <div className="h-12 w-full animate-pulse rounded-xl bg-gray-100" />
          </div>
          <div className="mt-6 h-12 w-full animate-pulse rounded-xl bg-gray-200" />
        </div>
      </section>
    </div>
  );
}
