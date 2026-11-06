/**
 * POST /api/contabilidad/activos-fijos — registra un activo fijo (Nivel 4.2).
 *
 * Es POST, nunca efecto de un GET: escribe. Requiere `contabilidad:gestionar`.
 * El listado se renderiza en la página (server), sin API, como los reportes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { registrarActivoFijo, ActivoFijoError } from '@/lib/contabilidad/depreciacion';
import { catalogoImputable } from '@/lib/contabilidad/config';
import { esCuentaCajaBanco, esCuentaDeActivoFijo } from '@/lib/contabilidad/activos-fijos';
import { invalidarPlanta } from '@/lib/cache/escolar';

export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;

  let body: {
    nombre?: string; costoCents?: number; valorResidualCents?: number;
    vidaUtilMeses?: number; fechaAdquisicion?: string;
    cantidad?: number; ubicacion?: string | null; categoria?: string | null;
    soloControl?: boolean; espacioId?: number | null;
    /** Pagado de contado y sin factura con NCF: la caja o el banco del que salió el dinero; con ella se asienta la compra. */
    cuentaPagoId?: number | null;
    /** Ya está en los libros: dónde está su costo (null = la de su categoría) y lo que lleva depreciado, en centavos. */
    libros?: { cuentaActivoId?: number | null; deprecAcumCents?: number } | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const { imputables } = await catalogoImputable(auth.teamId);
  let pago: { cuentaPagoId: number } | null = null;
  if (body.cuentaPagoId != null) {
    const cuentaPagoId = Number(body.cuentaPagoId);
    const c = imputables.get(cuentaPagoId);
    if (!Number.isSafeInteger(cuentaPagoId) || !c || !esCuentaCajaBanco(c.codigo)) {
      return NextResponse.json({ error: 'Elige una cuenta de caja o banco de tu empresa.' }, { status: 400 });
    }
    pago = { cuentaPagoId };
  }
  let libros: { cuentaActivoId: number | null; deprecAcumCents: number } | null = null;
  if (body.libros) {
    if (pago) return NextResponse.json({ error: 'Elige una sola: pagado de contado o ya en libros.' }, { status: 400 });
    const cuentaActivoId = body.libros.cuentaActivoId == null ? null : Number(body.libros.cuentaActivoId);
    if (cuentaActivoId !== null) {
      const c = imputables.get(cuentaActivoId);
      if (!Number.isSafeInteger(cuentaActivoId) || !c || !esCuentaDeActivoFijo(c.codigo)) {
        return NextResponse.json({ error: 'Elige una cuenta de activos fijos de tu empresa.' }, { status: 400 });
      }
    }
    libros = { cuentaActivoId, deprecAcumCents: Number(body.libros.deprecAcumCents ?? 0) };
  }

  try {
    const id = await registrarActivoFijo(
      auth.teamId,
      {
        nombre: String(body.nombre ?? ''),
        costoCents: Number(body.costoCents ?? 0),
        valorResidualCents: Number(body.valorResidualCents ?? 0),
        vidaUtilMeses: Number(body.vidaUtilMeses ?? 0),
        fechaAdquisicion: String(body.fechaAdquisicion ?? ''),
        cantidad: body.cantidad === undefined ? 1 : Number(body.cantidad),
        ubicacion: typeof body.ubicacion === 'string' ? body.ubicacion : null,
        categoria: typeof body.categoria === 'string' && body.categoria ? body.categoria : null,
        soloControl: body.soloControl === true,
      },
      auth.user.id,
      { espacioId: Number.isSafeInteger(Number(body.espacioId)) && Number(body.espacioId) > 0 ? Number(body.espacioId) : null, pago, libros },
    );
    if (body.espacioId) invalidarPlanta(auth.teamId);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    if (e instanceof ActivoFijoError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
