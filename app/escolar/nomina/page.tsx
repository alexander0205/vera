import { redirect } from 'next/navigation';

/** Como en el módulo Nómina: se entra directo a Empleados. */
export default function NominaGobernanzaHome() {
  redirect('/escolar/nomina/empleados');
}
