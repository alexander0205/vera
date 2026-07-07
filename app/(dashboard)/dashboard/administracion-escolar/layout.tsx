import { requirePermission } from '@/lib/auth/page-guard';

/**
 * Server-side gate: solo roles con administracion-escolar:ver pueden acceder
 * a cualquier página bajo /dashboard/administracion-escolar. Redirige a
 * /dashboard si no. Sub-rutas mas estrictas (ej. configuracion) agregan su
 * propio requirePermission encima de este.
 */
export default async function AdministracionEscolarLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('administracion-escolar:ver');
  return <>{children}</>;
}
