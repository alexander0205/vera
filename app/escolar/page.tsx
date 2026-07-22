import { redirect } from 'next/navigation';

/** Home del módulo: se entra a trabajar sobre estudiantes. */
export default function EscolarPage() {
  redirect('/escolar/estudiantes');
}
