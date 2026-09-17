/**
 * GET  /api/compras/local?clase=compra|gasto&desde=&hasta= — compras y gastos registrados
 * POST /api/compras/local                                  — registra un comprobante de proveedor
 *
 * El registro vive en lib/compras/registrar.ts: valida el NCF y las
 * retenciones, mueve el inventario y genera el asiento.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, type AuthErr, type AuthOk } from '@/lib/auth/api-guard';
import { registrarCompra, CompraError } from '@/lib/compras/registrar';
import { marcarCapturaRegistrada } from '@/lib/compras/captura-link';
import { listarCompras } from '@/lib/compras/consultas';
import { METODOS_PAGO_COMPRA, TASAS_ITBIS, TIPOS_PROVEEDOR } from '@/lib/compras/fiscal';
import { esFechaYMD } from '@/lib/nomina/periodos';

const centavos = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

const lineaSchema = z.object({
  productoId: z.number().int().positive().nullable().optional(),
  almacenId: z.number().int().positive().nullable().optional(),
  descripcion: z.string().max(255).nullable().optional(),
  categoria: z.string().max(30).nullable().optional(),
  cantidad: z.number().int().positive(),
  costoUnitarioCents: centavos,
  itbisTasa: z.enum(TASAS_ITBIS),
});

const compraSchema = z.object({
  clase: z.enum(['compra', 'gasto']).default('compra'),
  proveedorRnc: z.string().max(20).nullable().optional(),
  proveedorNombre: z.string().max(255).nullable().optional(),
  tipoProveedor: z.enum(TIPOS_PROVEEDOR).default('juridica'),
  ncf: z.string().max(19),
  ncfModificado: z.string().max(19).nullable().optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipoBienes606: z.string().max(2).nullable().optional(),
  lineas: z.array(lineaSchema).min(1, 'Agrega al menos una línea').max(200),
  itbisAlCostoCents: centavos.nullable().optional(),
  itbisRetenidoCents: centavos.default(0),
  isrTipoRetencion: z.number().int().min(1).max(8).nullable().optional(),
  isrRetenidoCents: centavos.default(0),
  iscCents: centavos.default(0),
  otrosImpuestosCents: centavos.default(0),
  propinaCents: centavos.default(0),
  formaPago: z.enum(['contado', 'credito']),
  metodoPago: z.enum(METODOS_PAGO_COMPRA).default('efectivo'),
  fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  almacenId: z.number().int().positive().nullable().optional(),
  notas: z.string().max(1000).nullable().optional(),
  permitirNcfRepetido: z.boolean().optional(),
  /** La captura de foto de la que salió este registro, para marcarla registrada. */
  capturaId: z.number().int().positive().nullable().optional(),
});

/** Compras exige gestionar productos; un gasto también lo puede registrar quien crea facturas. */
async function autorizar(clase: 'compra' | 'gasto', escritura: boolean): Promise<AuthOk | AuthErr> {
  const productos = await requirePermission(escritura ? 'productos:gestionar' : 'productos:ver', { escritura });
  if (productos.ok || clase === 'compra') return productos;
  return requirePermission(escritura ? 'facturas:crear' : 'facturas:ver', { escritura });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = compraSchema.safeParse(body);
  if (!parsed.success) {
    const primero = parsed.error.issues[0];
    return NextResponse.json({ error: primero?.message ?? 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }
  const auth = await autorizar(parsed.data.clase, true);
  if (!auth.ok) return auth.response;

  try {
    const r = await registrarCompra(auth.teamId, auth.user.id, {
      ...parsed.data,
      proveedorRnc: parsed.data.proveedorRnc ?? null,
      proveedorNombre: parsed.data.proveedorNombre ?? null,
    });
    // Sacar la captura de la cola: quedó hecha compra. Acotado por team; no
    // rompe el registro si falla (la compra ya está).
    if (parsed.data.capturaId) {
      try {
        await marcarCapturaRegistrada(auth.teamId, parsed.data.capturaId, r.compraId);
      } catch (e) {
        console.error('[compras/local] no se pudo marcar la captura', e);
      }
    }
    return NextResponse.json({ ok: true, ...r }, { status: 201 });
  } catch (e) {
    if (e instanceof CompraError) {
      return NextResponse.json({ error: e.message, codigo: e.codigo, compraId: e.compraId }, { status: e.status });
    }
    console.error('[compras/local] registro falló', e);
    return NextResponse.json({ error: 'No se pudo registrar' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const clase = sp.get('clase') === 'gasto' ? 'gasto' : sp.get('clase') === 'compra' ? 'compra' : undefined;
  const auth = await autorizar(clase ?? 'compra', false);
  if (!auth.ok) return auth.response;
  const desde = sp.get('desde');
  const hasta = sp.get('hasta');
  const compras = await listarCompras(auth.teamId, {
    clase,
    desde: esFechaYMD(desde) ? desde : undefined,
    hasta: esFechaYMD(hasta) ? hasta : undefined,
  });
  return NextResponse.json({ compras });
}
