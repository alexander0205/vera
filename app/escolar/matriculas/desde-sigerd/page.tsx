import { requirePermission } from '@/lib/auth/page-guard';
import MatricularDesdeSigerd from './_page-client';

/**
 * «Matricular desde SIGERD», a pantalla completa.
 *
 * Era un diálogo que solo enseñaba los nombres y matriculaba a todos con todo.
 * Aquí se revisa alumno por alumno antes de crear nada: a quién se deja fuera,
 * qué concepto no le toca y a qué precio paga.
 *
 * Matricular es gestionar: el aviso que trae aquí solo lo ve quien tiene ese
 * permiso, y la dirección escrita a mano no puede ser una puerta de atrás.
 */
export default async function MatricularDesdeSigerdPage() {
  await requirePermission('administracion-escolar:gestionar');
  return <MatricularDesdeSigerd />;
}
