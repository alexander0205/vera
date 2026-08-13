import { requirePermission } from '@/lib/auth/page-guard';
import { DocumentosShell } from './_shell';

/**
 * El permiso se comprueba UNA vez aquí y vale para las dos pestañas y el
 * editor — mismo patrón que app/escolar/configuracion/layout.tsx. El editor
 * no tiene su propio guard: entrar a construir un formulario exige el mismo
 * `configurar` que entrar a la lista.
 */
export default async function DocumentosLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('administracion-escolar:configurar');
  return <DocumentosShell>{children}</DocumentosShell>;
}
