import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { cuentasBanco } from '@/lib/contabilidad/bancos';
import { interpretarExtracto, ExtractoError } from '@/lib/contabilidad/extracto';
import { leerMatrizExtracto, MAX_BYTES_EXTRACTO } from '@/lib/contabilidad/extracto-archivo';
import {
  armarVistaIa, esPdf, faltanColumnas, leerPdfConIa, mapearColumnasConIa, LecturaIaError, MAX_BYTES_PDF,
} from '@/lib/contabilidad/extracto-ia';
import {
  crearLlamadaModelo, extraerTextoPdf, iaConciliacionDisponible, permitirIa,
} from '@/lib/contabilidad/conciliacion-ia-servidor';
import { hoyRD } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';
// Un PDF de 30 páginas puede tardar: el principal y el respaldo suman.
export const maxDuration = 120;

/**
 * POST /api/contabilidad/bancos/extracto/ia — lee con IA un estado de cuenta que
 * las reglas no pueden leer (un PDF, o un CSV/Excel de columnas raras).
 *   multipart: `archivo`, `cuentaId`
 *
 * SOLO vista previa: no importa nada. Devuelve las filas completas con su
 * comprobación contra los saldos del banco; la pantalla las enseña («Leído con IA
 * · revisa antes de importar») y, si la persona confirma, manda ESAS filas a
 * `/ia/confirmar`. El archivo no se guarda.
 *
 * Con CSV/Excel se prueban primero las reglas: si bastan, responde
 * `{ reglasBastan: true }` y la pantalla usa la subida de siempre (sin gasto).
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;

  if (!iaConciliacionDisponible()) {
    return NextResponse.json({ error: 'La lectura con IA no está disponible. Sube el estado de cuenta en CSV o Excel.' }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const archivo = form?.get('archivo');
  const cuentaId = Number(form?.get('cuentaId'));
  if (!(archivo instanceof File)) return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 });
  if (!Number.isSafeInteger(cuentaId) || cuentaId <= 0) return NextResponse.json({ error: 'Elige la cuenta del estado de cuenta.' }, { status: 400 });
  if (archivo.size === 0) return NextResponse.json({ error: 'El archivo está vacío.' }, { status: 400 });

  const banco = (await cuentasBanco(auth.teamId)).find((c) => c.id === cuentaId && c.imputable && c.activa);
  if (!banco) return NextResponse.json({ error: 'Esa cuenta no es una caja o un banco activo de la empresa.' }, { status: 400 });

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const pdf = esPdf(bytes);
  if (archivo.size > (pdf ? MAX_BYTES_PDF : MAX_BYTES_EXTRACTO)) {
    return NextResponse.json({ error: pdf ? 'El PDF pasa de 10 MB. Sube el estado de cuenta por tramos (por ejemplo, un mes).' : 'El archivo pasa de 5 MB. Sube el estado de cuenta por tramos (por ejemplo, un mes).' }, { status: 413 });
  }

  try {
    // CSV/Excel: las reglas primero (gratis y exactas).
    let matriz: unknown[][] | null = null;
    if (!pdf) {
      matriz = await leerMatrizExtracto(archivo.name, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      try {
        interpretarExtracto(matriz);
        return NextResponse.json({ reglasBastan: true });
      } catch (e) {
        if (!faltanColumnas(e)) throw e;
      }
    }

    const permiso = await permitirIa('lectura', auth.teamId);
    if (!permiso.ok) return NextResponse.json({ error: permiso.mensaje }, { status: permiso.status });

    const llamar = crearLlamadaModelo({ teamId: auth.teamId, userId: auth.user.id });
    const lectura = pdf
      ? await leerPdfConIa(Buffer.from(bytes), { llamar, extraerTexto: extraerTextoPdf, hoy: hoyRD() })
      : await mapearColumnasConIa(matriz!, { llamar });
    return NextResponse.json(armarVistaIa(lectura));
  } catch (e) {
    if (e instanceof LecturaIaError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ExtractoError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
