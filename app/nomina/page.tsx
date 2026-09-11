import { redirect } from 'next/navigation';

/**
 * Home del módulo. En T1 no hay panorama todavía: se entra directo a Empleados,
 * la única sección viva. Cuando exista el dashboard de nómina (Fase 3) esto
 * pasa a renderizarlo.
 */
export default function NominaHome() {
  redirect('/nomina/empleados');
}
