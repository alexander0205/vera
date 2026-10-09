/**
 * POST /api/nomina/empleados/importar — carga empleados y salarios desde Excel.
 *
 * multipart/form-data:
 *   archivo  — el .xlsx (el mismo formato que descarga `/plantilla`)
 *   aplicar  — '1' para guardar. Sin él es solo la vista previa.
 *
 * La vista previa y la aplicación son LA MISMA corrida —ver `importarEmpleados`—:
 * la previa se deshace al final, así lo que la pantalla anuncia es lo que pasa.
 * Permiso `empleados:gestionar`, igual que crear un empleado a mano: el archivo
 * trae salarios y cuentas bancarias.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { leerFilasEmpleados } from '@/lib/nomina/empleados-excel';
import { ArchivoEmpleadosError, leerHojaEmpleados } from '@/lib/nomina/empleados-excel-libro';
import { importarEmpleados } from '@/lib/nomina/empleados-importar';
import { logAudit, getIp } from '@/lib/audit';
import { hoyRD } from '@/lib/utils/format';
import { revisarZip } from '@/lib/zip-seguro';

export const dynamic = 'force-dynamic';

/** 1000 empleados en xlsx no llegan a 1 MB: más es un archivo equivocado. */
const MAX_BYTES = 2 * 1024 * 1024;
/** Lo que un .xlsx de 1000 empleados ocupa descomprimido es de unos pocos MB; esto deja mucho aire. */
const LIMITES_ZIP = { maxBytesDescomprimidos: 40 * 1024 * 1024, maxEntradas: 100 };

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  // Antes de leer el cuerpo: un archivo enorme no debe cargarse entero en memoria para rechazarlo.
  const declarado = Number(req.headers.get('content-length') ?? 0);
  if (declarado > MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'El archivo pasa de 2 MB. Una lista de empleados no pesa tanto: revisa que sea el archivo correcto.' }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Se esperaba el archivo en multipart/form-data.' }, { status: 400 });
  }

  const archivo = form.get('archivo');
  if (!(archivo instanceof File)) return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 });
  if (archivo.size === 0) return NextResponse.json({ error: 'El archivo está vacío.' }, { status: 400 });
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json({ error: 'El archivo pasa de 2 MB. Una lista de empleados no pesa tanto: revisa que sea el archivo correcto.' }, { status: 413 });
  }
  const aplicar = form.get('aplicar') === '1';

  const buffer = await archivo.arrayBuffer();
  // Un .xlsx es un zip: un PDF o un .xls renombrado, o una bomba zip, se rechazan antes de abrirlo.
  const zip = revisarZip(buffer, LIMITES_ZIP);
  if (!zip.ok) {
    return NextResponse.json({ error: `${zip.error} Si es un .xls o un .csv, ábrelo en Excel y guárdalo como .xlsx.` }, { status: 400 });
  }

  let matriz: unknown[][];
  try {
    matriz = await leerHojaEmpleados(buffer);
  } catch (e) {
    if (e instanceof ArchivoEmpleadosError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  const lectura = leerFilasEmpleados(matriz, hoyRD());

  // Sin una sola fila utilizable no hay nada que correr contra la base.
  if (lectura.filas.length === 0) {
    return NextResponse.json({
      aplicado: false, creados: [], actualizados: [], omitidos: [], sinCambios: 0, avisos: lectura.avisos,
      errores: lectura.errores.length > 0
        ? lectura.errores
        : [{ fila: 1, cedula: '', mensaje: 'El archivo no tiene ningún empleado.' }],
    });
  }

  const resultado = await importarEmpleados(auth.teamId, auth.user.id, lectura.filas, {
    aplicar, erroresDeLectura: lectura.errores, avisosDeLectura: lectura.avisos,
  });

  if (resultado.aplicado) {
    logAudit({
      teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email,
      action: 'NOMINA_EMPLEADOS_IMPORTADOS', ip: getIp(req),
      meta: {
        archivo: archivo.name.slice(0, 120),
        creados: resultado.creados.length,
        actualizados: resultado.actualizados.length,
        sinCambios: resultado.sinCambios,
        omitidos: resultado.omitidos.length,
      },
    });
  }

  return NextResponse.json(resultado);
}
