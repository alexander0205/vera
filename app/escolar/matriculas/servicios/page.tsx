import { requirePermission } from '@/lib/auth/page-guard';
import ServiciosPorAlumno from './_page-client';

/**
 * «Servicios por alumno»: la cuadrícula alumnos × conceptos para agregar o
 * quitar conceptos por lote, aplicar paquetes y subir la hoja de carga. Cambia
 * lo que se le cobra a cada matrícula: es gestionar.
 */
export default async function ServiciosPorAlumnoPage() {
  await requirePermission('administracion-escolar:gestionar');
  return <ServiciosPorAlumno />;
}
