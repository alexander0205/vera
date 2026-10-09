/**
 * GET  /api/administracion-escolar/comprobantes/[id]?monto=  → la previa
 * POST /api/administracion-escolar/comprobantes/[id]  body: { accion, motivo?, ... }
 *
 * Aprobar mueve dinero de verdad —registra el cobro contra la factura— así que
 * exige el permiso de pagos, no el de ver. La previa lo exige igual: dice a qué
 * facturas iría el dinero y cuánto debe cada una, que es la misma información
 * que aprobar, solo que sin escribirla.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import {
  aprobarComprobante, rechazarComprobante, previsualizarAprobacion, ComprobanteError,
} from '@/lib/administracion-escolar/comprobantes';
import type { AjustesAprobacion } from '@/lib/administracion-escolar/comprobantes';
import { METODOS_PAGO_SET } from '@/lib/pagos/metodos';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:pagos');
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Id no válido' }, { status: 400 });

  /**
   * Llega en PESOS, que es lo que el revisor teclea mirando el papel del banco.
   * La conversión a centavos vive aquí y no en el cliente para que sea la misma
   * que hace el POST: si cada lado redondeara por su cuenta, la previa podría
   * repartir un centavo distinto del que acaba entrando.
   */
  const crudo = req.nextUrl.searchParams.get('monto');
  let montoCentavos: number | undefined;
  if (crudo != null && crudo.trim() !== '') {
    const pesos = Number(crudo);
    if (!Number.isFinite(pesos) || pesos <= 0) {
      return NextResponse.json({ error: 'Monto no válido' }, { status: 400 });
    }
    montoCentavos = Math.round(pesos * 100);
  }

  try {
    return NextResponse.json(await previsualizarAprobacion(auth.teamId, id, montoCentavos));
  } catch (e) {
    if (e instanceof ComprobanteError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    console.error('[comprobantes:previa]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo calcular la previa' },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:pagos');
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Id no válido' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const accion = String(body?.accion ?? '');

  try {
    if (accion === 'aprobar') {
      /**
       * Lo que el revisor corrigió mirando el papel. Un ajuste que no cuadra se
       * rechaza con un 400 en vez de ignorarse: quien tecleó "4.800" con punto
       * de miles cree que aprobó RD$4,800, y tragárselo en silencio registraría
       * el monto declarado sin que nadie se entere de la diferencia.
       */
      const ajustes: AjustesAprobacion = {};

      if (body?.montoCentavos != null) {
        const n = Number(body.montoCentavos);
        if (!Number.isInteger(n) || n <= 0) {
          return NextResponse.json({ error: 'El monto no es válido' }, { status: 400 });
        }
        ajustes.montoCentavos = n;
      }

      if (body?.fechaPago != null && String(body.fechaPago).trim() !== '') {
        const f = String(body.fechaPago).trim();
        // `registrarPago` la mete en un `::date` de Postgres: una cadena rara
        // no devuelve vacío, lanza y tumba la petición con un 500 sin decir qué.
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) {
          return NextResponse.json({ error: 'La fecha de pago no es válida' }, { status: 400 });
        }
        ajustes.fechaPago = f;
      }

      if (body?.metodo != null && String(body.metodo).trim() !== '') {
        // Contra la lista canónica: `registrarPago` solo comprueba que no venga
        // vacío, así que un método inventado se guardaría tal cual y luego no
        // cuadraría en el 606/607 ni en el cierre de caja, que agrupan por él.
        const m = String(body.metodo).trim().toLowerCase();
        if (!METODOS_PAGO_SET.has(m)) {
          return NextResponse.json({ error: 'El método de pago no es válido' }, { status: 400 });
        }
        ajustes.metodo = m;
      }

      if (body?.referencia != null) ajustes.referencia = String(body.referencia).trim().slice(0, 120);

      return NextResponse.json({
        ok: true,
        ...await aprobarComprobante(auth.teamId, id, auth.user.id, ajustes),
      });
    }
    if (accion === 'rechazar') {
      await rechazarComprobante(auth.teamId, id, auth.user.id, String(body?.motivo ?? ''));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (e) {
    if (e instanceof ComprobanteError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    console.error('[comprobantes]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo procesar el comprobante' },
      { status: 500 },
    );
  }
}
