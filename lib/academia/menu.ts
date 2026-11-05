/**
 * Qué lleva el pie de los menús laterales (después de la lista de pantallas):
 *  - el bloque «Módulos», solo si hay OTROS módulos a donde ir (quien tiene uno
 *    solo no ve un bloque «Módulos» suelto);
 *  - la Academia, como ítem propio. Con bloque «Módulos» arriba comparte su
 *    separador (nunca dos líneas seguidas); sin él, trae el suyo.
 *  - en el menú de la propia Academia no se ofrece otra vez: ya está su ítem.
 */
export interface PieDeMenu {
  bloqueModulos: boolean;
  academia: boolean;
  separadorPropioAcademia: boolean;
}

export function pieDeMenu(otrosModulos: number, esMenuDeLaAcademia: boolean, academiaActiva = true): PieDeMenu {
  const bloqueModulos = otrosModulos > 0;
  // Sin videos publicados, la Academia no sale en ningún menú.
  const academia = !esMenuDeLaAcademia && academiaActiva;
  return { bloqueModulos, academia, separadorPropioAcademia: academia && !bloqueModulos };
}
