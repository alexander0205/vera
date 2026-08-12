import type { ReactNode } from 'react';

/**
 * FormPageShell — Shell para páginas de formulario con barra de acciones inferior.
 *
 * PROBLEMA QUE RESUELVE:
 * El shell del dashboard usa `<main className="flex-1 overflow-y-auto">` (el main
 * scrollea, no el body). Una barra inferior con `sticky bottom-0` SOLO queda
 * pegada al fondo si su contenedor es `min-h-full flex flex-col` y la barra usa
 * `mt-auto`. Sin esa estructura, cuando el contenido es corto la barra "flota"
 * a media pantalla y deja un hueco gris abajo.
 *
 * USO:
 *   <FormPageShell className="bg-[#eef0f7]">
 *     <div className="p-4 flex-1 flex flex-col">
 *       ...contenido...
 *       <BottomActionBar ... />   // último hijo; ya trae mt-auto + sticky
 *     </div>
 *   </FormPageShell>
 *
 * REGLA: el contenedor directo de la barra debe ser `flex flex-col` y la barra
 * el último hijo con `mt-auto`. `BottomActionBar` ya trae `mt-auto sticky bottom-0`.
 *
 * REGLA 2 — el padding vertical del contenedor también hay que anularlo:
 * un elemento `sticky` no puede salirse del content box de su bloque contenedor.
 * Si el wrapper tiene `p-5`, la barra se detiene 20px ANTES del fondo y aparece
 * una franja gris al llegar al final del scroll. El `-mx-*` que ya se usa para
 * sangrar a lo ancho necesita su gemelo `-mb-*` con el MISMO valor por breakpoint:
 *
 *   wrapper `p-3 sm:p-4 md:p-5`  →  barra `-mx-3 sm:-mx-4 md:-mx-5 -mb-3 sm:-mb-4 md:-mb-5`
 *   wrapper `p-4 sm:p-6`         →  barra `-mx-4 sm:-mx-6 -mb-4 sm:-mb-6`
 *
 * El síntoma engaña porque solo se ve con el scroll AL FONDO: a media página la
 * barra sí queda pegada, y el hueco aparece únicamente en el último tramo.
 */
export function FormPageShell({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`min-h-full flex flex-col ${className}`}>{children}</div>;
}
