/**
 * GET /api/contabilidad/cuentas/export — el catálogo de cuentas en Excel.
 *
 * Es también la PLANTILLA de importación: mismas columnas que lee
 * `/api/contabilidad/cuentas/importar`. Se descarga, se trabaja en Excel y se
 * vuelve a subir. El libro se arma en `construirLibroCatalogo`.
 */

import { requirePermission } from '@/lib/auth/api-guard';
import { listarCuentas } from '@/lib/contabilidad/cuentas';
import { respuestaXlsx } from '@/lib/contabilidad/export-xlsx';
import { construirLibroCatalogo } from '@/lib/contabilidad/cuentas-excel-libro';

export async function GET() {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;

  const cuentas = await listarCuentas(auth.teamId, { incluirInactivas: true });
  const hoy = new Date().toISOString().slice(0, 10);
  return respuestaXlsx(construirLibroCatalogo(cuentas), `catalogo-cuentas-${hoy}.xlsx`);
}
