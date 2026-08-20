'use client';

/**
 * Piezas comunes del árbol Período → Servicio → Grado → Sección.
 *
 * Las dos pantallas que lo dibujan —Estructura y Tarifas— son trabajos
 * distintos sobre el mismo esqueleto: una edita la jerarquía y la otra le pone
 * precio. Lo que comparten es la forma de leerla, y eso se les había ido
 * separando: una sangraba con `pl-9` fijo y la otra en escalones, una giraba
 * el triángulo y la otra lo cambiaba por otro icono. El mismo colegio se veía
 * como dos aplicaciones al cambiar de pestaña.
 *
 * Aquí vive solo el esqueleto. Lo que va DENTRO de la fila lo pone cada
 * pantalla: en Estructura son los botones de renombrar y mover; en Tarifas, el
 * monto y el aviso de que falta.
 */

import { ChevronRight, GripVertical } from 'lucide-react';

/** Un escalón de sangría, en píxeles. Cambia aquí y cambia en las dos pantallas. */
export const SANGRIA = 22;

export function Fila({ sangria, children, marca, arrastrando, tono, ...resto }: {
  sangria: number;
  children: React.ReactNode;
  /** Lado por el que caería lo arrastrado. Pinta la línea de destino. */
  marca?: 'arriba' | 'abajo' | null;
  arrastrando?: boolean;
  /** Fondo de la fila. `aviso` es el ámbar de "a esto le falta algo". */
  tono?: 'normal' | 'cabecera' | 'aviso';
} & React.HTMLAttributes<HTMLDivElement>) {
  const fondo = tono === 'aviso' ? 'bg-amber-50' : tono === 'cabecera' ? 'bg-gray-50' : '';
  return (
    <div {...resto}
      className={`relative flex items-center gap-2 border-b border-gray-100 py-1.5 pr-3 last:border-0 hover:bg-gray-50/60 ${fondo} ${
        arrastrando ? 'opacity-40' : ''}`}
      style={{ paddingLeft: 8 + sangria * SANGRIA }}>
      {/* La marca va absoluta y no como borde para no empujar la fila 2px al
          pasar el cursor: con la lista entera moviéndose se ve como un temblor. */}
      {marca && (
        <span aria-hidden
          className={`pointer-events-none absolute inset-x-0 h-0.5 bg-zero-500 ${marca === 'arriba' ? 'top-0' : 'bottom-0'}`} />
      )}
      {children}
    </div>
  );
}

/**
 * Triángulo de plegado. Cuando la rama está vacía deja un hueco del mismo
 * ancho en vez de desaparecer: si no, las filas sin hijos se corren a la
 * izquierda y el árbol pierde las columnas.
 */
export function Plegador({ abierto, vacio, onClick }: {
  abierto: boolean; vacio: boolean; onClick: () => void;
}) {
  if (vacio) return <span className="w-[18px] shrink-0" aria-hidden />;
  return (
    <button type="button" onClick={onClick} aria-expanded={abierto}
      className="shrink-0 rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700">
      <ChevronRight className={`h-[18px] w-[18px] transition-transform ${abierto ? 'rotate-90' : ''}`} />
    </button>
  );
}

/**
 * Resumen de lo que hay dentro de una rama cerrada.
 *
 * Se esconde antes que el nombre cuando la fila aprieta: saber que el servicio
 * se llama "Bachillerato Académico…" importa más que saber cuántos grados
 * tiene, y con los dos truncándose a la vez no se leía ninguno.
 */
export function Resumen({ partes, tono }: { partes: string[]; tono?: 'normal' | 'aviso' }) {
  return (
    <span className={`hidden shrink-0 whitespace-nowrap text-xs lg:inline ${
      tono === 'aviso' ? 'text-amber-700' : 'text-gray-400'}`}>
      {partes.join(' · ')}
    </span>
  );
}

/**
 * Nombre de una rama. Se queda con el espacio libre y trunca en una línea en
 * vez de envolver: hay servicios como "Bachillerato Académico en Humanidades y
 * Ciencias Sociales" que partían la fila en cuatro y rompían la alineación.
 */
export function Nombre({ children, onClick, className }: {
  children: React.ReactNode; onClick?: () => void; className: string;
}) {
  const clases = `min-w-0 flex-1 truncate text-left ${className}`;
  const titulo = typeof children === 'string' ? children : undefined;
  if (!onClick) return <span className={clases} title={titulo}>{children}</span>;
  return (
    <button type="button" onClick={onClick} title={titulo} className={clases}>{children}</button>
  );
}

/** Agarradera de arrastre. Solo señal visual: el arrastre lo lleva la fila. */
export function Agarradera() {
  return (
    <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-gray-300 active:cursor-grabbing"
      aria-hidden />
  );
}

/** Etiqueta de tanda (Matutina/Vespertina…). */
export function Tanda({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full bg-zero-100 px-2 py-0.5 text-xs font-medium text-zero-700">
      {children}
    </span>
  );
}

export const plural = (n: number, sing: string, plu: string) => `${n} ${n === 1 ? sing : plu}`;

/** Mismo criterio que la API: por `orden`, y el nombre solo desempata. */
export const porOrden = <T extends { orden: number; nombre: string }>(a: T, b: T) =>
  a.orden - b.orden || a.nombre.localeCompare(b.nombre);
