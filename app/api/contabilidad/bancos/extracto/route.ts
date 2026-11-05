import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { bandejaExtracto, importarExtracto, emparejarExtracto, ConciliacionError } from '@/lib/contabilidad/conciliacion';
import { interpretarExtracto, ExtractoError } from '@/lib/contabilidad/extracto';
import { leerMatrizExtracto, MAX_BYTES_EXTRACTO } from '@/lib/contabilidad/extracto-archivo';

export const dynamic = 'force-dynamic';

const idValido = (v: unknown) => {
  const x = Number(v);
  return Number.isSafeInteger(x) && x > 0 ? x : null;
};

/**
 * GET /api/contabilidad/bancos/extracto?cuentaId=…
 * Lo importado del estado de cuenta de una cuenta de banco y lo que falta
 * resolver: pendientes, depósitos sin identificar, retiros sin registrar.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;
  const cuentaId = idValido(new URL(req.url).searchParams.get('cuentaId'));
  if (!cuentaId) return NextResponse.json({ error: 'Elige una cuenta' }, { status: 400 });
  try {
    return NextResponse.json(await bandejaExtracto(auth.teamId, cuentaId));
  } catch (e) {
    if (e instanceof ConciliacionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

/**
 * POST /api/contabilidad/bancos/extracto — sube el estado de cuenta.
 *   multipart: `archivo` (.csv o .xlsx), `cuentaId`, `aplicar` ('1' para guardar)
 *
 * Sin `aplicar` es solo la vista previa: qué columnas se reconocieron, cuántos
 * movimientos y qué filas no se pudieron leer. Con `aplicar` se importa (lo ya
 * importado de un tramo anterior no se duplica) y se empareja con el libro.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;

  const form = await req.formData().catch(() => null);
  const archivo = form?.get('archivo');
  const cuentaId = idValido(form?.get('cuentaId'));
  if (!(archivo instanceof File)) return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 });
  if (!cuentaId) return NextResponse.json({ error: 'Elige la cuenta del estado de cuenta.' }, { status: 400 });
  if (archivo.size === 0) return NextResponse.json({ error: 'El archivo está vacío.' }, { status: 400 });
  if (archivo.size > MAX_BYTES_EXTRACTO) {
    return NextResponse.json({ error: 'El archivo pasa de 5 MB. Sube el estado de cuenta por tramos (por ejemplo, un mes).' }, { status: 413 });
  }

  try {
    const matriz = await leerMatrizExtracto(archivo.name, await archivo.arrayBuffer());
    const lectura = interpretarExtracto(matriz);

    if (form?.get('aplicar') !== '1') {
      return NextResponse.json({
        vista: true,
        columnas: lectura.columnas,
        total: lectura.filas.length,
        entradasCents: lectura.filas.filter((f) => f.montoCents > 0).reduce((s, f) => s + f.montoCents, 0),
        salidasCents: -lectura.filas.filter((f) => f.montoCents < 0).reduce((s, f) => s + f.montoCents, 0),
        desde: lectura.filas.map((f) => f.fecha).sort()[0] ?? null,
        hasta: lectura.filas.map((f) => f.fecha).sort().at(-1) ?? null,
        muestra: lectura.filas.slice(0, 8),
        errores: lectura.errores.slice(0, 30),
        totalErrores: lectura.errores.length,
      });
    }

    const importacion = await importarExtracto({
      teamId: auth.teamId, userId: auth.user.id, cuentaId, archivoNombre: archivo.name, lectura,
    });
    const emparejado = await emparejarExtracto(auth.teamId, auth.user.id, cuentaId);
    logAudit({
      teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'CONTABILIDAD_MOVIMIENTO_BANCARIO',
      resource: `extracto:${importacion.extractoId}`, ip: getIp(req),
      meta: { cuentaId, ...importacion, ...emparejado },
    });
    return NextResponse.json({ vista: false, importacion, emparejado, errores: lectura.errores.slice(0, 30), totalErrores: lectura.errores.length });
  } catch (e) {
    if (e instanceof ExtractoError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof ConciliacionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
