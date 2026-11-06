import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { emparejarExtracto, importarExtracto, ConciliacionError } from '@/lib/contabilidad/conciliacion';
import { ExtractoError } from '@/lib/contabilidad/extracto';
import { limpiarFilasConfirmadas } from '@/lib/contabilidad/extracto-ia';
import { hoyRD } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

const METODOS = ['ia-pdf', 'ia-pdf-archivo', 'ia-columnas'] as const;

/**
 * POST /api/contabilidad/bancos/extracto/ia/confirmar
 *   { cuentaId, archivoNombre?, metodo, modelo?, filas: [{ fila, fecha, descripcion, referencia, montoCents, saldoCents }] }
 *
 * La persona vio la lectura con IA y confirma. Se importan EXACTAMENTE las filas
 * que revisó (la IA no se vuelve a llamar: daría otra lectura y costaría de
 * nuevo), pero el servidor las valida otra vez: fechas, montos y topes. Después
 * se empareja con el libro, igual que la subida normal. El archivo nunca se guardó.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  const cuentaId = Number(body.cuentaId);
  if (!Number.isSafeInteger(cuentaId) || cuentaId <= 0) return NextResponse.json({ error: 'Elige la cuenta del estado de cuenta.' }, { status: 400 });
  const metodo = METODOS.find((m) => m === body.metodo);
  if (!metodo) return NextResponse.json({ error: 'Método de lectura inválido.' }, { status: 400 });

  try {
    const lectura = limpiarFilasConfirmadas(body.filas, hoyRD());
    const nombre = typeof body.archivoNombre === 'string' ? body.archivoNombre.slice(0, 255) : null;
    const importacion = await importarExtracto({ teamId: auth.teamId, userId: auth.user.id, cuentaId, archivoNombre: nombre, lectura });
    const emparejado = await emparejarExtracto(auth.teamId, auth.user.id, cuentaId);
    logAudit({
      teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'CONTABILIDAD_MOVIMIENTO_BANCARIO',
      resource: `extracto:${importacion.extractoId}`, ip: getIp(req),
      // `modelo` lo reporta la pantalla (el consumo real queda en ia_consumo con su modelo).
      meta: { cuentaId, metodo: 'ia', lectura: metodo, modelo: typeof body.modelo === 'string' ? body.modelo.slice(0, 80) : null, filas: lectura.filas.length, ...importacion, ...emparejado },
    });
    return NextResponse.json({ vista: false, importacion, emparejado, errores: [], totalErrores: 0 });
  } catch (e) {
    if (e instanceof ExtractoError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof ConciliacionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
