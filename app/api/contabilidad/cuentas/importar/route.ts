/**
 * POST /api/contabilidad/cuentas/importar — sube el catálogo desde Excel.
 *
 * multipart/form-data:
 *   archivo  — el .xlsx (el mismo formato que descarga `/export`)
 *   aplicar  — '1' para guardar. Sin él es solo la vista previa.
 *
 * La vista previa y la aplicación son LA MISMA corrida —ver
 * `importarCatalogo`—: la previa se deshace al final. Así lo que la pantalla
 * anuncia es exactamente lo que después pasa, sin una validación «de mentira»
 * que pueda discrepar de la real.
 *
 * Permiso `contabilidad:configurar`, igual que crear una cuenta a mano: el
 * catálogo define cómo se clasifica todo lo que viene después.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { leerFilasCatalogo } from '@/lib/contabilidad/cuentas-excel';
import { leerHojaCatalogo, ArchivoCatalogoError } from '@/lib/contabilidad/cuentas-excel-libro';
import { importarCatalogo } from '@/lib/contabilidad/cuentas-importar';
import { logAudit, getIp } from '@/lib/audit';

/** Un catálogo de miles de cuentas en xlsx no llega a 1 MB. */
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:configurar', { escritura: true });
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Se esperaba el archivo en multipart/form-data.' }, { status: 400 });
  }

  const archivo = form.get('archivo');
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 });
  }
  if (archivo.size === 0) {
    return NextResponse.json({ error: 'El archivo está vacío.' }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json({ error: 'El archivo pasa de 2 MB. Un catálogo de cuentas no pesa tanto: revisa que sea el archivo correcto.' }, { status: 413 });
  }

  const aplicar = form.get('aplicar') === '1';

  // Leer el Excel. Un .xls viejo, un CSV o un PDF renombrado revientan aquí, y
  // eso se le dice al usuario en vez de devolver un 500.
  let matriz: unknown[][];
  try {
    matriz = await leerHojaCatalogo(await archivo.arrayBuffer());
  } catch (e) {
    if (e instanceof ArchivoCatalogoError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const lectura = leerFilasCatalogo(matriz);

  // Sin una sola fila utilizable no hay nada que correr contra la base.
  if (lectura.filas.length === 0) {
    return NextResponse.json({
      aplicado: false, creadas: [], actualizadas: [], sinCambios: 0,
      errores: lectura.errores.length > 0
        ? lectura.errores
        : [{ fila: 1, codigo: '', mensaje: 'El archivo no tiene ninguna cuenta.' }],
    });
  }

  const resultado = await importarCatalogo(auth.teamId, auth.user.id, lectura.filas, {
    aplicar,
    erroresDeLectura: lectura.errores,
  });

  if (resultado.aplicado) {
    logAudit({
      teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email,
      action: 'CONTABILIDAD_CATALOGO_IMPORTADO', ip: getIp(req),
      meta: {
        archivo: archivo.name,
        creadas: resultado.creadas.length,
        actualizadas: resultado.actualizadas.length,
        sinCambios: resultado.sinCambios,
      },
    });
  }

  return NextResponse.json(resultado);
}
