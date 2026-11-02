import { usePathname } from 'next/navigation';

/**
 * Dónde viven las pantallas de nómina.
 *
 * Son las mismas en dos sitios: el módulo Nómina (`/nomina`) y Gobernanza
 * (`/escolar/nomina`), para que el colegio haga su nómina sin salir de
 * colegio.zero.com.do —ahí `/nomina` se va al host de facturación—. Un enlace
 * fijo a `/nomina/...` sacaba a la secretaria de Gobernanza al primer clic.
 */
export const NOMINA_EN_GOBERNANZA = '/escolar/nomina';

/** La base de las rutas de nómina para la pantalla en que se está. */
export function baseNomina(pathname: string | null | undefined): string {
  return pathname === NOMINA_EN_GOBERNANZA || pathname?.startsWith(`${NOMINA_EN_GOBERNANZA}/`)
    ? NOMINA_EN_GOBERNANZA
    : '/nomina';
}

/** `ruta('/empleados/nuevo')` → `/nomina/empleados/nuevo` o `/escolar/nomina/empleados/nuevo`. */
export function useRutaNomina(): (resto?: string) => string {
  const base = baseNomina(usePathname());
  return (resto = '') => `${base}${resto}`;
}
