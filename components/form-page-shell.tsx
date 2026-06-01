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
