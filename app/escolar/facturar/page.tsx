import { requirePermission } from '@/lib/auth/page-guard';
import FacturarLoteClient from './_page-client';

export const metadata = { title: 'Facturar por lote · Zero Colegios' };

/**
 * Crear las facturas (en borrador) de muchos alumnos de una vez.
 *
 * El permiso se comprueba aquí además de en la ruta: quien no puede gestionar el
 * colegio no tiene por qué ver una pantalla que solo sirve para crear
 * documentos, y la API lo rechazaría de todos modos al primer clic. Es el mismo
 * permiso que «Cobrar a un grupo» y que la ruta de facturar a mano.
 */
export default async function FacturarLotePage() {
  await requirePermission('administracion-escolar:gestionar');
  return <FacturarLoteClient />;
}
