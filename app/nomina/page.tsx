import { redirect } from 'next/navigation';

/**
 * Home del módulo. Todavía no hay panorama propio: se entra directo a Empleados
 * (la portada de Nómina en el catálogo de pantallas). Si algún día existe el
 * panorama, esto pasa a renderizarlo.
 */
export default function NominaHome() {
  redirect('/nomina/empleados');
}
